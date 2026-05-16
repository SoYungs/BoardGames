import type { Board, GameMeta, Move, Piece, Side } from './chessTypes'
import { COLS, PIECE_VALUE, ROWS } from './chessTypes'
import { applyMove } from './chessBoard'

function pushIfEmptyOrEnemy(
  board: Board,
  r: number,
  c: number,
  side: Side,
  out: Move[],
  fr: number,
  fc: number,
) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return
  const t = board[r][c]
  if (!t || t.side !== side) out.push({ fromR: fr, fromC: fc, toR: r, toC: c })
}

function ray(board: Board, r: number, c: number, side: Side, dr: number, dc: number, out: Move[]) {
  let nr = r + dr
  let nc = c + dc
  while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
    const t = board[nr][nc]
    if (!t) {
      out.push({ fromR: r, fromC: c, toR: nr, toC: nc })
    } else {
      if (t.side !== side) out.push({ fromR: r, fromC: c, toR: nr, toC: nc })
      break
    }
    nr += dr
    nc += dc
  }
}

function knightMoves(board: Board, r: number, c: number, side: Side, out: Move[]) {
  for (const [dr, dc] of [
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
  ]) {
    pushIfEmptyOrEnemy(board, r + dr, c + dc, side, out, r, c)
  }
}

function kingSteps(board: Board, r: number, c: number, side: Side, out: Move[]) {
  for (const [dr, dc] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    pushIfEmptyOrEnemy(board, r + dr, c + dc, side, out, r, c)
  }
}

function pawnMoves(board: Board, meta: GameMeta, r: number, c: number, side: Side, out: Move[]) {
  const dir = side === 'white' ? -1 : 1
  const startRow = side === 'white' ? 6 : 1
  const promoRow = side === 'white' ? 0 : 7
  const nr = r + dir
  if (nr < 0 || nr >= ROWS) return
  if (!board[nr][c]) {
    const promo = nr === promoRow ? 'q' as const : undefined
    out.push({ fromR: r, fromC: c, toR: nr, toC: c, promotion: promo })
    if (r === startRow) {
      const nr2 = r + 2 * dir
      if (!board[nr2][c]) out.push({ fromR: r, fromC: c, toR: nr2, toC: c })
    }
  }
  for (const dc of [-1, 1]) {
    const nc = c + dc
    if (nc < 0 || nc >= COLS) continue
    const target = board[nr][nc]
    if (target && target.side !== side) {
      const promo = nr === promoRow ? 'q' as const : undefined
      out.push({ fromR: r, fromC: c, toR: nr, toC: nc, promotion: promo })
    }
    if (
      meta.enPassant &&
      meta.enPassant[0] === nr &&
      meta.enPassant[1] === nc &&
      !target
    ) {
      out.push({ fromR: r, fromC: c, toR: nr, toC: nc })
    }
  }
}

function castlingMoves(board: Board, meta: GameMeta, side: Side, out: Move[]) {
  const row = side === 'white' ? 7 : 0
  const rights = meta.castling[side]
  const king = board[row][4]
  if (!king || king.type !== 'k' || king.side !== side) return

  if (rights.kingside) {
    const r1 = board[row][5]
    const r2 = board[row][6]
    const rook = board[row][7]
    if (!r1 && !r2 && rook?.type === 'r' && rook.side === side) {
      if (!squareAttacked(board, row, 4, side) && !squareAttacked(board, row, 5, side) && !squareAttacked(board, row, 6, side)) {
        out.push({ fromR: row, fromC: 4, toR: row, toC: 6, castle: 'kingside' })
      }
    }
  }
  if (rights.queenside) {
    const r1 = board[row][1]
    const r2 = board[row][2]
    const r3 = board[row][3]
    const rook = board[row][0]
    if (!r1 && !r2 && !r3 && rook?.type === 'r' && rook.side === side) {
      if (!squareAttacked(board, row, 4, side) && !squareAttacked(board, row, 3, side) && !squareAttacked(board, row, 2, side)) {
        out.push({ fromR: row, fromC: 4, toR: row, toC: 2, castle: 'queenside' })
      }
    }
  }
}

function movesForPiece(board: Board, meta: GameMeta, r: number, c: number, piece: Piece, out: Move[]) {
  const { side, type } = piece
  switch (type) {
    case 'r':
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        ray(board, r, c, side, dr, dc, out)
      }
      break
    case 'b':
      for (const [dr, dc] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        ray(board, r, c, side, dr, dc, out)
      }
      break
    case 'q':
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        ray(board, r, c, side, dr, dc, out)
      }
      break
    case 'n':
      knightMoves(board, r, c, side, out)
      break
    case 'k':
      kingSteps(board, r, c, side, out)
      break
    case 'p':
      pawnMoves(board, meta, r, c, side, out)
      break
    default:
      break
  }
}

