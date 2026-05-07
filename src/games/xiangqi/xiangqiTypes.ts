export type Side = 'red' | 'black'
export type PieceType = 'k' | 'a' | 'b' | 'n' | 'r' | 'c' | 'p'

export interface Piece {
  /** 稳定实例 id，用于位移动画与被吃退场 */
  id: string
  side: Side
  type: PieceType
}

export type Board = (Piece | null)[][]

export interface Move {
  fromR: number
  fromC: number
  toR: number
  toC: number
}

export const ROWS = 10
export const COLS = 9

export const PIECE_VALUE: Record<PieceType, number> = {
  k: 100_000,
  r: 90,
  c: 45,
  n: 40,
  b: 20,
  a: 20,
  p: 10,
}

export function pieceChar(p: Piece): string {
  const black: Record<PieceType, string> = {
    k: '将',
    a: '士',
    b: '象',
    n: '马',
    r: '车',
    c: '炮',
    p: '卒',
  }
  const red: Record<PieceType, string> = {
    k: '帅',
    a: '仕',
    b: '相',
    n: '马',
    r: '车',
    c: '炮',
    p: '兵',
  }
  return p.side === 'black' ? black[p.type] : red[p.type]
}
