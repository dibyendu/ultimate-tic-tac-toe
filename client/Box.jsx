import React, { useContext } from 'react'
import GameContext from './GameContext'
import './assets/css/App.css'

function Box({ row, column, className, handleMove, winner }) {

  const context = useContext(GameContext)

  return (
    <table className='box'>
      <tbody>
        {
          [...Array(3).keys()].map((r, index) => (
            <tr key={index}>
              {
                [...Array(3).keys()].map((c, index) => (
                  <td
                    key={index}
                    className={className}
                    onClick={() => {
                      if (Object.values(context.players).every(p => p == 'AI') || winner != null) return
                      if (className != 'available' || context.board[row][column][r][c] != 0)
                        return handleMove({ error: 'Invalid Move' })
                      else if (context.player != context.current_player)
                        return handleMove({ error: "Opponent's Turn" })
                      handleMove({ R: row, C: column, r, c })
                    }}>
                    <div className={{ 1: 'tic', '-1': 'tac', 0: '' }[context.board[row][column][r][c]] + (context.last_move && context.last_move.R == row && context.last_move.C == column && context.last_move.r == r && context.last_move.c == c ? ' animate' : '')} />
                  </td>
                ))
              }
            </tr>
          ))
        }
      </tbody>
    </table>
  )
}

export default Box