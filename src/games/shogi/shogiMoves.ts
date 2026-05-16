import type { Board, Hand, Move, Piece, PieceType, Side } from './shogiTypes'
import { COLS, PIECE_VALUE, ROWS } from './shogiTypes'
import { applyShogiMove } from './shogiBoard'

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
    [-f, -1],
    [-f, 1],
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
  const piece = board[r][c]
  if (!piece) return []
  const raw: Move[] = []
  movesForPiece(board, r, c, piece, raw)
  return raw
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
  const piece = board[r][c]
  if (!piece) return []
  return legalMovesFrom(board, r, c).filter((m) => {
    const { board: next } = applyShogiMove(board, hand, m, piece.side)
    return !inCheck(next, piece.side)
  })
}

export function allLegalMovesChecked(board: Board, hand: Hand, side: Side): Move[] {
  const out: Move[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c]
      if (p?.side === side) out.push(...legalMovesFromChecked(board, hand, r, c))
    }
  }
  out.push(
    ...dropMoves(board, hand, side).filter((m) => {
      const { board: next } = applyShogiMove(board, hand, m, side)
      return !inCheck(next, side)
    }),
  )
  return out
}

export function pickAiMoveShogi(board: Board, hand: Hand, side: Side): Move | null {
  const moves = allLegalMovesChecked(board, hand, side)
  if (moves.length === 0) return null
  const scored = moves.map((m) => {
    const { board: next } = applyShogiMove(board, hand, m, side)
    const cap = board[m.toR]?.[m.toC]
    let s = cap ? PIECE_VALUE[cap.type] * 3 : 0
    if (m.dropType) s += PIECE_VALUE[m.dropType]
    if (inCheck(next, side === 'sente' ? 'gote' : 'sente')) s += 12
    return { m, s: s + Math.random() * 4 }
  })
  scored.sort((a, b) => b.s - a.s)
  return scored[0]!.m
}
