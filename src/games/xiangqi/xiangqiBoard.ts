import type { Board, Piece, PieceType, Side } from './xiangqiTypes'
import { COLS, ROWS } from './xiangqiTypes'

function p(id: string, side: Side, type: PieceType): Piece {
  return { id, side, type }
}

export function createInitialBoard(): Board {
  const b: Board = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null))

  const top: PieceType[] = ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r']
  for (let c = 0; c < COLS; c++) {
    b[0][c] = p(`b-${top[c]}-0-${c}`, 'black', top[c])
    b[9][c] = p(`r-${top[c]}-9-${c}`, 'red', top[c])
  }
  b[2][1] = p('b-c-2-1', 'black', 'c')
  b[2][7] = p('b-c-2-7', 'black', 'c')
  b[7][1] = p('r-c-7-1', 'red', 'c')
  b[7][7] = p('r-c-7-7', 'red', 'c')
  for (const c of [0, 2, 4, 6, 8]) {
    b[3][c] = p(`b-p-3-${c}`, 'black', 'p')
    b[6][c] = p(`r-p-6-${c}`, 'red', 'p')
  }
  return b
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice())
}

/** 深拷贝棋盘（用于悔棋历史，避免引用被后续走子改掉） */
export function snapshotBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)))
}

export function applyMove(board: Board, fromR: number, fromC: number, toR: number, toC: number) {
  const next = cloneBoard(board)
  next[toR][toC] = next[fromR][fromC]
  next[fromR][fromC] = null
  return next
}
