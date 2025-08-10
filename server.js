/*
 * deno add npm:hono/deno npm:dotenv
 * deno --allow-read --allow-env --unstable-kv --allow-net --unstable-broadcast-channel server.js
 */


import dotenv from 'dotenv'
import { cors } from 'hono/cors'
import { serveStatic, upgradeWebSocket } from 'hono/deno'
import { existsSync } from 'https://deno.land/std/fs/mod.ts'
import { Hono } from 'https://deno.land/x/hono@v3.4.1/mod.ts'

dotenv.config({ path: '.env.local' })

const SAVED_MODEL_PATH = 'AlphaZeroAgent/trained_model'


const app = new Hono()
const kv = await Deno.openKv()


const local_sockets = {}
const global_game_rooms = {}


function updateGlobalRooms({ data }) {
  const { type, room_id, socket_id } = data
  if (type === 'add') {
    if (!(room_id in global_game_rooms))
      global_game_rooms[room_id] = new Set()
    global_game_rooms[room_id].add(socket_id)
  } else if (type === 'remove') {
    if (room_id in global_game_rooms) {
      global_game_rooms[room_id].delete(socket_id)
      if (global_game_rooms[room_id].size === 0)
        delete global_game_rooms[room_id]
    }
  }
}


function broadcastMessage(gameid, uuid, message) {
  const remote_socket_ids = []
  for (const socket_id of global_game_rooms[gameid].values()) {
    if (socket_id !== uuid) {
      if (socket_id in local_sockets)
        local_sockets[socket_id].send(JSON.stringify(message))
      else
        remote_socket_ids.push(socket_id)
    }
  }
  channel.postMessage({ type: 'transmit', socket_ids: remote_socket_ids, message })
}


function closeWebSocket(socket_id) {
  const socket = local_sockets[socket_id]
  updateGlobalRooms({ data: { type: 'remove', room_id: socket.roomid, socket_id }})
  channel.postMessage({ type: 'remove', room_id: socket.roomid, socket_id })
  delete local_sockets[socket_id]
  socket.close()
}


const channel = new BroadcastChannel('uttt-channel')  // a BroadcastChannel used by all isolates (instances)
channel.onmessage = ({ data }) => {                   // when a new message comes in from other isolates
  const { type } = data
  if (type === 'add' || type === 'remove')
    updateGlobalRooms({ data })
  else if (type === 'transmit') {
    const { socket_ids, message } = data
    for (const socket_id of socket_ids)
      if (socket_id in local_sockets)
        local_sockets[socket_id].send(JSON.stringify(message))
  }
}


app.get(
  `/${process.env.VITE_WEBSOCKET_PATH}`,
  upgradeWebSocket(_context => {
    const uuid = crypto.randomUUID()
    return {
      onOpen: (_event, socket) => local_sockets[uuid] = socket,
      onClose: () => closeWebSocket(uuid),
      onError: error => console.error(error),
      onMessage({ data: message }, socket) {
        const { type, gameid, name, context } = JSON.parse(message)
        if (type === 'register') {
          socket.roomid = gameid
          updateGlobalRooms({ data: { type: 'add', room_id: gameid, socket_id: uuid }})
          channel.postMessage({ type: 'add', room_id: gameid, socket_id: uuid })
          broadcastMessage(gameid, uuid, { name })
        } else if (type === 'move') {
          const { player, ...game } = context
          kv.set(['uttt-namespace', gameid], game)
          if (gameid in global_game_rooms)
            broadcastMessage(gameid, uuid, context)
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
app.get('/check-saved-model', context => context.json({ found: existsSync(`./${SAVED_MODEL_PATH}/model.json`) }))
app.get('/model/:file', _ => serveStatic({ path: `${SAVED_MODEL_PATH}/{context.req.param('file')}` }))


// only used when called from localhost
app.use('/assets/*', serveStatic({ root: 'build' }))
app.get('*', serveStatic({ path: 'build/index.html' }))




const controller = new AbortController()
const server = Deno.serve({
  port: process.env.PORT,
  signal: controller.signal,
  onListen: ({ port }) => console.info(`App server listening on ${port}`)
}, app.fetch)


Deno.addSignalListener('SIGINT', async () => {
  controller.abort()
  for (const socket_id in local_sockets)
    closeWebSocket(socket_id)
  channel.close()
  await server.finished
  console.info('App server closed gracefully')
  Deno.exit(0)
})