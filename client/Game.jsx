import React, { useState, useEffect } from 'react'
import GameContext, { InitialContext } from './GameContext'
import { setUpWebSocket, checkStatus, parseJSON } from './util'
import { SERVER_URL } from './config'
import Board from './Board'


function Modal({ visible, setVisible, gameid }) {

  const [name, setName] = useState('')
  const [message, setMessage] = useState('')

  return (
    <div className='modal-overlay' style={{ display: visible ? 'block' : 'none' }}>
      <div className='modal-container' style={{ width: '25%' }}>
        <span className='f-left'>Name</span><br /><input className='f-left' placeholder={message} maxLength={10} value={name} onChange={({ target: { value } }) => setName(value)} /><br /><br />
        <span className='f-right'><button onClick={() => {
          if (!name) {
            setMessage('Enter a valid name')
            return
          }
          localStorage.setItem(gameid, name)
          setVisible(false)
        }}>Start</button></span><br />
      </div>
    </div>
  )
}

function Game({ gameid }) {

  const [modalVisible, setModalVisible] = useState(false)
  const [context, setContext] = useState(null)
  const [webSocket, setWebSocket] = useState(null)
  const player_name = localStorage.getItem(gameid)
  const userid = localStorage.getItem('userid')

  useEffect(() => {
    if (!player_name) {
      setModalVisible(true)
      return
    }
    if (localStorage.getItem('player_names')) {
      const { player1, player2 } = JSON.parse(localStorage.getItem('player_names'))
      localStorage.removeItem('player_names')
      const ctx = Object.assign({}, InitialContext, {
        roles: { [userid]: 1 },
        players: { 1: player1, '-1': (player2 == 'HUMAN2' ? 'HUMAN' : player2) }
      })
      ctx.names = { 1: (player1 == 'HUMAN' ? player_name : 'Computer'), '-1': (player2 == 'HUMAN' ? player_name : (player2 == 'AI' ? 'Computer' : '')) }
      if (player2 != 'HUMAN2') {
        ctx.player = player1 == 'HUMAN' ? 1 : -1
        setContext(ctx)
      }
      else {
        fetch(`${SERVER_URL}/save-game`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameid, game: ctx }),
          accept: 'application/json'
        })
        .then(checkStatus)
        .then(parseJSON)
        .then(({ result }) => {
          ctx.player = 1
          setContext(ctx)
        })
        .catch(error => console.error(error))
      }
    } else {
      fetch(`${SERVER_URL}/fetch-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameid }),
        accept: 'application/json'
      })
      .then(checkStatus)
      .then(parseJSON)
      .then(({ result: ctx }) => {
        if (!ctx) {
          alert('Invalid URL')
          return
        }
        if (!(userid in ctx.roles)) {
          ctx.roles[userid] = -1
          ctx.names['-1'] = player_name
        }
        ctx.player = ctx.roles[userid]
        setContext(ctx)
      })
      .catch(error => console.error(error))
    }
  }, [player_name])

  useEffect(() => {
    if (context && Object.values(context.players).every(p => p == 'HUMAN')) {
      setUpWebSocket(
        webSocket,
        setWebSocket,
        data => {
          if ('name' in data) {
            context.names[`${-1 * context.player}`] = data.name
            data = context
          }
          data.player = context.player
          data.names = context.names
          setContext({ ...data })
        },
        () => webSocket.send(JSON.stringify({ register: gameid, name: player_name }))
      )
    }
  }, [context, webSocket])

  return (
    <>
      <Modal visible={modalVisible} setVisible={setModalVisible} gameid={gameid} />
      {context && (
        <GameContext.Provider value={context}>
          <Board
            sendToServer={new_ctx => {
              if (Object.values(context.players).every(p => p == 'HUMAN'))
                webSocket.send(JSON.stringify({ gameid, context: new_ctx }))
            }}
          />
        </GameContext.Provider>
      )}
    </>
  )
}


export default Game