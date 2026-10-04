import { pseudoLegalMovesFrom } from './xiangqiMoves'
import type { Board, Move, Piece, PieceType, Side } from './xiangqiTypes'

const TYPES: PieceType[] = ['k', 'a', 'b', 'n', 'r', 'c', 'p']
const VALUES: Record<PieceType, number> = { k: 0, a: 200, b: 210, n: 440, r: 900, c: 480, p: 100 }
const sideIndex = (side: Side) => side === 'red' ? 0 : 1
const sign = (side: Side) => side === 'red' ? 1 : -1
let seed = 0x69c4a713
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0 }
const HASH = Uint32Array.from({ length: 14 * 90 }, random)
const LOCK = Uint32Array.from({ length: 14 * 90 }, random)
const code = (piece: Piece, r: number, c: number) => (sideIndex(piece.side) * 7 + TYPES.indexOf(piece.type)) * 90 + r * 9 + c

export function xiangqiPieceValue(type: PieceType): number { return VALUES[type] }

export function xiangqiPlacement(piece: Piece, r: number, c: number): number {
  const advance = piece.side === 'red' ? 9 - r : r
  const center = 4 - Math.abs(4 - c)
  switch (piece.type) {
    case 'p': return advance * 5 + (advance >= 5 ? 40 + center * 9 : center * 2)
    case 'n': return center * 9 + Math.min(advance, 6) * 6 - (c === 0 || c === 8 ? 25 : 0)
    case 'c': return center * 6 + (advance >= 2 && advance <= 5 ? 20 : 0)
    case 'r': return center * 3 + advance * 4
    case 'b': return 14 - Math.abs(4 - c) * 2
    case 'a': return c === 4 ? 18 : 8
    case 'k': return -Math.abs(4 - c) * 10 - advance * 8
  }
}

function palace(r: number, c: number, side: Side): boolean {
  return c >= 3 && c <= 5 && (side === 'black' ? r >= 0 && r <= 2 : r >= 7 && r <= 9)
}

/** Private mutable copy for search. Every make is paired with an unmake, even on timeout. */
export class XiangqiSearchPosition {
  readonly board: Board
  private readonly kings: number[] = [-1, -1]
  hash = 0
  lock = 0
  score = 0

