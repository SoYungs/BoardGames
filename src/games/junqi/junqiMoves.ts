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

/** 工兵可以在连通的铁路上转弯，任何棋子都会阻断通路。 */
function engineerRailwayMoves(board: Board, r: number, c: number, side: Side): Move[] {
  const out: Move[] = []
  const queue: [number, number][] = [[r, c]]
  const visited = new Set([`${r},${c}`])
  for (let index = 0; index < queue.length; index++) {
    const [currentR, currentC] = queue[index]
    for (const [nr, nc] of roadNeighbors(currentR, currentC)) {
      const key = `${nr},${nc}`
      if (!isRailway(nr, nc) || visited.has(key)) continue
      visited.add(key)
      const target = board[nr][nc]
      if (!target || (target.side !== side && !isCamp(nr, nc))) {
        out.push({ fromR: r, fromC: c, toR: nr, toC: nc })
      }
      if (!target && !isHeadquarters(nr, nc)) queue.push([nr, nc])
    }
  }
  return out
}

export function movesForPiece(board: Board, r: number, c: number, piece: Piece): Move[] {
  if (!canMoveType(piece.type) || isHeadquarters(r, c)) return []
  const { side } = piece
  const out: Move[] = []

  for (const [nr, nc] of roadNeighbors(r, c)) {
    const t = board[nr][nc]
    if (!t || t.side !== side) out.push({ fromR: r, fromC: c, toR: nr, toC: nc })
  }
  if (isRailway(r, c)) {
    out.push(...(piece.type === 'engineer'
      ? engineerRailwayMoves(board, r, c, side)
      : railwaySlides(board, r, c, side)))
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

export function allLegalMoves(board: Board, side: Side): Move[] {
  const moves: Move[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c]
      if (p?.side === side) moves.push(...legalMovesFrom(board, r, c, side))
    }
  }
  return moves
}

/** 下一位行棋方失去军旗或已无合法走法，均告负；双方适用同一规则。 */
export function getWinnerJunqi(board: Board, nextTurn: Side): Side | null {
  for (const side of ['red', 'blue'] as Side[]) {
    if (!board.some((row) => row.some((piece) => piece?.side === side && piece.type === 'flag'))) {
      return side === 'red' ? 'blue' : 'red'
    }
  }
  if (allLegalMoves(board, nextTurn).length === 0) return nextTurn === 'red' ? 'blue' : 'red'
  return null
}

export { pickAiMoveJunqi } from './junqiAi'
