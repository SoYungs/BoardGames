import { MATE_SCORE, searchBestMove } from '../ai/search'
import { applyShogiMove } from './shogiBoard'
import { findKing, inCheck, legalDropMoves, legalMovesFrom, legalMovesFromChecked } from './shogiMoves'
import { PIECE_VALUE, type Board, type Hand, type Move, type Piece, type Side } from './shogiTypes'

type Position = { board: Board; hand: Hand }
function value(piece: Piece): number {
  if (piece.type === 'k') return 0
  if (!piece.promoted) return PIECE_VALUE[piece.type] * 10
  return piece.type === 'r' ? 820 : piece.type === 'b' ? 780 : 260
}

function placement(piece: Piece, r: number, c: number): number {
  const advance = piece.side === 'sente' ? 8 - r : r
  const center = 4 - Math.abs(c - 4)
  if (piece.type === 'k') return -advance * 10 - center * 2
  if (piece.type === 'p') return advance * 5 + center * 2
  if (piece.type === 'r' || piece.type === 'b') return center * 4 + advance * 3
  if (piece.type === 'g' || piece.type === 's' || piece.promoted) return center * 4 + Math.min(advance, 6) * 3
  return center * 3 + advance * 2
}

function evaluate({ board, hand }: Position, side: Side): number {
  let score = 0
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const piece = board[r][c]
    if (!piece) continue
    let bonus = placement(piece, r, c)
    if (piece.type === 'k') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const guard = board[r + dr]?.[c + dc]
        if ((dr || dc) && guard?.side === piece.side) bonus += guard.type === 'g' || guard.type === 's' ? 16 : 5
      }
    }
    score += (piece.side === side ? 1 : -1) * (value(piece) + bonus)
  }
  for (const owner of ['sente', 'gote'] as const) {
    for (const type of hand[owner]) score += (owner === side ? 1 : -1) * PIECE_VALUE[type] * 10.5
  }
  return score
}

function order(position: Position, move: Move, side: Side): number {
  const captured = position.board[move.toR][move.toC]
  const mover = move.dropType ? { id: '', side, type: move.dropType, promoted: false } : position.board[move.fromR!][move.fromC!]!
  let score = captured ? (value(captured) + PIECE_VALUE[captured.type] * 10) * 12 - value(mover) : 0
  if (move.promote) score += (value({ ...mover, promoted: true }) - value(mover)) * 8
  if (move.dropType) {
    const opponent = side === 'sente' ? 'gote' : 'sente'
    const king = findKing(position.board, opponent)
    if (king) score += Math.max(0, 6 - Math.abs(king[0] - move.toR) - Math.abs(king[1] - move.toC)) * 8
    const next = position.board.map(row => row.slice())
    next[move.toR][move.toC] = mover
    if (king && legalMovesFrom(next, move.toR, move.toC).some(reply => reply.toR === king[0] && reply.toC === king[1])) score += 700
  } else {
    score += placement(mover, move.toR, move.toC) - placement(mover, move.fromR!, move.fromC!)
  }
  return score
}

export function pickAiMoveShogi(board: Board, hand: Hand, side: Side, budgetMs = 800): Move | null {
  return searchBestMove({ board, hand }, side, {
    *moves(position, turn, check) {
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
        check()
        if (position.board[r][c]?.side === turn) yield* legalMovesFromChecked(position.board, position.hand, r, c)
      }
      yield* legalDropMoves(position.board, position.hand, turn, check)
    },
    apply: (position, move, turn) => applyShogiMove(position.board, position.hand, move, turn),
    other: turn => turn === 'sente' ? 'gote' : 'sente',
    evaluate, order,
    tactical: (position, move) => !!position.board[move.toR][move.toC] || !!move.promote,
    inCheck: (position, turn) => inCheck(position.board, turn),
    terminal: (_position, _turn, ply) => -MATE_SCORE + ply,
    moveKey: move => `${move.fromR ?? ''},${move.fromC ?? ''},${move.toR},${move.toC},${move.dropType ?? ''},${move.promote ?? ''}`,
    key: (position, turn) => `${turn}|${position.board.map(row => row.map(piece => piece ? `${piece.side === 'sente' ? piece.type.toUpperCase() : piece.type}${piece.promoted ? '+' : ''}` : '.').join('')).join('')}|${[...position.hand.sente].sort().join('')}|${[...position.hand.gote].sort().join('')}`,
  }, { budgetMs, maxDepth: 5, quiescenceDepth: 2, rootLimit: 64 })
}