  constructor(board: Board) {
    this.board = board.map(row => row.slice())
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      const piece = board[r][c]
      if (!piece) continue
      this.toggle(piece, r, c)
      this.score += sign(piece.side) * (VALUES[piece.type] + xiangqiPlacement(piece, r, c))
      if (piece.type === 'k') this.kings[sideIndex(piece.side)] = r * 9 + c
    }
  }

  private toggle(piece: Piece, r: number, c: number) {
    const index = code(piece, r, c)
    this.hash = (this.hash ^ HASH[index]) >>> 0
    this.lock = (this.lock ^ LOCK[index]) >>> 0
  }

  make(move: Move): Piece | null {
    const { fromR: r, fromC: c, toR: rr, toC: cc } = move
    const piece = this.board[r][c]!
    const captured = this.board[rr][cc]
    this.toggle(piece, r, c)
    this.toggle(piece, rr, cc)
    this.score += sign(piece.side) * (xiangqiPlacement(piece, rr, cc) - xiangqiPlacement(piece, r, c))
    if (captured) {
      this.toggle(captured, rr, cc)
      this.score -= sign(captured.side) * (VALUES[captured.type] + xiangqiPlacement(captured, rr, cc))
      if (captured.type === 'k') this.kings[sideIndex(captured.side)] = -1
    }
    this.board[rr][cc] = piece
    this.board[r][c] = null
    if (piece.type === 'k') this.kings[sideIndex(piece.side)] = rr * 9 + cc
    return captured
  }

  unmake(move: Move, captured: Piece | null): void {
    const { fromR: r, fromC: c, toR: rr, toC: cc } = move
    const piece = this.board[rr][cc]!
    this.toggle(piece, r, c)
    this.toggle(piece, rr, cc)
    this.score -= sign(piece.side) * (xiangqiPlacement(piece, rr, cc) - xiangqiPlacement(piece, r, c))
    if (captured) {
      this.toggle(captured, rr, cc)
      this.score += sign(captured.side) * (VALUES[captured.type] + xiangqiPlacement(captured, rr, cc))
      if (captured.type === 'k') this.kings[sideIndex(captured.side)] = rr * 9 + cc
    }
    this.board[r][c] = piece
    this.board[rr][cc] = captured
    if (piece.type === 'k') this.kings[sideIndex(piece.side)] = r * 9 + c
  }

  inCheck(side: Side): boolean {
    const square = this.kings[sideIndex(side)]
    if (square < 0) return true
    const r = Math.floor(square / 9), c = square % 9
    const enemy: Side = side === 'red' ? 'black' : 'red'
    const board = this.board
    // From the general, the first occupied square can be a rook/flying general;
    // the second can be a cannon. Every colour of piece counts as a screen.
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let screens = 0
      for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < 10 && cc >= 0 && cc < 9; rr += dr, cc += dc) {
        const piece = board[rr][cc]
        if (!piece) continue
        if (piece.side === enemy && (screens === 0 && (piece.type === 'r' || piece.type === 'k' && (dc === 0 || Math.abs(rr - r) + Math.abs(cc - c) === 1 && palace(r, c, enemy))) || screens === 1 && piece.type === 'c')) return true
        if (++screens === 2) break
      }
    }
    for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
      const rr = r + dr, cc = c + dc
      const piece = board[rr]?.[cc]
      if (piece?.side !== enemy || piece.type !== 'n') continue
      const legR = Math.abs(dr) === 2 ? r + dr / 2 : rr
      const legC = Math.abs(dc) === 2 ? c + dc / 2 : cc
      if (!board[legR][legC]) return true
    }
    const pawn = board[r + (enemy === 'red' ? 1 : -1)]?.[c]
    if (pawn?.side === enemy && pawn.type === 'p') return true
    if (enemy === 'red' ? r <= 4 : r >= 5) for (const cc of [c - 1, c + 1]) {
      const piece = board[r][cc]
      if (piece?.side === enemy && piece.type === 'p') return true
    }
    // These also preserve the public move generator's behaviour for test/editor
    // positions containing a general in an unusual half of the board.
    for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const advisor = board[r + dr]?.[c + dc]
      if (advisor?.side === enemy && advisor.type === 'a' && palace(r, c, enemy) && Math.abs(r - (enemy === 'black' ? 1 : 8)) === Math.abs(c - 4)) return true
      const elephant = board[r + dr * 2]?.[c + dc * 2]
      if (elephant?.side === enemy && elephant.type === 'b' && (enemy === 'red' ? r >= 5 : r <= 4) && !board[r + dr]?.[c + dc]) return true
    }
    return false
  }

  legalMoves(side: Side, check: () => void = () => {}): Move[] {
    const moves: Move[] = []
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      check()
      if (this.board[r][c]?.side !== side) continue
      for (const move of pseudoLegalMovesFrom(this.board, r, c)) {
        check()
        const captured = this.make(move)
        try { if (!this.inCheck(side)) moves.push(move) } finally { this.unmake(move, captured) }
      }
    }
    return moves
  }

  hasLegalMove(side: Side, check: () => void = () => {}): boolean {
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      check()
      if (this.board[r][c]?.side !== side) continue
      for (const move of pseudoLegalMovesFrom(this.board, r, c)) {
        check()
        const captured = this.make(move)
        try { if (!this.inCheck(side)) return true } finally { this.unmake(move, captured) }
      }
    }
    return false
  }

  evaluate(side: Side): number {
    let score = this.score
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      const piece = this.board[r][c]
      if (!piece) continue
      let bonus = 0
      if (piece.type === 'n') for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.board[r + dr]?.[c + dc]) bonus -= 9
      if (piece.type === 'r') for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < 10 && cc >= 0 && cc < 9 && !this.board[rr][cc]; rr += dr, cc += dc) bonus += 3
      }
      const enemyKing = this.kings[sideIndex(piece.side) ^ 1]
      if (enemyKing >= 0) {
        const kr = Math.floor(enemyKing / 9), kc = enemyKing % 9
        if ((piece.type === 'r' || piece.type === 'c') && (r === kr || c === kc)) {
          const dr = Math.sign(kr - r), dc = Math.sign(kc - c)
          let screens = 0
          for (let rr = r + dr, cc = c + dc; rr !== kr || cc !== kc; rr += dr, cc += dc) if (this.board[rr][cc]) screens++
          // A cannon with zero/two screens threatens to create a checking line;
          // do not mistake potential pressure for an actual forced win.
          bonus += piece.type === 'c' ? [32, 110, 52][screens] ?? 0 : screens === 0 ? 100 : screens === 1 ? 28 : 0
        }
        if (piece.type === 'n' && Math.abs(r - kr) + Math.abs(c - kc) <= 4) bonus += 30
        if (piece.type === 'p' && Math.abs(r - kr) + Math.abs(c - kc) <= 2) bonus += 40
      }
      score += sign(piece.side) * bonus
    }
    return sign(side) * score
  }
}
