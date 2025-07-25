import React, { useState, useEffect, useMemo } from 'react'
import { CLIENT_PATH_PREFIX } from './config'
import { WorkerContext } from './GameContext'
import PlayerAgent from './AgentWorker?worker'
import Landing from './Landing'
import Game from './Game'


function App() {

  const [worker, setWorker] = useState(new PlayerAgent())

  const gameid = useMemo(() => {
    const match = new RegExp(`^https?\:\/\/.*\/${CLIENT_PATH_PREFIX}\/?\\?game=(.+)$`).exec(window.location.href)
    return match != null ? match[1] : null
  }, [])

  useEffect(() => {
    if (!localStorage.getItem('userid'))
      localStorage.setItem('userid', Math.floor(Math.random() * 900000) + 100000)
  }, [])

  return (
    <WorkerContext.Provider value={{ worker, setWorker }}>
      {gameid ? <Game gameid={gameid} /> : <Landing />}
    </WorkerContext.Provider>
  )
}

export default App