export const GOMOKU_SIZE = 15
export type Cell = 0 | 1 | 2 // empty, black, white

export function emptyBoard(): Cell[][] {
  return Array.from({ length: GOMOKU_SIZE }, () =>
    Array.from({ length: GOMOKU_SIZE }, () => 0 as Cell),
  )
}

export function isBoardFull(board: Cell[][]): boolean {
  return board.every(row => row.every(cell => cell !== 0))
}

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
]

export function checkWin(board: Cell[][], r: number, c: number, player: 1 | 2): boolean {
  for (const [dr, dc] of DIRS) {
    let count = 1
    for (const sign of [-1, 1]) {
      let nr = r + dr * sign
      let nc = c + dc * sign
      while (
        nr >= 0 &&
        nr < GOMOKU_SIZE &&
        nc >= 0 &&
        nc < GOMOKU_SIZE &&
        board[nr][nc] === player
      ) {
        count++
        nr += dr * sign
        nc += dc * sign
      }
    }
    if (count >= 5) return true
  }
  return false
}

export { evaluateBoard, getCandidates, pickAiMove } from './gomokuAi'
