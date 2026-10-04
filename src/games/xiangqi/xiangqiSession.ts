import type { Board, Move, Piece, PieceType, Side } from './xiangqiTypes'
import type { XiangqiRepetitionResult } from './xiangqiRepetition'

export type XiangqiMode = 'local' | 'ai'
export type XiangqiDepth = 4 | 6 | 8

export type XiangqiSnap = {
  board: Board
  turn: Side
  lastMove: Move | null
  winner: Side | null
  selected: [number, number] | null
  repetitionResult: XiangqiRepetitionResult | null
}

export type XiangqiSessionState = XiangqiSnap & {
  history: XiangqiSnap[]
  depth: XiangqiDepth
}

export type XiangqiSessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type XiangqiSessionLoad =
  | { kind: 'restored'; state: XiangqiSessionState }
  | { kind: 'empty' | 'invalid' | 'unavailable'; state: null }
export type XiangqiSessionSave = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' }

/** sessionStorage isolates each tab, and each play mode has its own complete game. */
export function xiangqiSessionKey(mode: XiangqiMode): string {
  return `boardgames.xiangqi.v1.${mode}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSide(value: unknown): value is Side {
  return value === 'red' || value === 'black'
}

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < limit
}

const pieceLimits: Record<PieceType, number> = { k: 1, a: 2, b: 2, n: 2, r: 2, c: 2, p: 5 }

function parseBoard(value: unknown, winner: Side | null): Board | null {
  if (!Array.isArray(value) || value.length !== 10) return null
  const board: Board = []
  const ids = new Set<string>()
  const counts = { red: { k: 0, a: 0, b: 0, n: 0, r: 0, c: 0, p: 0 }, black: { k: 0, a: 0, b: 0, n: 0, r: 0, c: 0, p: 0 } }
  for (const sourceRow of value) {
    if (!Array.isArray(sourceRow) || sourceRow.length !== 9) return null
    const row: (Piece | null)[] = []
    for (const cell of sourceRow) {
      if (cell === null) {
        row.push(null)
        continue
      }
      if (!isRecord(cell) || !isSide(cell.side) || typeof cell.type !== 'string' || !(cell.type in pieceLimits)) return null
      if (typeof cell.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(cell.id) || ids.has(cell.id)) return null
      const type = cell.type as PieceType
      // Use an own-property check: JSON values such as "constructor" are not piece types.
      if (!Object.hasOwn(pieceLimits, type)) return null
      if (++counts[cell.side][type] > pieceLimits[type]) return null
      ids.add(cell.id)
      row.push({ id: cell.id, side: cell.side, type })
    }
    board.push(row)
  }
  // A king can disappear on the final capture, but an unfinished game needs both.
  if (winner === null && (counts.red.k !== 1 || counts.black.k !== 1)) return null
  if (winner !== null && counts[winner].k !== 1) return null
  return board
}

function parseMove(value: unknown): Move | null | false {
  if (value === null) return null
  if (!isRecord(value) || !isCoordinate(value.fromR, 10) || !isCoordinate(value.toR, 10) || !isCoordinate(value.fromC, 9) || !isCoordinate(value.toC, 9)) return false
  if (value.fromR === value.toR && value.fromC === value.toC) return false
  return { fromR: value.fromR, fromC: value.fromC, toR: value.toR, toC: value.toC }
}

function parseSnap(value: unknown): XiangqiSnap | null {
  if (!isRecord(value) || !isSide(value.turn) || (value.winner !== null && !isSide(value.winner))) return null
  const winner = value.winner as Side | null
  const board = parseBoard(value.board, winner)
  const lastMove = parseMove(value.lastMove)
  if (!board || lastMove === false) return null
  let repetitionResult: XiangqiRepetitionResult | null = null
  if (value.repetitionResult !== null && value.repetitionResult !== undefined) {
    if (!isRecord(value.repetitionResult)) return null
    if (value.repetitionResult.kind === 'repetition-draw') {
      if (winner !== null) return null
      repetitionResult = { kind: 'repetition-draw' }
    } else if (value.repetitionResult.kind === 'perpetual-check') {
      if (!isSide(value.repetitionResult.winner) || !isSide(value.repetitionResult.offender) || value.repetitionResult.winner === value.repetitionResult.offender || winner !== value.repetitionResult.winner) return null
      repetitionResult = { kind: 'perpetual-check', winner: value.repetitionResult.winner, offender: value.repetitionResult.offender }
    } else return null
  }
  let selected: [number, number] | null = null
  if (value.selected !== null) {
    if (!Array.isArray(value.selected) || value.selected.length !== 2 || !isCoordinate(value.selected[0], 10) || !isCoordinate(value.selected[1], 9)) return null
    selected = [value.selected[0], value.selected[1]]
    if (board[selected[0]][selected[1]]?.side !== value.turn) return null
  }
  return { board, turn: value.turn, lastMove, winner, selected, repetitionResult }
}

/** Do not trust browser storage: an old, incomplete or edited save must not crash play. */
export function parseXiangqiSession(raw: string, mode: XiangqiMode): XiangqiSessionState | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || value.version !== 1 || value.mode !== mode || ![4, 6, 8].includes(value.depth as number) || !Array.isArray(value.history)) return null
    const current = parseSnap(value)
    if (!current) return null
    const history: XiangqiSnap[] = []
    for (const snapshot of value.history) {
      const parsed = parseSnap(snapshot)
      if (!parsed) return null
      history.push(parsed)
    }
    return { ...current, history, depth: value.depth as XiangqiDepth }
  } catch {
    return null
  }
}

function browserStorage(): XiangqiSessionStorage | null {
  return typeof window === 'undefined' ? null : window.sessionStorage
}

/** The same versioned format is used for automatic saves and portable JSON backups. */
export function serializeXiangqiSession(mode: XiangqiMode, state: XiangqiSessionState): string {
  return JSON.stringify({ ...state, version: 1, mode })
}

export function loadXiangqiSession(mode: XiangqiMode, storage?: XiangqiSessionStorage | null): XiangqiSessionLoad {
  try {
    const target = storage === undefined ? browserStorage() : storage
    if (!target) return { kind: 'unavailable', state: null }
    const raw = target.getItem(xiangqiSessionKey(mode))
    if (raw === null) return { kind: 'empty', state: null }
    const state = parseXiangqiSession(raw, mode)
    return state ? { kind: 'restored', state } : { kind: 'invalid', state: null }
  } catch {
    return { kind: 'unavailable', state: null }
  }
}

export function saveXiangqiSession(mode: XiangqiMode, state: XiangqiSessionState, storage?: XiangqiSessionStorage | null): XiangqiSessionSave {
  try {
    const target = storage === undefined ? browserStorage() : storage
    if (!target) return { ok: false, reason: 'unavailable' }
    // Save the entire history. If storage fills, report failure instead of silently dropping undo steps.
    target.setItem(xiangqiSessionKey(mode), serializeXiangqiSession(mode, state))
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: isRecord(error) && error.name === 'QuotaExceededError' ? 'quota' : 'unavailable' }
  }
}

export function clearXiangqiSession(mode: XiangqiMode, storage?: XiangqiSessionStorage | null): boolean {
  try {
    const target = storage === undefined ? browserStorage() : storage
    if (!target) return false
    target.removeItem(xiangqiSessionKey(mode))
    return true
  } catch {
    return false
  }
}
