/*
 * deno add npm:hono/deno npm:dotenv
 * deno --allow-read --allow-env --unstable-kv --allow-net server.js
 */


import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { cors } from 'hono/cors'
import { serveStatic, upgradeWebSocket } from 'hono/deno'
import { existsSync } from 'https://deno.land/std/fs/mod.ts'
import { Hono } from 'https://deno.land/x/hono@v3.4.1/mod.ts'


const SAVED_MODEL_PATH = 'AlphaZeroAgent/trained_model'


const app = new Hono()
const kv = await Deno.openKv()

const active_clients = {}


app.get(
  `/${process.env.VITE_WEBSOCKET_PATH}`,
  upgradeWebSocket(context => {
    return {
      onError: error => console.error(error),
      onMessage({ data: message }, socket) {
        message = JSON.parse(message)
        let { register: register_id, name, gameid, context } = message
        if (register_id) {
          if (!(register_id in active_clients))
            active_clients[register_id] = []
          active_clients[register_id] = active_clients[register_id].filter(socket => socket.readyState === WebSocket.OPEN)
          active_clients[register_id].push(socket)
          active_clients[register_id].forEach(client => {
            if (client !== socket && client.readyState === WebSocket.OPEN)
              client.send(JSON.stringify({ name }))
          })
        } else if (context) {
          let { player, ...game } = context
          kv.set(['uttt-namespace', gameid], game)
          if (gameid in active_clients) {
            active_clients[gameid].forEach(client => {
              if (client !== socket && client.readyState === WebSocket.OPEN)
                client.send(JSON.stringify(context))
            })
          }
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


Deno.serve({
  port: process.env.PORT,
  onListen: ({ port }) => console.log(`server listening on ${port}`)
}, app.fetch)