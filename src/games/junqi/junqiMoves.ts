import type { Board, Move, Piece, Side } from './junqiTypes'
import { COLS, ROWS } from './junqiTypes'
import { canMoveType } from './junqiCombat'
import { isCamp, isHeadquarters, isRailway } from './junqiBoard'

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS
}

function roadNeighbors(r: number, c: number): [number, number][] {
  const out: [number, number][] = []
  for (const [dr, dc] of DIRS) {
    const nr = r + dr
    const nc = c + dc
    if (!inBounds(nr, nc)) continue
    if (isHeadquarters(nr, nc) && !isHeadquarters(r, c)) continue
    out.push([nr, nc])
  }
  return out
}

function railwaySlides(board: Board, r: number, c: number, side: Side): Move[] {
  const out: Move[] = []
  for (const [dr, dc] of DIRS) {
    let nr = r + dr
    let nc = c + dc
    while (inBounds(nr, nc) && isRailway(nr, nc)) {
      const t = board[nr][nc]
      if (!t) out.push({ fromR: r, fromC: c, toR: nr, toC: nc })
      else {
        if (t.side !== side) out.push({ fromR: r, fromC: c, toR: nr, toC: nc })
        break
      }
      nr += dr
      nc += dc
    }
  }
  return out
}

export function movesForPiece(board: Board, r: number, c: number, piece: Piece): Move[] {
  if (!canMoveType(piece.type)) return []
  const { side } = piece
  const out: Move[] = []

  if (isRailway(r, c)) {
    out.push(...railwaySlides(board, r, c, side))
  } else {
    for (const [nr, nc] of roadNeighbors(r, c)) {
      const t = board[nr][nc]
      if (!t || t.side !== side) out.push({ fromR: r, fromC: c, toR: nr, toC: nc })
    }
  }

  const seen = new Set<string>()
  return out.filter((m) => {
    const k = `${m.toR},${m.toC}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function legalMovesFrom(board: Board, r: number, c: number, side: Side): Move[] {
  const piece = board[r][c]
  if (!piece || piece.side !== side) return []
  return movesForPiece(board, r, c, piece).filter((m) => {
    const t = board[m.toR][m.toC]
    if (t?.side === side) return false
    if (isCamp(m.toR, m.toC) && t) return false
    return true
  })
}

export function pickAiMoveJunqi(board: Board, side: Side): Move | null {
  const moves: Move[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c]
      if (p?.side === side) moves.push(...legalMovesFrom(board, r, c, side))
    }
  }
  if (moves.length === 0) return null
  return moves[Math.floor(Math.random() * moves.length)]!
}
