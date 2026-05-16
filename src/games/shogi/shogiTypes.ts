export type Side = 'sente' | 'gote'
export type PieceType = 'k' | 'r' | 'b' | 'g' | 's' | 'n' | 'l' | 'p'

export interface Piece {
  id: string
  side: Side
  type: PieceType
  promoted: boolean
}

export type Board = (Piece | null)[][]

export interface Move {
  fromR?: number
  fromC?: number
  toR: number
  toC: number
  dropType?: PieceType
  promote?: boolean
}

export type Hand = Record<Side, PieceType[]>

export const ROWS = 9
export const COLS = 9

export const PIECE_VALUE: Record<PieceType, number> = {
  k: 100_000,
  r: 55,
  b: 55,
  g: 24,
  s: 18,
  n: 16,
  l: 14,
  p: 12,
}

const SENTE_CHAR: Record<PieceType, string> = {
  k: '玉',
  r: '飛',
  b: '角',
  g: '金',
  s: '銀',
  n: '桂',
  l: '香',
  p: '歩',
}

const PROMO_CHAR: Partial<Record<PieceType, string>> = {
  r: '龍',
  b: '馬',
  s: '全',
  n: '圭',
  l: '杏',
  p: 'と',
}

export function pieceChar(p: Piece): string {
  if (p.promoted && PROMO_CHAR[p.type]) return PROMO_CHAR[p.type]!
  return SENTE_CHAR[p.type]
}
