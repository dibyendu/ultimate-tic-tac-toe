const DEFAULT_CONTEXT = {
  current_player: 1, // 1 -> order, -1 -> chaos
  boards: {
    1: new Array(6).fill(0).map(() => new Array(6).fill(0)),
    '-1': new Array(6).fill(0).map(() => new Array(6).fill(0))
  },
  moves: []
}


export class Game {

  #game
  #combined

  constructor(context = DEFAULT_CONTEXT) {
    this.#game = structuredClone(context)
    this.#combined = new Array(6).fill(0).map(() => new Array(6).fill(0))
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++)
        this.#combined[i][j] = this.#game.boards[1][i][j] + this.#game.boards['-1'][i][j]
  }

  /**
   * Checks for winner and returns one if found
   * @return {Integer}     0: game on,  1: order wins,  -1: chaos wins
   */
  checkWinner() {

    if (this.#combined.some(r => r.some(c => c == 0)))
      return 0

    let combined_transposed = this.#combined[0].map((_, i) => this.#combined.map(r => r[i]))

    let slices = this.#combined.map(r => [r.slice(0, 5), r.slice(1, 6)]).flat()
    slices = slices.concat(combined_transposed.map(r => [r.slice(0, 5), r.slice(1, 6)]).flat())
    slices.push(this.#combined.map((r, i) => r[i]).slice(0, 5))
    slices.push(this.#combined.map((r, i) => r[i]).slice(1, 6))
    slices.push(this.#combined.slice(0, 5).map((r, i) => r[i + 1]))
    slices.push(this.#combined.slice(1, 6).map((r, i) => r[i]))

    if (slices.map(r => r.every(v => v == 1) || r.every(v => v == -1)).some(v => v))
      return 1
    return -1
  }

  findAvailable() {
    return this.#combined.map(r => r.map(c => c == 0))
  }

  move(row, column, piece_type) {

    let player = `${this.#game.current_player}`

    if (this.#combined[row][column] != 0)
      return false

    this.#game.moves.push([row, column])
    this.#game.boards[player][row][column] = piece_type
    this.#combined[row][column] = piece_type

    this.#game.current_player *= -1

    return true
  }

  undo() {

    if (this.#game.moves.length == 0)
      return false

    let player = `${this.#game.current_player * -1}`,
      [row, column] = this.#game.moves.pop()

    this.#game.boards[player][row][column] = 0

    this.#combined[row][column] = 0

    this.#game.current_player *= -1

    return true
  }

  clone() {
    return new Game(this.#game)
  }

  render() {
    console.log('Order: ', this.#game.boards[1])
    console.log('Chaos: ', this.#game.boards['-1'])
    console.log('Next player: ', this.#game.current_player == 1 ? 'Order' : 'Chaos')
  }

}