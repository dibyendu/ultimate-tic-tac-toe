import React, { useState, useEffect, useContext, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faClipboard } from '@fortawesome/free-solid-svg-icons'
import { MutatingDots } from 'react-loader-spinner'
import GameContext, { WorkerContext, DefaultContext } from './GameContext'
import Board from './Board'
import { CLIENT_PATH_PREFIX } from './config'
import PlayerAgent from './AgentWorker?worker'

import './assets/css/App.css'


function Modal({ visible, setVisible, uniqueID }) {

  const { worker, setWorker } = useContext(WorkerContext)
  const [player1, setPlayer1] = useState('HUMAN')
  const [player2, setPlayer2] = useState('AI')
  const [shareGame, setShareGame] = useState(false)
  const [copied, setCopied] = useState(false)

  const link = useMemo(() => `${window.location.protocol}//${window.location.host}${CLIENT_PATH_PREFIX ? `/${CLIENT_PATH_PREFIX}` : ''}?game=${uniqueID}`)

  useEffect(() => {
    if (player1 == 'AI') setPlayer2('HUMAN')
    if (player2 == 'AI') setPlayer1('HUMAN')
    if (player1 == player2 && player1 == 'HUMAN') setPlayer2('HUMAN2')
    setShareGame(player2 == 'HUMAN2' ? true : false)
  }, [player1, player2])

  return (
    <div className='modal-overlay' style={{ display: visible ? 'block' : 'none' }}>
      <div className='modal-container'>
        <span className='f-left'>Player 1</span>
        <select className='f-right' onChange={({ target: { value } }) => setPlayer1(value)} value={player1}>
          <option value='AI'>Computer</option>
          <option value='HUMAN'>You</option>
        </select><br /><br />
        <span className='f-left'>Player 2</span>
        <select className='f-right' onChange={({ target: { value } }) => setPlayer2(value)} value={player2}>
          <option value='AI'>Computer</option>
          <option value='HUMAN'>You</option>
          <option value='HUMAN2'>Human</option>
        </select><br /><br />
        {
          shareGame && <>
            <p style={{ textAlign: 'left' }}>Share the link with your opponent</p>
            <div>
              <input id='link' className='f-left' readOnly value={link} />
              <button
                title={copied ? 'Link copied' : 'Copy the link'}
                className='f-right inline' onClick={() => {
                  document.querySelector('#link').select()
                  document.execCommand('copy')
                  setCopied(true)
                }}
              >
                <FontAwesomeIcon icon={faClipboard} />
              </button>
            </div>
            <br /><br />
          </>
        }
        <span className='f-right'><button onClick={() => setVisible(false)}>Cancel</button>&nbsp;&nbsp;&nbsp;&nbsp;
        <button onClick={() => {
          worker.terminate()
          setWorker(new PlayerAgent())
          setVisible(false)
          localStorage.setItem('player_names', JSON.stringify({ player1, player2 }))
          window.open(link, '_self')
        }}>Go</button></span><br />
      </div>
    </div>
  )
}

function Landing() {

  const { worker } = useContext(WorkerContext)
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState(0)
  const [modalVisible, setModalVisible] = useState(false)
  const uniqueID = useMemo(() => Math.floor(Math.random() * 900000) + 100000)

  worker.onerror = error => console.error(error)
  worker.onmessage = ({ data: { percentage } }) => {
    if (percentage === 'done')
      setLoaded(true)
    else
      setProgress(percentage * 100)
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <h2>Ultimate Tic Tac Toe</h2><br />
      {!loaded ? (
        <div style={{ width: 140, margin: '0 auto', textAlign: 'center' }}>
          <MutatingDots color='#46d7ff' secondaryColor='#FF5F5C' height={140} width={140} arialLabel='loading' />
          <p style={{ fontSize: 12 }}>{`Loading AI Agent (${progress}%)`}</p>
        </div>
      ) : (
          <GameContext.Provider value={DefaultContext}>
            <Board scaled />
          </GameContext.Provider>
        )}
      <div>A strategic board game for 2 players.<br />Read the <a href='https://en.wikipedia.org/wiki/Ultimate_tic-tac-toe' target='_blank' rel='noreferrer'>wikipedia page</a> for the rules.</div><br />
      {loaded && (
        <div>
          <a href='#' onClick={() => setModalVisible(true)}>Start Game</a><br /><br />
          <Modal visible={modalVisible} setVisible={setModalVisible} uniqueID={uniqueID} />
        </div>
      )}
    </div>
  )
}

export default Landing