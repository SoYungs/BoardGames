import { getXiangqiHistoryMove, isXiangqiPiecePlacementValid, validateXiangqiHistory, type XiangqiHistoryOptions } from './xiangqiHistory'
import { allLegalMovesChecked, getXiangqiWinner, inCheck } from './xiangqiMoves'
import type { XiangqiPositionRecord } from './xiangqiRepetition'
import type { Board, Side } from './xiangqiTypes'

export type XiangqiNaturalDrawResult = { kind: 'dead-position' } | { kind: 'natural-movecount' }
export type XiangqiNaturalMoveCount = {
  plies: number
  checks: Record<Side, number>
  eligible: Record<Side, number>
}

/** WXF 2018 Art. 3.2.A: prove only the conservative, entirely defensive category. */
export function isXiangqiDeadPosition(board: Board): boolean {
  if (!Array.isArray(board) || board.length !== 10 || board.some(row => !Array.isArray(row) || row.length !== 9)) return false
  const kings = { red: 0, black: 0 }
  const defenders = { red: { a: 0, b: 0 }, black: { a: 0, b: 0 } }
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const piece = board[r][c]
    if (!piece) continue
    if ((piece.side !== 'red' && piece.side !== 'black') || !['k', 'a', 'b'].includes(piece.type) || !isXiangqiPiecePlacementValid(piece, r, c)) return false
    if (piece.type === 'k') kings[piece.side]++
    else if (++defenders[piece.side][piece.type as 'a' | 'b'] > 2) return false
  }
  if (kings.red !== 1 || kings.black !== 1 || inCheck(board, 'red') || inCheck(board, 'black')) return false
  // Advisors and elephants cannot reach the opposing palace. In a legal position
  // neither side can give a non-suicidal flying-general check or an attacking check.
  // Do not convert an existing stalemate into a draw.
  return allLegalMovesChecked(board, 'red').length > 0 && allLegalMovesChecked(board, 'black').length > 0
}

/** Known consecutive plies only: a partial imported game does not invent earlier moves. */
export function getXiangqiNaturalMoveCount(history: readonly XiangqiPositionRecord[], board: Board, turn: Side, options: XiangqiHistoryOptions = {}): XiangqiNaturalMoveCount | null {
  const valid = validateXiangqiHistory(history, board, turn, options)
  if (!valid.ok) return null
  const records = [...history, { board, turn: valid.turn }]
  let plies = 0
  let checks: Record<Side, number> = { red: 0, black: 0 }
  for (let index = 0; index < records.length - 1; index++) {
    const before = records[index], after = records[index + 1]
    options.check?.()
    const move = getXiangqiHistoryMove(before.board, after.board, before.turn, options)
    if (!move) return null
    if (move.capture) {
      plies = 0
      checks = { red: 0, black: 0 }
    } else {
      plies++
      if (inCheck(after.board, after.turn)) checks[before.turn]++
    }
  }
  // WXF 2018 Art. 8 describes a requester's count, with at most ten of that
  // player's checks counted. Art. 3.2.D specifies fifty moves by EACH player
  // (one hundred plies altogether), not the 120-ply threshold of other rulesets.
  // An automated arbiter tests both possible requesters, rather than requiring a
  // draw-request button: either valid 100-ply claim establishes the natural draw.
  return { plies, checks, eligible: { red: plies - Math.max(0, checks.red - 10), black: plies - Math.max(0, checks.black - 10) } }
}

export function getXiangqiNaturalDraw(history: readonly XiangqiPositionRecord[], board: Board, turn: Side): XiangqiNaturalDrawResult | null {
  const valid = validateXiangqiHistory(history, board, turn)
  if (!valid.ok || getXiangqiWinner(board, valid.turn) !== null) return null
  if (isXiangqiDeadPosition(board)) return { kind: 'dead-position' }
  const count = getXiangqiNaturalMoveCount(history, board, valid.turn)
  return count && Math.max(count.eligible.red, count.eligible.black) >= 100 ? { kind: 'natural-movecount' } : null
}
