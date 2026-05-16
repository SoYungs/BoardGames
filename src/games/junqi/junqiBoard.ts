import type { Board, Piece, PieceType, Side } from './junqiTypes'
import { COLS, ROWS, piecePool } from './junqiTypes'

function p(id: string, side: Side, type: PieceType, revealed = false): Piece {
  return { id, side, type, revealed }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = 0; i < a.length; i++) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** 大本营（军旗所在区域，开局不布子） */
export function isHeadquarters(r: number, c: number): boolean {
  return (r === 0 || r === 5) && (c === 5 || c === 6)
}

/** 行营（五线谱中间四个营地 × 双方各一排） */
export function isCamp(r: number, c: number): boolean {
  const camps: [number, number][] = [
    [1, 2],
    [1, 4],
    [1, 7],
    [1, 9],
    [4, 2],
    [4, 4],
    [4, 7],
    [4, 9],
  ]
  return camps.some(([rr, cc]) => rr === r && cc === c)
}

/** 铁路线：横线行 1、4；纵线列 1、5、6、10 */
export function isRailway(r: number, c: number): boolean {
  if (r === 1 || r === 4) return c >= 1 && c <= 10
  if (c === 1 || c === 5 || c === 6 || c === 10) return r >= 0 && r <= 5
  return false
}

/** 双方前线（开局中间空出，不布子） */
export function isFrontline(r: number, _c?: number): boolean {
  return r === 2 || r === 3
}

/**
 * 布阵区：己方后两行 + 前线各一列，共 25 格。
 * 蓝方在上（0–2 行），红方在下（3–5 行）；行 2、3 为前线，仅最外侧各布 1 子。
 */
export function deployCells(side: Side): [number, number][] {
  const cells: [number, number][] = []
  if (side === 'blue') {
    for (const r of [0, 1]) {
      for (let c = 0; c < COLS; c++) {
        if (!isHeadquarters(r, c)) cells.push([r, c])
      }
    }
    for (const c of [0, 1, 11]) cells.push([2, c])
  } else {
    for (const r of [4, 5]) {
      for (let c = 0; c < COLS; c++) {
        if (!isHeadquarters(r, c)) cells.push([r, c])
      }
    }
    for (const c of [0, 1, 11]) cells.push([3, c])
  }
  return cells.slice(0, 25)
}

export function createInitialBoard(): Board {
  const b: Board = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null))
  for (const side of ['red', 'blue'] as Side[]) {
    const types = shuffle(piecePool())
    const cells = shuffle(deployCells(side))
    cells.forEach(([r, c], i) => {
      b[r][c] = p(`${side}-${types[i]}-${r}-${c}`, side, types[i]!, false)
    })
  }
  return b
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice())
}

export function snapshotBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)))
}

export function applyMove(
  board: Board,
  move: { fromR: number; fromC: number; toR: number; toC: number },
  result: import('./junqiCombat').CombatResult,
): Board {
  const next = cloneBoard(board)
  const attacker = next[move.fromR][move.fromC]!
  const defender = next[move.toR][move.toC]

  attacker.revealed = true
  if (defender) defender.revealed = true

  if (!defender) {
    next[move.toR][move.toC] = { ...attacker, revealed: true }
    next[move.fromR][move.fromC] = null
    return next
  }

  if (result === 'attacker') {
    next[move.toR][move.toC] = { ...attacker, revealed: true }
    next[move.fromR][move.fromC] = null
  } else if (result === 'defender') {
    next[move.fromR][move.fromC] = null
  } else if (result === 'both') {
    next[move.toR][move.toC] = null
    next[move.fromR][move.fromC] = null
  }
  return next
}
