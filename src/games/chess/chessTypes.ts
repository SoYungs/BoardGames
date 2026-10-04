export type Side = 'white' | 'black'
export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p'
export type PromotionPieceType = 'q' | 'r' | 'b' | 'n'
export const PROMOTION_PIECES: readonly PromotionPieceType[] = ['q', 'r', 'b', 'n']

export const PIECE_NAMES: Record<PieceType, string> = {
  k: '王', q: '后', r: '车', b: '象', n: '马', p: '兵',
}

export interface Piece {
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
  promotion?: PromotionPieceType
  castle?: 'kingside' | 'queenside'
}

export interface CastlingRights {
  white: { kingside: boolean; queenside: boolean }
  black: { kingside: boolean; queenside: boolean }
}

export interface GameMeta {
  castling: CastlingRights
  enPassant: [number, number] | null
}

export const ROWS = 8
export const COLS = 8

export const PIECE_VALUE: Record<PieceType, number> = {
  k: 100_000,
  q: 90,
  r: 50,
  b: 33,
  n: 32,
  p: 10,
}

const WHITE_SYM: Record<PieceType, string> = {
  k: '♔',
  q: '♕',
  r: '♖',
  b: '♗',
  n: '♘',
  p: '♙',
}

const BLACK_SYM: Record<PieceType, string> = {
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
}

export function pieceChar(p: Piece): string {
  return p.side === 'white' ? WHITE_SYM[p.type] : BLACK_SYM[p.type]
}
