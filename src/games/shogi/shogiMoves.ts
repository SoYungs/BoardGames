import type { Board, Hand, Move, Piece, PieceType, Side } from './shogiTypes'
import { COLS, ROWS } from './shogiTypes'
import { applyShogiMove, canPromote, mustPromote } from './shogiBoard'

const FWD: Record<Side, number> = { sente: -1, gote: 1 }

function pushIf(board: Board, r: number, c: number, side: Side, out: Move[], fr: number, fc: number) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return
  const t = board[r][c]
  if (!t || t.side !== side) out.push({ fromR: fr, fromC: fc, toR: r, toC: c })
}

function goldMoves(board: Board, r: number, c: number, side: Side, out: Move[], fr: number, fc: number) {
  const f = FWD[side]
  for (const [dr, dc] of [
    [f, 0],
    [f, -1],
    [f, 1],
    [0, -1],
    [0, 1],
    [-f, 0],
  ]) {
    pushIf(board, r + dr, c + dc, side, out, fr, fc)
  }
}

function kingMoves(board: Board, r: number, c: number, side: Side, out: Move[], fr: number, fc: number) {
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
    pushIf(board, r + dr, c + dc, side, out, fr, fc)
  }
}

function silverMoves(board: Board, r: number, c: number, side: Side, out: Move[], fr: number, fc: number) {
  const f = FWD[side]
  for (const [dr, dc] of [
    [f, 0],
    [f, -1],
    [f, 1],
    [-f, -1],
    [-f, 1],
  ]) {
    pushIf(board, r + dr, c + dc, side, out, fr, fc)
  }
}

function knightMoves(board: Board, r: number, c: number, side: Side, out: Move[], fr: number, fc: number) {
  const f = FWD[side]
  for (const dc of [-1, 1]) {
    pushIf(board, r + 2 * f, c + dc, side, out, fr, fc)
  }
}

function lanceRay(board: Board, r: number, c: number, side: Side, out: Move[], fr: number, fc: number) {
  const f = FWD[side]
  let nr = r + f
  while (nr >= 0 && nr < ROWS) {
    const t = board[nr][c]
    if (!t) out.push({ fromR: fr, fromC: fc, toR: nr, toC: c })
    else {
      if (t.side !== side) out.push({ fromR: fr, fromC: fc, toR: nr, toC: c })
      break
    }
    nr += f
  }
}

function rookRay(board: Board, r: number, c: number, side: Side, out: Move[], fr: number, fc: number) {
  for (const [dr, dc] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    let nr = r + dr
    let nc = c + dc
    while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
      const t = board[nr][nc]
      if (!t) out.push({ fromR: fr, fromC: fc, toR: nr, toC: nc })
      else {
        if (t.side !== side) out.push({ fromR: fr, fromC: fc, toR: nr, toC: nc })
        break
      }
      nr += dr
      nc += dc
    }
  }
}

function bishopRay(board: Board, r: number, c: number, side: Side, out: Move[], fr: number, fc: number) {
  for (const [dr, dc] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    let nr = r + dr
    let nc = c + dc
    while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
      const t = board[nr][nc]
      if (!t) out.push({ fromR: fr, fromC: fc, toR: nr, toC: nc })
      else {
        if (t.side !== side) out.push({ fromR: fr, fromC: fc, toR: nr, toC: nc })
        break
      }
      nr += dr
      nc += dc
    }
  }
}

function pawnMoves(board: Board, r: number, c: number, side: Side, out: Move[], fr: number, fc: number) {
  pushIf(board, r + FWD[side], c, side, out, fr, fc)
}

function movesForPiece(board: Board, r: number, c: number, piece: Piece, out: Move[]) {
  const { side, type, promoted } = piece
  const fr = r
  const fc = c
  if (promoted && type !== 'r' && type !== 'b') {
    goldMoves(board, r, c, side, out, fr, fc)
    return
  }
  switch (type) {
    case 'k':
      kingMoves(board, r, c, side, out, fr, fc)
      break
    case 'g':
      goldMoves(board, r, c, side, out, fr, fc)
      break
    case 's':
      silverMoves(board, r, c, side, out, fr, fc)
      break
    case 'n':
      knightMoves(board, r, c, side, out, fr, fc)
      break
    case 'l':
      lanceRay(board, r, c, side, out, fr, fc)
      break
    case 'r':
      rookRay(board, r, c, side, out, fr, fc)
      if (promoted) kingMoves(board, r, c, side, out, fr, fc)
      break
    case 'b':
      bishopRay(board, r, c, side, out, fr, fc)
      if (promoted) kingMoves(board, r, c, side, out, fr, fc)
      break
    case 'p':
      pawnMoves(board, r, c, side, out, fr, fc)
      break
    default:
      break
  }
}

