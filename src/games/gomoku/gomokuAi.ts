import { GOMOKU_SIZE, checkWin, type Cell } from './gomokuLogic'
import { boundedAiBudget } from '../ai/search'

type Point = [number, number]
const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]]
const MATE = 1_000_000
const TIMEOUT = Symbol('gomoku search deadline')
const inside = (r: number, c: number) => r >= 0 && r < GOMOKU_SIZE && c >= 0 && c < GOMOKU_SIZE

export function getCandidates(board: Cell[][]): Point[] {
  const marked = new Set<number>()
  let occupied = 0
  for (let r = 0; r < GOMOKU_SIZE; r++) for (let c = 0; c < GOMOKU_SIZE; c++) {
    if (!board[r][c]) continue
    occupied++
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const nr = r + dr, nc = c + dc
      if (inside(nr, nc) && !board[nr][nc]) marked.add(nr * GOMOKU_SIZE + nc)
    }
  }
  if (!occupied) return [[7, 7]]
  return [...marked].map(index => [Math.floor(index / GOMOKU_SIZE), index % GOMOKU_SIZE])
}

function completions(line: string[]): Set<number> {
  const points = new Set<number>()
  for (let start = 0; start <= 4; start++) {
    const window = line.slice(start, start + 5)
    if (window.filter(cell => cell === 'X').length === 4 && window.filter(cell => cell === '.').length === 1) {
      points.add(start + window.indexOf('.'))
    }
  }
  return points
}

function pointScore(board: Cell[][], r: number, c: number, side: 1 | 2, extended = true): number {
  let score = 0, fours = 0, threes = 0
  for (const [dr, dc] of DIRECTIONS) {
    const line = Array.from({ length: 9 }, (_, i) => {
      const rr = r + dr * (i - 4), cc = c + dc * (i - 4)
      return !inside(rr, cc) ? '#' : i === 4 || board[rr][cc] === side ? 'X' : board[rr][cc] ? '#' : '.'
    })
    if (line.join('').includes('XXXXX')) return MATE
    const wins = completions(line)
    if (wins.size >= 2) { score += 70_000; fours++; continue }
    if (wins.size) { score += 9_000; fours++; continue }
    let openThree = false
    for (let i = 0; extended && i < 9; i++) if (line[i] === '.') {
      line[i] = 'X'
      if (completions(line).size >= 2) openThree = true
      line[i] = '.'
    }
    if (openThree) { score += 2_200; threes++ }
    for (let start = 0; start <= 4; start++) {
      const window = line.slice(start, start + 5)
      if (!window.includes('#')) score += [0, 2, 25, 100, 0, 0][window.filter(cell => cell === 'X').length]
    }
  }
  if (fours >= 2) score += 100_000
  if (fours && threes) score += 20_000
  if (threes >= 2) score += 8_000
  return score
}

export function evaluateBoard(board: Cell[][], side: 1 | 2): number {
  const weights = [0, 2, 18, 160, 2_000, MATE]
  let score = 0
  for (let r = 0; r < GOMOKU_SIZE; r++) for (let c = 0; c < GOMOKU_SIZE; c++) {
    for (const [dr, dc] of DIRECTIONS) {
      if (!inside(r + dr * 4, c + dc * 4)) continue
      let own = 0, opponent = 0
      for (let i = 0; i < 5; i++) {
        const cell = board[r + dr * i][c + dc * i]
        if (cell === side) own++
        else if (cell) opponent++
      }
      if (!opponent) score += weights[own]
      if (!own) score -= weights[opponent]
    }
  }
  return score
}

export function pickAiMove(source: Cell[][], side: 1 | 2, budgetMs = 800): Point | null {
  const deadline = performance.now() + boundedAiBudget(budgetMs)
  const check = () => { if (performance.now() >= deadline) throw TIMEOUT }
  const board = source.map(row => row.slice())
  const initial = getCandidates(board)
  if (!initial.length) return null
  const opponent = side === 1 ? 2 : 1
  const immediate = (points: Point[], turn: 1 | 2) => points.filter(([r, c]) => {
    board[r][c] = turn
    const win = checkWin(board, r, c, turn)
    board[r][c] = 0
    return win
  })
  const wins = immediate(initial, side)
  if (wins.length) return wins[0]
  const forced = immediate(initial, opponent)
  if (forced.length === 1) return forced[0]
  // This inexpensive full-board tactical pass is also the timeout fallback.
  // Returning the nearest central square used to ignore a distant open three
  // when deeper pattern ranking ran out of its remaining budget.
  const baseline = initial.map(point => ({ point, score: pointScore(board, ...point, side, false) + pointScore(board, ...point, opponent, false) * .95 }))
  baseline.sort((a, b) => b.score - a.score)
  let best: Point = baseline[0].point

  const ordered = (turn: 1 | 2, limit: number): Point[] => {
    const points = getCandidates(board)
    const winning = immediate(points, turn)
    if (winning.length) return winning
    const blocking = immediate(points, turn === 1 ? 2 : 1)
    if (blocking.length) return blocking
    const scores = points.map(point => {
      check()
      const [r, c] = point
      return { point, score: pointScore(board, r, c, turn) + pointScore(board, r, c, turn === 1 ? 2 : 1) * .95 }
    })
    return scores.sort((a, b) => b.score - a.score).slice(0, limit).map(entry => entry.point)
  }
  const negamax = (turn: 1 | 2, depth: number, alpha: number, beta: number, ply: number): number => {
    check()
    if (!depth) return evaluateBoard(board, turn)
    const points = ordered(turn, depth >= 3 ? 8 : 12)
    if (!points.length) return 0
    let value = -MATE
    for (const [r, c] of points) {
      check()
      board[r][c] = turn
      let score: number
      try {
        score = checkWin(board, r, c, turn) ? MATE - ply : -negamax(turn === 1 ? 2 : 1, depth - 1, -beta, -alpha, ply + 1)
      } finally { board[r][c] = 0 }
      value = Math.max(value, score)
      alpha = Math.max(alpha, score)
      if (alpha >= beta) break
    }
    return value
  }
  try {
    const root = ordered(side, 20)
    best = root[0] ?? best
    for (let depth = 1; depth <= 5; depth++) {
      let roundBest = best, alpha = -MATE
      root.sort((a, b) => Number(b === best) - Number(a === best))
      for (const point of root) {
        check()
        const [r, c] = point
        board[r][c] = side
        let score: number
        try { score = -negamax(opponent, depth - 1, -MATE, -alpha, 1) }
        finally { board[r][c] = 0 }
        if (score > alpha) { alpha = score; roundBest = point }
      }
      best = roundBest
      if (alpha > MATE - 100) break
    }
  } catch (error) { if (error !== TIMEOUT) throw error }
  return best
}
