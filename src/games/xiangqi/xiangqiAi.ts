import { MATE_SCORE, searchBestMove } from '../ai/search'
import { applyMove } from './xiangqiBoard'
import { inCheck, legalMovesFromChecked } from './xiangqiMoves'
import { PIECE_VALUE, type Board, type Move, type Piece, type Side } from './xiangqiTypes'

function placement(piece: Piece, r: number, c: number): number {
  const advance = piece.side === 'red' ? 9 - r : r
  const center = 4 - Math.abs(4 - c)
  switch (piece.type) {
    case 'p': return advance * 5 + (advance >= 5 ? 28 + center * 5 : 0)
    case 'n': return center * 8 + Math.min(advance, 6) * 4 - (c === 0 || c === 8 ? 15 : 0)
    case 'c': return center * 5 + (advance >= 2 && advance <= 5 ? 14 : 0)
    case 'r': return center * 3 + advance * 3
    case 'b': return 10 - Math.abs(4 - c) * 2
    case 'a': return c === 4 ? 12 : 6
    case 'k': return -Math.abs(4 - c) * 8 - advance * 5
  }
}

function evaluate(board: Board, side: Side): number {
  let score = 0
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const piece = board[r][c]
    if (!piece) continue
    let bonus = placement(piece, r, c)
    if (piece.type === 'n') {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (board[r + dr]?.[c + dc]) bonus -= 7
    }
    if (piece.type === 'r') {
      for (const dr of [-1, 1]) {
        for (let rr = r + dr; rr >= 0 && rr < 10 && !board[rr][c]; rr += dr) bonus += 2
      }
    }
    score += (piece.side === side ? 1 : -1) * (PIECE_VALUE[piece.type] * 10 + bonus)
  }
  return score
}

export function pickAiMoveXiangqi(board: Board, side: Side, budgetMs = 800): Move | null {
  return searchBestMove(board, side, {
    *moves(position, turn, check) {
      for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
        check()
        if (position[r][c]?.side === turn) yield* legalMovesFromChecked(position, r, c)
      }
    },
    apply: (position, move) => applyMove(position, move.fromR, move.fromC, move.toR, move.toC),
    other: turn => turn === 'red' ? 'black' : 'red',
    evaluate,
    order: (position, move) => {
      const piece = position[move.fromR][move.fromC]!
      const captured = position[move.toR][move.toC]
      return (captured ? PIECE_VALUE[captured.type] * 160 - (piece.type === 'k' ? 0 : PIECE_VALUE[piece.type] * 10) : 0)
        + placement(piece, move.toR, move.toC) - placement(piece, move.fromR, move.fromC)
    },
    tactical: (position, move) => !!position[move.toR][move.toC],
    inCheck,
    terminal: (_position, _turn, ply) => -MATE_SCORE + ply,
    moveKey: move => `${move.fromR},${move.fromC},${move.toR},${move.toC}`,
    key: (position, turn) => `${turn}|${position.map(row => row.map(piece => piece ? piece.side === 'red' ? piece.type.toUpperCase() : piece.type : '.').join('')).join('')}`,
  }, { budgetMs, maxDepth: 6, quiescenceDepth: 3 })
}
