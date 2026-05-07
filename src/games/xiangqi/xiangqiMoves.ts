import type { Board, Move, Piece, Side } from './xiangqiTypes'
import { COLS, PIECE_VALUE, ROWS } from './xiangqiTypes'
import { applyMove } from './xiangqiBoard'

function inBlackPalace(r: number, c: number): boolean {
  return r >= 0 && r <= 2 && c >= 3 && c <= 5
}

function inRedPalace(r: number, c: number): boolean {
  return r >= 7 && r <= 9 && c >= 3 && c <= 5
}

function inPalace(r: number, c: number, side: Side): boolean {
  return side === 'black' ? inBlackPalace(r, c) : inRedPalace(r, c)
}

export function flyingGeneral(board: Board): boolean {
  let red: [number, number] | null = null
  let black: [number, number] | null = null
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c]
      if (p?.type === 'k') {
        if (p.side === 'red') red = [r, c]
        else black = [r, c]
      }
    }
  }
  if (!red || !black) return false
  const [rr, rc] = red
  const [br, bc] = black
  if (rc !== bc) return false
  const lo = Math.min(rr, br)
  const hi = Math.max(rr, br)
  for (let r = lo + 1; r < hi; r++) {
    if (board[r][rc]) return false
  }
  return true
}

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

function rookRay(board: Board, r: number, c: number, side: Side, out: Move[]) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  for (const [dr, dc] of dirs) {
    let nr = r + dr
    let nc = c + dc
    while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
      const t = board[nr][nc]
      if (!t) {
        out.push({ fromR: r, fromC: c, toR: nr, toC: nc })
      } else {
        if (t.side !== side) {
          out.push({ fromR: r, fromC: c, toR: nr, toC: nc })
        }
        break
      }
      nr += dr
      nc += dc
    }
  }
}

function cannonMoves(board: Board, r: number, c: number, side: Side, out: Move[]) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  for (const [dr, dc] of dirs) {
    let nr = r + dr
    let nc = c + dc
    while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
      const t = board[nr][nc]
      if (!t) {
        out.push({ fromR: r, fromC: c, toR: nr, toC: nc })
        nr += dr
        nc += dc
      } else {
        let sr = nr + dr
        let sc = nc + dc
        while (sr >= 0 && sr < ROWS && sc >= 0 && sc < COLS) {
          const u = board[sr][sc]
          if (u) {
            if (u.side !== side) {
              out.push({ fromR: r, fromC: c, toR: sr, toC: sc })
            }
            break
          }
          sr += dr
          sc += dc
        }
        break
      }
    }
  }
}

function knightMoves(board: Board, r: number, c: number, side: Side, out: Move[]) {
  const deltas: [number, number, number, number][] = [
    [2, 1, 1, 0],
    [2, -1, 1, 0],
    [-2, 1, -1, 0],
    [-2, -1, -1, 0],
    [1, 2, 0, 1],
    [1, -2, 0, -1],
    [-1, 2, 0, 1],
    [-1, -2, 0, -1],
  ]
  for (const [dr, dc, br, bc] of deltas) {
    const blockR = r + br
    const blockC = c + bc
    const nr = r + dr
    const nc = c + dc
    if (
      blockR < 0 ||
      blockR >= ROWS ||
      blockC < 0 ||
      blockC >= COLS ||
      nr < 0 ||
      nr >= ROWS ||
      nc < 0 ||
      nc >= COLS
    ) {
      continue
    }
    if (board[blockR][blockC]) continue
    pushIfEmptyOrEnemy(board, nr, nc, side, out, r, c)
  }
}

function bishopMoves(board: Board, r: number, c: number, side: Side, out: Move[]) {
  const dirs = [
    [2, 2],
    [2, -2],
    [-2, 2],
    [-2, -2],
  ]
  for (const [dr, dc] of dirs) {
    const mr = r + dr / 2
    const mc = c + dc / 2
    const nr = r + dr
    const nc = c + dc
    if (
      nr < 0 ||
      nr >= ROWS ||
      nc < 0 ||
      nc >= COLS ||
      mr < 0 ||
      mr >= ROWS ||
      mc < 0 ||
      mc >= COLS
    ) {
      continue
    }
    if (side === 'black' && nr > 4) continue
    if (side === 'red' && nr < 5) continue
    if (board[mr][mc]) continue
    pushIfEmptyOrEnemy(board, nr, nc, side, out, r, c)
  }
}

function advisorMoves(board: Board, r: number, c: number, side: Side, out: Move[]) {
  const dirs = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]
  for (const [dr, dc] of dirs) {
    const nr = r + dr
    const nc = c + dc
    if (!inPalace(nr, nc, side)) continue
    pushIfEmptyOrEnemy(board, nr, nc, side, out, r, c)
  }
}

function kingMoves(board: Board, r: number, c: number, side: Side, out: Move[]) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  for (const [dr, dc] of dirs) {
    const nr = r + dr
    const nc = c + dc
    if (!inPalace(nr, nc, side)) continue
    pushIfEmptyOrEnemy(board, nr, nc, side, out, r, c)
  }
}

