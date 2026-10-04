import { getXiangqiWinner, inCheck, legalMovesFromChecked } from './xiangqiMoves'
import type { XiangqiPositionRecord } from './xiangqiRepetition'
import type { Board, Move, Piece, PieceType, Side } from './xiangqiTypes'

export type XiangqiHistoryValidation = { ok: true; turn: Side } | { ok: false; reason: string }
export type XiangqiHistoryMove = { move: Move; capture: boolean }
export type XiangqiHistoryOptions = { check?: () => void }

const other = (side: Side): Side => side === 'red' ? 'black' : 'red'
const limits: Record<PieceType, number> = { k: 1, a: 2, b: 2, n: 2, r: 2, c: 2, p: 5 }
const blackElephants = new Set(['0,2', '0,6', '2,0', '2,4', '2,8', '4,2', '4,6'])

export function isXiangqiPiecePlacementValid(piece: Piece, r: number, c: number): boolean {
  const localR = piece.side === 'black' ? r : 9 - r
  if (piece.type === 'k') return localR <= 2 && c >= 3 && c <= 5
  if (piece.type === 'a') return localR === 1 ? c === 4 : (localR === 0 || localR === 2) && (c === 3 || c === 5)
  if (piece.type === 'b') return blackElephants.has(`${localR},${c}`)
  if (piece.type === 'p') return localR >= 3 && (localR >= 5 || c % 2 === 0)
  return true
}

type LocatedPiece = { piece: Piece; r: number; c: number }

function pieces(board: Board, check?: () => void): Map<string, LocatedPiece> | null {
  check?.()
  if (!Array.isArray(board) || board.length !== 10) return null
  const result = new Map<string, LocatedPiece>()
  const counts = { red: { k: 0, a: 0, b: 0, n: 0, r: 0, c: 0, p: 0 }, black: { k: 0, a: 0, b: 0, n: 0, r: 0, c: 0, p: 0 } }
  for (let r = 0; r < 10; r++) {
    if (!Array.isArray(board[r]) || board[r].length !== 9) return null
    for (let c = 0; c < 9; c++) {
      check?.()
      const piece = board[r][c]
      if (piece === null) continue
      if (!piece || (piece.side !== 'red' && piece.side !== 'black') || !Object.hasOwn(limits, piece.type) || typeof piece.id !== 'string' || !piece.id.length || result.has(piece.id)) return null
      if (!isXiangqiPiecePlacementValid(piece, r, c) || ++counts[piece.side][piece.type] > limits[piece.type]) return null
      result.set(piece.id, { piece, r, c })
    }
  }
  // A partial game may start anywhere, including a final captured-king position.
  if (counts.red.k + counts.black.k === 0) return null
  return result
}

/** Prove one stable piece moved, and optionally captured exactly one enemy piece. */
export function getXiangqiHistoryMove(before: Board, after: Board, mover: Side, options: XiangqiHistoryOptions = {}): XiangqiHistoryMove | null {
  const previous = pieces(before, options.check), next = pieces(after, options.check)
  if (!previous || !next) return null
  let moved: { from: LocatedPiece; to: LocatedPiece } | null = null
  let removed: LocatedPiece | null = null
  for (const [id, from] of previous) {
    const to = next.get(id)
    if (!to) {
      if (removed) return null
      removed = from
      continue
    }
    if (from.piece.side !== to.piece.side || from.piece.type !== to.piece.type) return null
    if (from.r !== to.r || from.c !== to.c) {
      if (moved) return null
      moved = { from, to }
    }
  }
  if (!moved || moved.from.piece.side !== mover || before[moved.to.r][moved.to.c]?.side === mover) return null
  if (next.size !== previous.size - Number(removed !== null)) return null
  for (const id of next.keys()) if (!previous.has(id)) return null
  if (removed && (removed.piece.side === mover || removed.r !== moved.to.r || removed.c !== moved.to.c)) return null
  if (!removed && before[moved.to.r][moved.to.c] !== null) return null
  const move: Move = { fromR: moved.from.r, fromC: moved.from.c, toR: moved.to.r, toC: moved.to.c }
  options.check?.()
  // New play correctly excludes king captures. For a legacy final capture,
  // substitute an ordinary enemy target only while proving movement geometry
  // and the mover's safety; validateXiangqiHistory still requires it to be final.
  const proofBoard = removed?.piece.type === 'k' ? before.map((row, r) => row.map((piece, c) => r === move.toR && c === move.toC && piece ? { ...piece, type: 'r' as const } : piece)) : before
  if (!legalMovesFromChecked(proofBoard, move.fromR, move.fromC).some(candidate => candidate.toR === move.toR && candidate.toC === move.toC)) return null
  options.check?.()
  return { move, capture: removed !== null }
}

function hasKing(board: Board, side: Side): boolean {
  return board.some(row => row.some(piece => piece?.side === side && piece.type === 'k'))
}

/** Validate only playable geometry/history, not cached outcome labels from an older ruleset. */
export function validateXiangqiHistory(history: readonly XiangqiPositionRecord[], board: Board, turn: Side, options: XiangqiHistoryOptions = {}): XiangqiHistoryValidation {
  if (turn !== 'red' && turn !== 'black') return { ok: false, reason: 'invalid-turn' }
  if (!Array.isArray(history) || !pieces(board, options.check)) return { ok: false, reason: 'invalid-board' }
  for (let index = 0; index < history.length; index++) {
    const record = history[index]
    options.check?.()
    if (!record || (record.turn !== 'red' && record.turn !== 'black') || !pieces(record.board, options.check)) return { ok: false, reason: 'invalid-history-position' }
    if (!hasKing(record.board, 'red') || !hasKing(record.board, 'black')) return { ok: false, reason: 'history-after-terminal' }
    const next = history[index + 1] ?? { board, turn }
    const transition = getXiangqiHistoryMove(record.board, next.board, record.turn, options)
    if (!transition) return { ok: false, reason: 'illegal-history-move' }
    const legacyKingCapture = index === history.length - 1 && transition.capture && record.board[transition.move.toR][transition.move.toC]?.type === 'k' && !hasKing(next.board, other(record.turn))
    if (inCheck(record.board, other(record.turn)) && !legacyKingCapture) return { ok: false, reason: 'nonmoving-side-in-check' }
    const expected = other(record.turn)
    if (next.turn !== expected) {
      // Earlier UI versions left turn on the winning mover after mate/stalemate/capture.
      // This exception is proven from the final board, never from a saved winner label.
      if (index !== history.length - 1 || next.turn !== record.turn || getXiangqiWinner(next.board, expected) === null) return { ok: false, reason: 'nonalternating-history' }
    }
    if (index === history.length - 1) {
      if (inCheck(next.board, record.turn)) return { ok: false, reason: 'mover-left-in-check' }
      return { ok: true, turn: expected }
    }
  }
  // A board-only backup can prove a captured king or a mated nonmoving king.
  // Stalemate alone cannot prove a stale turn without a prior move: the other
  // side may simply have no moves while it is legitimately this side's turn.
  let normalTurn = turn
  if (!hasKing(board, other(turn)) || inCheck(board, other(turn)) && getXiangqiWinner(board, turn) === null && getXiangqiWinner(board, other(turn)) !== null) normalTurn = other(turn)
  if (inCheck(board, other(normalTurn))) return { ok: false, reason: 'nonmoving-side-in-check' }
  return { ok: true, turn: normalTurn }
}
