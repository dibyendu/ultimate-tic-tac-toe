import * as tf from '@tensorflow/tfjs'
import { Game } from './Order_and_Chaos_Game.mjs'

export class MCTS {

  static C = 1.0

  constructor(game, parent = null) {
    this.game = game
    this.parent = parent
    this.children = {}

    this.visit_count = 0
    this.state_value = null
    this.state_value_sum = 0.0
    this.state_value_mean = 0.0
    this.action_probability = null




    this.nn_input = null
    this.outcome = this.game.score

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


  explore(policy_value_net) {
    let current = this

    while (Object.keys(current.children).length) {
      let children = current.children

      let scores = Object.values(children).map(child =>
        -child.state_value_mean +
        MCTS.C * child.action_probability * Math.sqrt(current.visit_count) / (1 + child.visit_count)
      )

      let top_score = Math.max(...scores)

      let top_score_indices = scores.map((score, index) => score == top_score ? index : null).filter(index => index != null)

      let top_child_index = top_score_indices[Math.floor(Math.random() * top_score_indices.length)]

      current = Object.values(children)[top_child_index]
    }

    // if node hasn't been expanded
    let game_outcome = current.game.checkWinner()

    if (game_outcome != 0)
      current.state_value = game_outcome
    else {
      let availables = current.game.findAvailable()

      let actions = availables.map((r, i) => r.map((c, j) => [i, j, c])).flat().filter(([_,__,c]) => c).map(([i,j,_]) => [[i,j,-1], [i,j,1]]).flat()
      
      let games = actions.map(_ => current.game.clone())

      actions.forEach((action, index) => games[index].move(...action))
      
      current.children = Object.assign(...actions.map((action, index) => ({ [action]: new MCTS(games[index], current) })))

      let [p, v] = policy_value_net.predict([
        current.game.state // board 1 + board -1 + current.game.findAvailable() + current player
      ])

      current.state_value = v

      Object.entries(current.children).forEach(([[row, col, player], child]) => {
        child.action_probability = p[2 * (row * 6 + col) + (player == -1 ? 0 : 1)]
      })

    }

    let state_value = current.state_value,
        sign = 1

    // now update U and back-prop
    while (current) {
      current.visit_count += 1
      current.state_value_sum += sign * state_value
      current.state_value_mean = current.state_value_sum / current.visit_count
      sign *= -1
      current = current.parent
    }
    
    // while (current.parent) {
    //   let parent = current.parent
    //   mother.N += 1
    //   // beteen mother and child, the player is switched, extra -ve sign
    //   mother.V += (-mother.V - current.V) / mother.N

    //   let probs = mother.P

    //   // update U for all sibling nodes
    //   for (let [action, sibling] of Object.entries(mother.children))
    //     if (sibling.U != Infinity && sibling.U != -Infinity)
    //       sibling.U = sibling.V + MCTS.C * probs[action] * Math.sqrt(mother.N) / (1 + sibling.N)
    //   current = current.mother
    // }
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






let tree = new MCTS(new Game({
  current_player: 1, // 1 -> order, -1 -> chaos
  boards: {
    1: new Array(6).fill(0).map(() => new Array(6).fill(0)),
    '-1': new Array(6).fill(0).map(() => new Array(6).fill(0))
  },
  moves: []
}))

tree.explore(()=> {})