const fs = require('fs')
const cors = require('cors')
const http = require('http')
const path = require('path')
const helmet = require('helmet')
const WebSocket = require('ws')
const express = require('express')
const compression = require('compression')
const { database } = require('./database')
require('dotenv').config({ path: '.env.local' })

const MODEL_LOCATION = 'AlphaZeroAgent/trained_model'

const app = express()
const server = http.createServer(app)
const websocket_server = new WebSocket.Server({ server, path: process.env.VITE_WEBSOCKET_PATH })

app.use(compression())
app.use(express.json())
app.use(express.static(path.join(__dirname, 'build')))
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'defaultSrc': ["'self'"],
      'script-src': ["'self'", 'cdn.skypack.dev'],
      'style-src': ["'self'", 'fonts.googleapis.com'],
      'font-src': ["'self'", 'fonts.gstatic.com'],
      'worker-src': ["'self'", 'cdn.skypack.dev'],
    }
  }
}))

app.post('/save-game', (req, res) => {
  const { gameid, game } = req.body
  database.set(gameid, game).then(() => res.status(200).send({ result: { success: true } }))
})

app.post('/fetch-game', (req, res) => {
  const { gameid } = req.body
  database.get(gameid).then(value => res.status(200).send({ result: value }))
})

var active_clients = {}

websocket_server.on('connection', ws => {
  ws.on('message', message => {
    message = JSON.parse(message)
    let { register: reg_id, name, gameid, context } = message
    if (reg_id) {
      if (!(reg_id in active_clients))
        active_clients[reg_id] = []
      active_clients[reg_id] = active_clients[reg_id].filter(socket => socket.readyState === WebSocket.OPEN)
      active_clients[reg_id].push(ws)
      active_clients[reg_id].forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN)
          client.send(JSON.stringify({ name }))
      })
    } else if (context) {
      let { player, ...game } = context
      database.set(gameid, game)
      if (gameid in active_clients) {
        active_clients[gameid].forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN)
            client.send(JSON.stringify(context))
        })
      }
    }
  })
})

app.get('/check-saved-model', (_, res) => res.status(200).send({ found: fs.existsSync(`./${MODEL_LOCATION}/model.json`) }))

app.get('/model/:file', cors(), (req, res) => res.sendFile(path.join(__dirname, MODEL_LOCATION, req.params.file)))

app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'build', 'index.html')))

server.listen(process.env.PORT, () => {
  console.log(`Application is running at ${process.env.PORT}`)
})