import * as tf from '@tensorflow/tfjs'

import { CLIENT_PATH_PREFIX } from './config'

import { Game } from '../AlphaZeroAgent/Game.mjs'
import { MCTS } from '../AlphaZeroAgent/MCTS.mjs'
import { Policy } from '../AlphaZeroAgent/Policy.mjs'

const policy = new Policy(MCTS.n_states, MCTS.n_actions)

function select_random_position(block) {
  let available_blocks = block.map((row, r) => row.map((col, c) => col == 0 ? [r, c] : null)).flat().filter(e => e)
  return available_blocks[Math.floor(Math.random() * available_blocks.length)]
}

function action(context, using_model = false) {

  let start = new Date().getTime()

  if (using_model) {
    let temperature = 0.1,
      exploration_depth = 200

    let game_tree = new MCTS(new Game(context))

    for (let _ of [...Array(exploration_depth).keys()])
      game_tree.explore(policy)

    let [game_tree_next, _] = game_tree.next(temperature)

    let elapsed = new Date().getTime() - start

    return elapsed >= context.turn_delay ? postMessage({ move: game_tree_next.game.action }) : setTimeout(() => postMessage({ move: game_tree_next.game.action }), context.turn_delay - elapsed)
  }

  let move, { board, acquired } = context
  if (context.last_move == null) {
    let [R, C] = select_random_position(acquired)
    let [r, c] = select_random_position(board[R][C])
    move = { R, C, r, c }
  } else {
    let { r, c } = context.last_move
    if (acquired[r][c] == 0) {
      let [new_r, new_c] = select_random_position(board[r][c])
      move = { R: r, C: c, r: new_r, c: new_c }
    } else {
      let [R, C] = select_random_position(acquired)
      let [r, c] = select_random_position(board[R][C])
      move = { R, C, r, c }
    }
  }

  let elapsed = new Date().getTime() - start

  return elapsed >= context.turn_delay ? postMessage({ move }) : setTimeout(() => postMessage({ move }), context.turn_delay - elapsed)
}


fetch(`/${CLIENT_PATH_PREFIX}/model/model.json`, { method: 'HEAD' })
.then(async response => {
  if (response.ok) {
    policy.load(await tf.loadLayersModel(`/${CLIENT_PATH_PREFIX}/model/model.json`, {
      onProgress: percentage => postMessage({ percentage })
    }))
    self.onmessage = ({ data: { context }}) => action(context, true)
    policy.summary()
  }
  postMessage({ percentage: 'done' })
})
.catch(error => console.error(error))

onmessage = ({ data: { context }}) => action(context)