export function findKing(board: Board, side: Side): [number, number] | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c]
      if (p?.type === 'k' && p.side === side) return [r, c]
    }
  }
  return null
}

function squareAttacked(board: Board, r: number, c: number, defender: Side): boolean {
  const attacker: Side = defender === 'white' ? 'black' : 'white'
  for (let rr = 0; rr < ROWS; rr++) {
    for (let cc = 0; cc < COLS; cc++) {
      const p = board[rr][cc]
      if (p?.side !== attacker) continue
      const raw: Move[] = []
      if (p.type === 'p') {
        const dir = attacker === 'white' ? -1 : 1
        if (rr + dir === r && (cc + 1 === c || cc - 1 === c)) return true
        continue
      }
      if (p.type === 'k') {
        if (Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1) return true
        continue
      }
      movesForPiece(board, { castling: { white: { kingside: false, queenside: false }, black: { kingside: false, queenside: false } }, enPassant: null }, rr, cc, p, raw)
      if (raw.some((m) => m.toR === r && m.toC === c)) return true
    }
  }
  return false
}

export function inCheck(board: Board, side: Side): boolean {
  const k = findKing(board, side)
  if (!k) return true
  return squareAttacked(board, k[0], k[1], side)
}

export function legalMovesFrom(board: Board, meta: GameMeta, r: number, c: number): Move[] {
  const piece = board[r][c]
  if (!piece) return []
  const raw: Move[] = []
  movesForPiece(board, meta, r, c, piece, raw)
  if (piece.type === 'k') castlingMoves(board, meta, piece.side, raw)
  return raw
}

export function legalMovesFromChecked(board: Board, meta: GameMeta, r: number, c: number): Move[] {
  const piece = board[r][c]
  if (!piece) return []
  return legalMovesFrom(board, meta, r, c).filter((m) => {
    const { board: next } = applyMove(board, meta, m)
    return !inCheck(next, piece.side)
  })
}

export function allLegalMovesChecked(board: Board, meta: GameMeta, side: Side): Move[] {
  const out: Move[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c]
      if (p?.side === side) out.push(...legalMovesFromChecked(board, meta, r, c))
    }
  }
  return out
}

function orderMovesCapturesFirst(board: Board, moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const ca = board[a.toR][a.toC]
    const cb = board[b.toR][b.toC]
    const va = ca ? PIECE_VALUE[ca.type] * 20 : 0
    const vb = cb ? PIECE_VALUE[cb.type] * 20 : 0
    return vb - va
  })
}

const MATE = 8_000_000

function evaluateMaterial(board: Board, side: Side): number {
  let s = 0
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c]
      if (p?.side === side) s += PIECE_VALUE[p.type]
    }
  }
  return s
}

function negamaxChess(
  board: Board,
  meta: GameMeta,
  toMove: Side,
  depth: number,
  alpha: number,
  beta: number,
  rootSide: Side,
): number {
  const moves = orderMovesCapturesFirst(board, allLegalMovesChecked(board, meta, toMove))
  if (moves.length === 0) {
    if (inCheck(board, toMove)) return -MATE + depth
    return 0
  }
  if (depth === 0) {
    const e = evaluateMaterial(board, rootSide) - evaluateMaterial(board, rootSide === 'white' ? 'black' : 'white')
    return toMove === rootSide ? e : -e
  }
  let best = -Infinity
  const limit = depth >= 2 ? 14 : 18
  for (let i = 0; i < Math.min(limit, moves.length); i++) {
    const m = moves[i]!
    const { board: next, meta: nextMeta } = applyMove(board, meta, m)
    const cap = board[m.toR][m.toC]
    let v: number
    if (cap?.type === 'k') {
      v = MATE - depth
    } else {
      const opp: Side = toMove === 'white' ? 'black' : 'white'
      v = -negamaxChess(next, nextMeta, opp, depth - 1, -beta, -alpha, rootSide)
    }
    if (v > best) best = v
    if (v > alpha) alpha = v
    if (alpha >= beta) break
  }
  return best
}

export function pickAiMoveChess(board: Board, meta: GameMeta, side: Side): Move | null {
  const moves = allLegalMovesChecked(board, meta, side)
  if (moves.length === 0) return null
  const sorted = orderMovesCapturesFirst(board, moves)
  let best = sorted[0]!
  let bestScore = -Infinity
  for (let i = 0; i < Math.min(18, sorted.length); i++) {
    const m = sorted[i]!
    const cap = board[m.toR][m.toC]
    const { board: next, meta: nextMeta } = applyMove(board, meta, m)
    if (cap?.type === 'k') return m
    const opp: Side = side === 'white' ? 'black' : 'white'
    const sc = -negamaxChess(next, nextMeta, opp, 2, -MATE, MATE, side)
    const noise = Math.random() * 2
    if (sc + noise > bestScore) {
      bestScore = sc + noise
      best = m
    }
  }
  return best
}