function dropBlockedRank(type: PieceType, r: number, side: Side): boolean {
  if (type === 'p') return side === 'sente' ? r === 0 : r === 8
  if (type === 'l') return side === 'sente' ? r === 0 : r === 8
  if (type === 'n') return side === 'sente' ? r <= 1 : r >= 7
  return false
}

export function dropMoves(board: Board, hand: Hand, side: Side): Move[] {
  const out: Move[] = []
  const types = new Set(hand[side])
  for (const type of types) {
    if (type === 'k') continue
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) continue
        if (dropBlockedRank(type, r, side)) continue
        if (type === 'p') {
          let hasPawn = false
          for (let rr = 0; rr < ROWS; rr++) {
            const cell = board[rr][c]
            if (cell?.side === side && cell.type === 'p' && !cell.promoted) hasPawn = true
          }
          if (hasPawn) continue
        }
        out.push({ toR: r, toC: c, dropType: type })
      }
    }
  }
  return out
}

export function legalMovesFrom(board: Board, r: number, c: number): Move[] {
  const piece = board[r]?.[c]
  if (!piece) return []
  const raw: Move[] = []
  movesForPiece(board, r, c, piece, raw)
  // Promoted major pieces include some overlapping one-step rays.
  return [...new Map(raw.map((m) => [`${m.toR},${m.toC}`, m])).values()]
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

export function inCheck(board: Board, side: Side): boolean {
  const k = findKing(board, side)
  if (!k) return true
  const [kr, kc] = k
  const opp: Side = side === 'sente' ? 'gote' : 'sente'
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c]
      if (p?.side !== opp) continue
      const hits = legalMovesFrom(board, r, c)
      if (hits.some((m) => m.toR === kr && m.toC === kc)) return true
    }
  }
  return false
}

export function legalMovesFromChecked(board: Board, hand: Hand, r: number, c: number): Move[] {
  const piece = board[r]?.[c]
  if (!piece) return []
  const moves = legalMovesFrom(board, r, c).flatMap((m) => {
    if (board[m.toR][m.toC]?.type === 'k') return []
    if (mustPromote(piece, m.toR, piece.side)) return [{ ...m, promote: true }]
    if (canPromote(piece, r, m.toR)) return [{ ...m, promote: false }, { ...m, promote: true }]
    return [m]
  })
  return moves.filter((m) => {
    const { board: next } = applyShogiMove(board, hand, m, piece.side)
    return !inCheck(next, piece.side)
  })
}

function pawnDropMates(board: Board, hand: Hand, side: Side, move: Move): boolean {
  if (move.dropType !== 'p') return false
  const opponent: Side = side === 'sente' ? 'gote' : 'sente'
  const king = findKing(board, opponent)
  if (!king || king[0] !== move.toR + FWD[side] || king[1] !== move.toC) return false

  // A pawn checks the adjacent square, so no dropped piece can interpose.
  // Every possible reply must move the king or capture the checking pawn.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]?.side === opponent && legalMovesFromChecked(board, hand, r, c).length > 0) {
        return false
      }
    }
  }
  return true
}

export function allLegalMovesChecked(board: Board, hand: Hand, side: Side): Move[] {
  const out: Move[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c]
      if (p?.side === side) out.push(...legalMovesFromChecked(board, hand, r, c))
    }
  }
  out.push(...legalDropMoves(board, hand, side))
  return out
}

export function* legalDropMoves(board: Board, hand: Hand, side: Side, check: () => void = () => {}): Generator<Move> {
  for (const move of dropMoves(board, hand, side)) {
    check()
    const { board: next, hand: nextHand } = applyShogiMove(board, hand, move, side)
    if (!inCheck(next, side) && !pawnDropMates(next, nextHand, side, move)) yield move
  }
}

export { pickAiMoveShogi } from './shogiAi'
