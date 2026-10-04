export const GO_SIZE = 9
export const GO_KOMI = 6.5

export type GoSide = 1 | 2
export type GoCell = 0 | GoSide
export type GoBoard = GoCell[][]
export type GoPoint = { r: number; c: number }
export type GoMove = { type: 'place'; r: number; c: number } | { type: 'pass' } | { type: 'resign'; side: GoSide }

export interface GoScore {
  black: { stones: number; territory: number; total: number }
  white: { stones: number; territory: number; komi: number; total: number }
  neutral: number
  ownership: GoBoard
}

export interface GoResult {
  winner: GoSide
  reason: 'score' | 'resign'
  margin?: number
  score?: GoScore
}

export interface GoPosition {
  board: GoBoard
  turn: GoSide
  /** The board before the previous turn; passing clears an immediate ko ban. */
  koBoard: GoBoard | null
  consecutivePasses: number
  captures: { black: number; white: number }
  lastMove: GoMove | null
  moveNumber: number
  result: GoResult | null
}

export interface GoGroup {
  side: GoSide
  stones: GoPoint[]
  liberties: GoPoint[]
}

export type GoMoveError = 'finished' | 'outside' | 'occupied' | 'suicide' | 'ko'
export type GoPlayResult = { ok: true; position: GoPosition; captured: GoPoint[] } | { ok: false; reason: GoMoveError }

export function otherGoSide(side: GoSide): GoSide {
  return side === 1 ? 2 : 1
}

export function goSideName(side: GoSide): string {
  return side === 1 ? '黑棋' : '白棋'
}
