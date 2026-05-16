export type Side = 'white' | 'black'
export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p'

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
  promotion?: PieceType
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
