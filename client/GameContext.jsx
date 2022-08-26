import { createContext } from 'react'

const GameContext = createContext()

export const WorkerContext = createContext()

export const DefaultContext = {
  score: null,  // null -> game on,  0 -> draw, +1/-1 -> winner
  player: 1,
  current_player: 1,
  players: { 1: 'AI', '-1': 'AI' },
  names: { 1: 'Agent #1', '-1': 'Agent #2' },
  last_move: null,
  turn_delay: 4000, // in ms
  board: new Array(3).fill(0).map(() => new Array(3).fill(0).map(() => new Array(3).fill(0).map(() => new Array(3).fill(0)))),
  acquired: new Array(3).fill(0).map(() => new Array(3).fill(0))
}

export const InitialContext = {
  score: null,  // null -> game on,  0 -> draw, +1/-1 -> winner
  current_player: 1,
  last_move: null,
  turn_delay: 2000,
  board: new Array(3).fill(0).map(() => new Array(3).fill(0).map(() => new Array(3).fill(0).map(() => new Array(3).fill(0)))),
  acquired: new Array(3).fill(0).map(() => new Array(3).fill(0))
}

export default GameContext