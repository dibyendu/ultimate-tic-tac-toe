import cloneDeep from 'lodash.clonedeep'

const DEFAULT_CONTEXT = {
  score: null,  // null -> game on,  0 -> draw, +1/-1 -> winner
  current_player: 1,
  last_move: null,
  board: new Array(3).fill(0).map(() => new Array(3).fill(0).map(() => new Array(3).fill(0).map(() => new Array(3).fill(0)))),
  acquired: new Array(3).fill(0).map(() => new Array(3).fill(0))
}

export class Game {

  #game
  #available

  constructor(context = DEFAULT_CONTEXT) {
    this.#game = cloneDeep(context)
    this.#available = this.calculateAvailable()
  }

  static transposeBlock(block) {
    return block[0].map((x, i) => block.map(x => x[i]))
  }

  static isAcquired(block, player) {

    if (block.map(r => r.every(val => val == player)).some(val => val))
      return true
    else if (Game.transposeBlock(block).map(r => r.every(val => val == player)).some(val => val))
      return true
    else if (block.map((e, i) => e[i]).every(val => val == player))
      return true
    else if (block.map((e, i) => e[block.length - i - 1]).every(val => val == player))
      return true
    else
      return false
  }

  get available() {
    let available_mask = new Array(this.constructor.n_actions).fill(true)
    if (this.#game.last_move != null) {
      let { r, c } = this.#game.last_move
      let mask = (this.#game.acquired[r][c] == 0 ? [[r, c]] : [...this.#game.acquired.map((row, r) => row.map((col, c) => col == 0 ? [r, c] : null)).flat().filter(e => e)]).map(([R, C]) => this.#game.board[R][C].map((row, r) => row.map((col, c) => col == 0 ? 27 * R + 9 * C + 3 * r + c : null))).flat().flat().filter(e => e != null)
      available_mask = available_mask.map((_, index) => mask.includes(index))
    }
    return available_mask
  }

  get board() {
    return this.#game.board
  }

  get acquired() {
    return this.#game.acquired
  }

  get action() {
    return this.#game.last_move
  }

  static get n_actions() {
    return 81
  }

  get score() {
    return this.#game.score
  }

  get player() {
    return this.#game.current_player
  }

  clone() {
    return new Game(this.#game)
  }

  move(action) {

    if (this.#game.score != null)
    throw `The game is already finished with a ${{ 0: 'draw', 1: "winner 'x'", '-1': "winner 'o'" }[this.#game.score]}`

		let R = parseInt(action / 27),
      C = parseInt((action  - R * 27) / 9),
      r = parseInt((action - R * 27 - C * 9) / 3),
      c = action - R * 27 - C * 9 - r * 3

		if (action < 0 || action > 80 || !this.#available[R][C] || this.#game.board[R][C][r][c] != 0)
			throw `Invalid move ${ action } { R: ${ R }, C: ${ C }, r: ${ r }, c: ${ c } }`

		this.#game.last_move = {R, C, r, c}
		this.#game.board[R][C][r][c] = this.#game.current_player
		this.#game.acquired[R][C] = this.#game.acquired[R][C] != 0 ? this.#game.acquired[R][C] : (Game.isAcquired(this.#game.board[R][C], this.#game.current_player) ? this.#game.current_player : (this.#game.board[R][C].flat().includes(0) ? 0 : 2))
		this.#game.score = Game.isAcquired(this.#game.acquired, this.#game.current_player) ? this.#game.current_player : (this.#game.acquired.flat().some(e => e == 0) ? null : 0)
		this.#game.current_player *= this.#game.score == null ? -1 : 1
		this.#available = this.calculateAvailable()
	}

	render() {
		console.log('***** Board ************* Acquired ********* Available **\n')
		
		let available = this.#available
		let board = [...Array(3).keys()].map(R => ' ' + [...Array(3).keys()].map(r => [...Array(3).keys()].map(C => this.#game.board[R][C][r].map(cell => ({1: 'x', '-1': 'o', 0: ' '}[cell])).join('')).join(' | ')).join(' \n ') + ' \n').join('-----+-----+-----\n').split('\n')
		let acquired = this.#game.acquired.map(row => ' ' + row.map(cell => ({1: 'x', '-1': 'o', 0: ' ', 2: '-'}[cell])).join(' | ') + ' ').join('\n' + '---+---+---' + '\n').split('\n')
		
		available = available.map(row => ' ' + row.map(cell => cell ? ' ' : '-').join(' | ') + ' ').join('\n' + '---+---+---' + '\n').split('\n')
		
		console.log(acquired.map((acq, i) => [board[i], acq, available[i]].join('        ')).concat(board.slice(acquired.length)).join('\n'))
	}

	calculateAvailable() {
		if (this.#game.last_move == null) return new Array(3).fill(true).map(() => new Array(3).fill(true))
		
		let available, {r, c} = this.#game.last_move
		
		if (this.#game.acquired[r][c] == 0) {
			available = new Array(3).fill(false).map(() => new Array(3).fill(false))
			available[r][c] = true
		} else {
			available = this.#game.acquired.map(row => row.map(cell => cell == 0))
		}

		return available
	}	
}