import * as tf from '@tensorflow/tfjs'
import { Game } from './Game.mjs'

export class MCTS {

  static C = 1.0

  constructor(game, mother = null) {
    this.game = game
    this.children = {}
    this.U = 0
    this.N = 0
    this.V = 0
    this.P = null
    this.nn_input = null
    this.outcome = this.game.score
    this.mother = mother
    if (this.outcome) {
      this.V = this.outcome * this.game.player
      this.U = this.V * Infinity
    }
  }

  static get n_states() {
    return [81 * 2 + 9 * 2 + 9]
  }

  static get n_actions() {
    return Game.n_actions
  }

  createChild(available_actions) {
    let actions = available_actions.map((action, index) => action ? index : null).filter(e => e != null)
    let games = actions.map(_ => this.game.clone())
    actions.forEach((action, index) => games[index].move(action))
    this.children = Object.assign(...actions.map((action, index) => ({ [action]: new MCTS(games[index], this) })))
  }

  explore(policy) {
    if (this.outcome != null)
      throw `The game has ended with score: {this.outcome}`
    let current = this
    while (Object.keys(current.children).length && current.outcome == null) {
      let children = current.children

      let max_U = Math.max(...Object.values(children).map(node => node.U))

      if (max_U == Infinity) {
        current.U = -Infinity
        current.V = -1.0
        break
      } else if (max_U == -Infinity) {
        current.U = Infinity
        current.V = 1.0
        break
      }

      let actions = Object.entries(children).filter(([_, node]) => node.U == max_U).map(([action, _]) => action)

      if (actions.length == 0) {
        console.log(`current max_U = ${max_U}`)
        throw 'No action to explore'
      }

      let action = actions[Math.floor(Math.random() * actions.length)]

      current = children[action]
    }

    // if node hasn't been expanded
    if (Object.keys(current.children).length == 0 && current.outcome == null) {
      current.nn_input = {
        state: [].concat(
          current.game.board.flat().flat().flat().map(cell => cell == 1 ? 1.0 : 0.0),
          current.game.board.flat().flat().flat().map(cell => cell == -1 ? 1.0 : 0.0),
          current.game.acquired.flat().map(cell => cell == 1 ? 1.0 : 0.0),
          current.game.acquired.flat().map(cell => cell == -1 ? 1.0 : 0.0),
          [...Array(3).keys()].map(i => current.game.available.slice(i * 27, i * 27 + 27)).map(row => [...Array(3).keys()].map(j => row.slice(j * 9, j * 9 + 9)).map(block => block.some(cell => cell) ? 1.0 : 0.0)).flat()
        ),
        availability: current.game.available.map(cell => cell ? 1.0 : 0.0)
      }

      let [p, v] = policy.predict([
        tf.tensor(current.nn_input.state, MCTS.n_states, 'float32').expandDims(),
        tf.tensor(current.nn_input.availability, [MCTS.n_actions], 'float32').expandDims()
      ])

      current.P = p.squeeze().arraySync()
      current.V = v.squeeze().arraySync()
      current.createChild(current.game.available)
    }

    current.N += 1

    // now update U and back-prop
    while (current.mother) {
      let mother = current.mother
      mother.N += 1
      // beteen mother and child, the player is switched, extra -ve sign
      mother.V += (-mother.V - current.V) / mother.N

      let probs = mother.P

      // update U for all sibling nodes
      for (let [action, sibling] of Object.entries(mother.children))
        if (sibling.U != Infinity && sibling.U != -Infinity)
          sibling.U = sibling.V + MCTS.C * probs[action] * Math.sqrt(mother.N) / (1 + sibling.N)
      current = current.mother
    }
  }

  next(temperature = 1.0) {
    if (this.outcome != null)
      throw `The Game has ended with score ${this.outcome}`
    if (Object.keys(this.children).length == 0)
      throw 'No children found and game has not ended'

    let children = this.children, prob

    // if there are winning moves, just output those
    if (Math.max(...Object.values(children).map(node => node.U)) == Infinity)
      prob = [...Array(MCTS.n_actions).keys()].map(action => action in children ? (children[action].U == Infinity ? 1.0 : 0.0) : 0.0)
    else {
      // divide things by maxN for numerical stability
      let maxN = Math.max(...Object.values(children).map(node => node.N)) + 1
      prob = [...Array(MCTS.n_actions).keys()].map(action => action in children ? (children[action].N / maxN) ** (1.0 / temperature) : 0.0)
    }

    let sum = prob.reduce((x, y) => x + y, 0)

    if (sum > 0) // normalize the probability
      prob = prob.map(p => p / sum)
    else {       // if sum is zero, just make things random
      let n_child = Object.keys(children).length
      prob = [...Array(MCTS.n_actions).keys()].map(action => action in children ? (1.0 / n_child) : 0.0)
    }

    let weighted = [].concat(...prob.map((pr, action) => Array(Math.ceil(pr * 100)).fill(action))),
      next_action = weighted[Math.floor(Math.random() * weighted.length)],
      next_state = children[next_action]

    return [next_state, { nn_input: this.nn_input, true_prob: prob }]
  }

  detachMother() {
    delete this.mother
    this.mother = null
  }
}