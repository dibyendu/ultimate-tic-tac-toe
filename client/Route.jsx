import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom'

import Landing from './Landing'
import Game from './Game'
import { WorkerContext } from './GameContext'
import PlayerAgent from './AgentWorker?worker'

function Routes() {

  const [worker, setWorker] = useState(new PlayerAgent())

  useEffect(() => {
    if (!localStorage.getItem('userid'))
      localStorage.setItem('userid', Math.floor(Math.random() * 900000) + 100000)
  }, [])

  return (
    <WorkerContext.Provider value={{ worker, setWorker }}>
      <Router>
        <Switch>
          <Route exact path='/' component={Landing} />
          <Route path='/:gameid' component={Game} />
        </Switch>
      </Router>
    </WorkerContext.Provider>
  )
}

export default Routes