export type Side = 'red' | 'blue'

/** 司令→军旗，数字越大越强；工兵/炸弹/地雷/军旗特殊处理见 combat */
export type PieceType =
  | 'commander'
  | 'army'
  | 'division'
  | 'brigade'
  | 'regiment'
  | 'battalion'
  | 'company'
  | 'platoon'
  | 'engineer'
  | 'bomb'
  | 'mine'
  | 'flag'

export interface Piece {
  id: string
  side: Side
  type: PieceType
  revealed: boolean
}

export type Board = (Piece | null)[][]

export interface Move {
  fromR: number
  fromC: number
  toR: number
  toC: number
}

export const ROWS = 6
export const COLS = 12

export const RANK: Record<PieceType, number> = {
  commander: 11,
  army: 10,
  division: 9,
  brigade: 8,
  regiment: 7,
  battalion: 6,
  company: 5,
  platoon: 4,
  engineer: 3,
  bomb: 2,
  mine: 1,
  flag: 0,
}

const LABEL: Record<PieceType, string> = {
  commander: '司',
  army: '军',
  division: '师',
  brigade: '旅',
  regiment: '团',
  battalion: '营',
  company: '连',
  platoon: '排',
  engineer: '工',
  bomb: '炸',
  mine: '雷',
  flag: '旗',
}

export function pieceLabel(p: Piece): string {
  return LABEL[p.type]
}

export function piecePool(): PieceType[] {
  return [
    'commander',
    'army',
    'division',
    'division',
    'brigade',
    'brigade',
    'regiment',
    'regiment',
    'battalion',
    'battalion',
    'company',
    'company',
    'company',
    'platoon',
    'platoon',
    'platoon',
    'engineer',
    'engineer',
    'engineer',
    'bomb',
    'bomb',
    'mine',
    'mine',
    'mine',
    'flag',
  ]
}