function pawnMoves(board: Board, r: number, c: number, side: Side, out: Move[]) {
  if (side === 'black') {
    if (r < 5) {
      pushIfEmptyOrEnemy(board, r + 1, c, side, out, r, c)
    } else {
      pushIfEmptyOrEnemy(board, r + 1, c, side, out, r, c)
      pushIfEmptyOrEnemy(board, r, c + 1, side, out, r, c)
      pushIfEmptyOrEnemy(board, r, c - 1, side, out, r, c)
    }
  } else {
    if (r > 4) {
      pushIfEmptyOrEnemy(board, r - 1, c, side, out, r, c)
    } else {
      pushIfEmptyOrEnemy(board, r - 1, c, side, out, r, c)
      pushIfEmptyOrEnemy(board, r, c + 1, side, out, r, c)
      pushIfEmptyOrEnemy(board, r, c - 1, side, out, r, c)
    }
  }
}

function movesForPiece(board: Board, r: number, c: number, piece: Piece, out: Move[]) {
  const { side, type } = piece
  switch (type) {
    case 'r':
      rookRay(board, r, c, side, out)
      break
    case 'c':
      cannonMoves(board, r, c, side, out)
      break
    case 'n':
      knightMoves(board, r, c, side, out)
      break
    case 'b':
      bishopMoves(board, r, c, side, out)
      break
    case 'a':
      advisorMoves(board, r, c, side, out)
      break
    case 'k':
      kingMoves(board, r, c, side, out)
      break
    case 'p':
      pawnMoves(board, r, c, side, out)
      break
    default:
      break
  }
}

export function legalMovesFrom(board: Board, r: number, c: number): Move[] {
  const piece = board[r][c]
  if (!piece) return []
  const raw: Move[] = []
  movesForPiece(board, r, c, piece, raw)
  const ok: Move[] = []
  for (const m of raw) {
    const next = applyMove(board, m.fromR, m.fromC, m.toR, m.toC)
    if (!flyingGeneral(next)) ok.push(m)
  }
  return ok
}

export function allLegalMoves(board: Board, side: Side): Move[] {
  const out: Move[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c]
      if (p?.side === side) {
        out.push(...legalMovesFrom(board, r, c))
      }
    }
  }
  return out
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
  const opp: Side = side === 'red' ? 'black' : 'red'
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

export function legalMovesFromChecked(board: Board, r: number, c: number): Move[] {
  const piece = board[r][c]
  if (!piece) return []
  return legalMovesFrom(board, r, c).filter((m) => {
    const next = applyMove(board, m.fromR, m.fromC, m.toR, m.toC)
    return !inCheck(next, piece.side)
  })
}

export function allLegalMovesChecked(board: Board, side: Side): Move[] {
  const out: Move[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c]
      if (p?.side === side) {
        out.push(...legalMovesFromChecked(board, r, c))
      }
    }
  }
  return out
}

function orderMovesCapturesFirst(board: Board, moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const ca = board[a.toR][a.toC]
    const cb = board[b.toR][b.toC]
    const va = ca ? PIECE_VALUE[ca.type] * 20 + PIECE_VALUE[board[a.fromR][a.fromC]!.type] : 0
    const vb = cb ? PIECE_VALUE[cb.type] * 20 + PIECE_VALUE[board[b.fromR][b.fromC]!.type] : 0
    return vb - va
  })
}

function evaluatePos(board: Board, rootSide: Side): number {
  const opp: Side = rootSide === 'red' ? 'black' : 'red'
  return evaluateMaterial(board, rootSide) - evaluateMaterial(board, opp) * 1.04
}

const MATE = 8_000_000

function negamaxXiangqi(
  board: Board,
  toMove: Side,
  depth: number,
  alpha: number,
  beta: number,
  rootSide: Side,
): number {
  const moves = orderMovesCapturesFirst(board, allLegalMovesChecked(board, toMove))
  if (moves.length === 0) {
    if (inCheck(board, toMove)) return -MATE + depth
    return 0
  }
  if (depth === 0) {
    const e = evaluatePos(board, rootSide)
    return toMove === rootSide ? e : -e
  }

  const limit = depth >= 2 ? 14 : 20
  let best = -Infinity
  for (let i = 0; i < Math.min(limit, moves.length); i++) {
    const m = moves[i]!
    const cap = board[m.toR][m.toC]
    const next = applyMove(board, m.fromR, m.fromC, m.toR, m.toC)
    let v: number
    if (cap?.type === 'k') {
      v = MATE - depth
    } else {
      const opp: Side = toMove === 'red' ? 'black' : 'red'
      v = -negamaxXiangqi(next, opp, depth - 1, -beta, -alpha, rootSide)
    }
    if (v > best) best = v
    if (v > alpha) alpha = v
    if (alpha >= beta) break
  }
  return best
}

export function pickAiMoveXiangqi(board: Board, side: Side): Move | null {
  const moves = allLegalMovesChecked(board, side)
  if (moves.length === 0) return null
  const sorted = orderMovesCapturesFirst(board, moves)
  const rootLimit = Math.min(20, sorted.length)
  let best: Move = sorted[0]!
  let bestScore = -Infinity
  for (let i = 0; i < rootLimit; i++) {
    const m = sorted[i]!
    const cap = board[m.toR][m.toC]
    const next = applyMove(board, m.fromR, m.fromC, m.toR, m.toC)
    if (cap?.type === 'k') return m
    const opp: Side = side === 'red' ? 'black' : 'red'
    const sc = -negamaxXiangqi(next, opp, 2, -MATE, MATE, side)
    const noise = Math.random() * 2.5
    if (sc + noise > bestScore) {
      bestScore = sc + noise
      best = m
    }
  }
  return best
}

function evaluateMaterial(board: Board, side: Side): number {
  let s = 0
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c]
      if (!p) continue
      const v = PIECE_VALUE[p.type]
      s += p.side === side ? v : 0
    }
  }
  return s
}
