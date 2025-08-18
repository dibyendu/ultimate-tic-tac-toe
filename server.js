/*
 * deno add npm:hono/deno npm:dotenv
 * deno --allow-read --allow-env --allow-net --unstable-kv --unstable-broadcast-channel server.js
 */


import dotenv from 'dotenv'
import { cors } from 'hono/cors'
import { serveStatic, upgradeWebSocket } from 'hono/deno'
import { existsSync } from 'https://deno.land/std/fs/mod.ts'
import { Hono } from 'https://deno.land/x/hono@v3.4.1/mod.ts'

dotenv.config({ path: '.env.local' })


const instance_id = crypto.randomUUID()


const app = new Hono()
const kv = await Deno.openKv()
const channel = new BroadcastChannel('uttt-channel')   // a BroadcastChannel used by all isolates (instances)




const global_rooms = {}                                // { room_id_1: Set([ socket_id_1, socket_id_2, ... ]) }
const local_sockets = {}                               // { socket_id_1: WebSocket(...) }
const runnings_instances = {}




channel.onmessage = ({ data }) => {                    // when a new message comes in from other isolates (instances)
  const { type } = data

  if (type === 'sync') {
    const { sender } = data
    const rooms = {}
    for (const room_id in global_rooms)
      rooms[room_id] = [...global_rooms[room_id]]
    channel.postMessage({ type: 'sync-ack', sender: instance_id, recipient: sender, rooms })
  }
  else if (type === 'sync-ack') {
    const { sender, recipient, rooms } = data
    if (recipient === instance_id) {
      runnings_instances[sender] = rooms
      if (Object.values(runnings_instances).every(val => val !== null)) {
        const merged_rooms = {}
        for (const rooms of Object.values(runnings_instances)) {
          for (const room_id in rooms) {
            const room = new Set(rooms[room_id])
            if (room_id in merged_rooms)
              merged_rooms[room_id] = merged_rooms[room_id].intersection(room)
            else
              merged_rooms[room_id] = room
          }
        }
        for (const room_id in merged_rooms) {
          if (room_id in global_rooms)
            global_rooms[room_id] = global_rooms[room_id].union(merged_rooms[room_id])
          else
            global_rooms[room_id] = merged_rooms[room_id]
        }
      }
    }
  }
  else if (type === 'add' || type === 'remove')
    updateGlobalRooms({ data })
  else if (type === 'transmit') {
    const { socket_ids, message } = data
    for (const socket_id of socket_ids)
      if (socket_id in local_sockets)
        local_sockets[socket_id].send(JSON.stringify(message))
  }
}


function updateGlobalRooms({ data }) {
  const { type, rooms } = data
  if (type === 'add') {
    for (const room_id in rooms) {
      const socket_ids = new Set(rooms[room_id])
      if (room_id in global_rooms)
        global_rooms[room_id] = global_rooms[room_id].union(socket_ids)
      else
        global_rooms[room_id] = socket_ids
    }
  } else if (type === 'remove') {
    for (const room_id in rooms) {
      const socket_ids = new Set(rooms[room_id])
      if (room_id in global_rooms) {
        global_rooms[room_id] = global_rooms[room_id].difference(socket_ids)
        if (global_rooms[room_id].size === 0)
          delete global_rooms[room_id]
      }
    }
  }
}


function broadcastMessage(room_id, sender, message) {
  const remote_sockets = []
  for (const id of global_rooms[room_id].values()) {
    if (id !== sender) {
      if (id in local_sockets)
        local_sockets[id].send(JSON.stringify(message))
      else
        remote_sockets.push(id)
    }
  }
  channel.postMessage({ type: 'transmit', socket_ids: remote_sockets, message })
}


function closeWebSocket(socket_ids) {
  const rooms = {}
  for (const socket_id of socket_ids) {
    const socket = local_sockets[socket_id]
    if (socket.roomid in rooms)
      rooms[socket.roomid].push(socket_id)
    else
      rooms[socket.roomid] = [socket_id]
    delete local_sockets[socket_id]
    socket.close()
  }
  updateGlobalRooms({ data: { type: 'remove', rooms }})
  channel.postMessage({ type: 'remove', rooms })
}



await kv.set(['uttt-namespace', 'running-instance-id', instance_id], null)
const entries = kv.list({ prefix: ['uttt-namespace', 'running-instance-id'] })
for await (const { key: [, , id] } of entries) {
  if (id !== instance_id)
    runnings_instances[id] = null
}

channel.postMessage({ type: 'sync', sender: instance_id })


app.get(
  `/${process.env.VITE_WEBSOCKET_PATH}`,
  upgradeWebSocket(_context => {
    const socket_id = crypto.randomUUID()
    return {
      onOpen: (_event, socket) => local_sockets[socket_id] = socket,
      onClose: () => closeWebSocket([socket_id]),
      onError: error => console.error(error),
      onMessage({ data: message }, socket) {
        const { type, gameid, name, context } = JSON.parse(message)
        if (type === 'register') {
          socket.roomid = gameid
          updateGlobalRooms({ data: { type: 'add', rooms: { [gameid]: [socket_id] }}})
          channel.postMessage({ type: 'add', rooms: { [gameid]: [socket_id] }})
          broadcastMessage(gameid, socket_id, { name })
        } else if (type === 'move') {
          const { player, ...game } = context
          kv.set(['uttt-namespace', gameid], game)
          if (gameid in global_rooms)
            broadcastMessage(gameid, socket_id, context)
        }
      }
    }
  })
)


app.use('*', cors())

app.post('/save-game', async context => {
  const { gameid, game } = await context.req.json()
  await kv.set(['uttt-namespace', gameid], game)
  return context.json({ result: { success: true } })
})
app.post('/fetch-game', async context => {
  const { gameid } = await context.req.json()
  const { value: game } = await kv.get(['uttt-namespace', gameid])
  return context.json({ result: game })
})




// only used when called from localhost
app.use('/ultimate-tic-tac-toe/assets/*', serveStatic({ root: 'build/' }))
app.get('*', serveStatic({ path: 'build/index.html' }))




const controller = new AbortController()
const server = Deno.serve({
  port: process.env.PORT,
  signal: controller.signal,
  onListen: ({ port }) => console.info(`App server listening on ${port}`)
}, app.fetch)


Deno.addSignalListener('SIGINT', async () => {
  controller.abort()
  closeWebSocket(Object.keys(local_sockets))
  channel.close()
  await kv.delete(['uttt-namespace', 'running-instance-id', instance_id])
  await server.finished
  console.info('App server closed gracefully')
  Deno.exit(0)
})