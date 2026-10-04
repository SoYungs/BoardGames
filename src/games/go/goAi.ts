import { GO_SIZE, otherGoSide } from './goTypes'
import type { GoBoard, GoGroup, GoMove, GoPoint, GoPosition, GoSide } from './goTypes'
import { getGoGroup, getGoGroups, goNeighbors, goPointKey, playGoMove } from './goLogic'

type Candidate = { move: GoMove; position: GoPosition; priority: number }
const SEARCH_TIMEOUT = Symbol('go-search-timeout')

function checkTime(deadline: number) {
  if (performance.now() >= deadline) throw SEARCH_TIMEOUT
}

/** A secure one-point eye belongs to one connected group, with no false-eye diagonals. */
export function isTrueGoEye(board: GoBoard, r: number, c: number, side: GoSide): boolean {
  const neighbors = goNeighbors(r, c)
  if (board[r][c] !== 0 || neighbors.some((point) => board[point.r][point.c] !== side)) return false
  const diagonals = [{ r: r - 1, c: c - 1 }, { r: r - 1, c: c + 1 }, { r: r + 1, c: c - 1 }, { r: r + 1, c: c + 1 }]
    .filter((point) => point.r >= 0 && point.r < GO_SIZE && point.c >= 0 && point.c < GO_SIZE)
  const hostile = diagonals.filter((point) => board[point.r][point.c] === otherGoSide(side)).length
  if (hostile > (diagonals.length === 4 ? 1 : 0)) return false
  const friendly = diagonals.filter((point) => board[point.r][point.c] === side).length
  if (diagonals.length === 4 ? friendly >= 3 : friendly === diagonals.length) return true
  // Empty diagonals inside a connected enclosure do not make this a false eye.
  // Requiring one group still allows useful connections between separate strings.
  const group = getGoGroup(board, neighbors[0].r, neighbors[0].c)!
  const connected = new Set(group.stones.map(goPointKey))
  return neighbors.every((point) => connected.has(goPointKey(point)))
}

function groupMap(groups: GoGroup[]): Map<number, GoGroup> {
  const map = new Map<number, GoGroup>()
  for (const group of groups) for (const point of group.stones) map.set(goPointKey(point), group)
  return map
}

function nearbyGroups(board: GoBoard, r: number, c: number, side: GoSide, map: Map<number, GoGroup>): GoGroup[] {
  const groups = new Set<GoGroup>()
  for (const point of goNeighbors(r, c)) {
    if (board[point.r][point.c] === side) groups.add(map.get(goPointKey(point))!)
  }
  return [...groups]
}

function moveCandidates(position: GoPosition, deadline: number, strictTime: boolean): Candidate[] {
  const side = position.turn
  const groups = getGoGroups(position.board)
  const map = groupMap(groups)
  const threatened = groups.filter((group) => group.side === side && group.liberties.length === 1)
  const candidates: Candidate[] = []
  for (let r = 0; r < GO_SIZE; r++) {
    if (strictTime) checkTime(deadline)
    for (let c = 0; c < GO_SIZE; c++) {
      if (position.board[r][c] !== 0) continue
      const move: GoMove = { type: 'place', r, c }
      const played = playGoMove(position, move)
      if (!played.ok) continue
      const own = nearbyGroups(position.board, r, c, side, map)
      const enemies = nearbyGroups(position.board, r, c, otherGoSide(side), map)
      const resultingGroup = getGoGroup(played.position.board, r, c)!
      const saves = threatened.filter((group) => {
        const first = group.stones[0]
        return getGoGroup(played.position.board, first.r, first.c)!.liberties.length > 1
      })
        .reduce((count, group) => count + group.stones.length, 0)
      const captured = played.captured.length
      if (isTrueGoEye(position.board, r, c, side) && !captured && !saves) continue
      // Avoid offering the opponent a free stone unless the move captures or rescues.
      if (resultingGroup.liberties.length === 1 && !captured && !saves) continue
      let immediateLoss = 0
      if (resultingGroup.liberties.length === 1) {
        const liberty = resultingGroup.liberties[0]
        const reply = playGoMove(played.position, { type: 'place', ...liberty })
        if (reply.ok) immediateLoss = reply.captured.length
        // Do not fall for a losing snapback, even when there is no time to search.
        // A simple-ko capture remains available because its immediate reply is illegal.
        if (immediateLoss > captured) continue
      }
      let priority = captured * 140 + saves * 165
      priority -= immediateLoss * 140
      priority += Math.max(0, own.length - 1) * 60 + Math.max(0, enemies.length - 1) * 70
      for (const group of enemies) {
        if (group.liberties.length === 2) priority += 26 + Math.min(group.stones.length, 5) * 6
      }
      priority += Math.min(resultingGroup.liberties.length, 6) * 2
      const edgeDistance = Math.min(r, c, GO_SIZE - 1 - r, GO_SIZE - 1 - c)
      priority += edgeDistance === 2 ? 10 : edgeDistance === 3 ? 7 : edgeDistance === 4 ? 5 : 0
      // Favour playing near an existing fight, rather than disconnected edge stones.
      if (own.length || enemies.length) priority += 8
      candidates.push({ move, position: played.position, priority })
    }
  }
  const pass = playGoMove(position, { type: 'pass' })
  if (pass.ok && (candidates.length === 0 || position.consecutivePasses > 0)) {
    candidates.push({ move: { type: 'pass' }, position: pass.position, priority: -100 })
  }
  return candidates.sort((a, b) => b.priority - a.priority)
}

function evaluate(position: GoPosition, side: GoSide): number {
  if (position.result) return (position.result.winner === side ? 1 : -1) * (100_000 + (position.result.margin ?? 0) * 100)
  let value = 0
  const stones: { black: GoPoint[]; white: GoPoint[] } = { black: [], white: [] }
  for (const group of getGoGroups(position.board)) {
    const sign = group.side === side ? 1 : -1
    const count = group.stones.length
    let strength = count * 30 + Math.min(group.liberties.length, 8) * 2
    if (group.liberties.length === 1) strength -= count * 18 + 8
    else if (group.liberties.length === 2) strength -= count * 8 + 4
    value += sign * strength
    stones[group.side === 1 ? 'black' : 'white'].push(...group.stones)
  }
  // Soft influence for unsettled boards; exact enclosed-area scoring is reserved
  // for two passes, where it cannot mistake an open early board for secure land.
  for (let r = 0; r < GO_SIZE; r++) {
    for (let c = 0; c < GO_SIZE; c++) {
      if (position.board[r][c] !== 0) continue
      let blackDistance = GO_SIZE * 2
      let whiteDistance = GO_SIZE * 2
      for (const point of stones.black) blackDistance = Math.min(blackDistance, Math.abs(point.r - r) + Math.abs(point.c - c))
      for (const point of stones.white) whiteDistance = Math.min(whiteDistance, Math.abs(point.r - r) + Math.abs(point.c - c))
      value += (side === 1 ? 1 : -1) * (whiteDistance - blackDistance) / (whiteDistance + blackDistance + 1) * 8
    }
  }
  return value
}

function search(position: GoPosition, side: GoSide, depth: number, alpha: number, beta: number, deadline: number): number {
  checkTime(deadline)
  if (depth === 0 || position.result) return evaluate(position, side)
  const candidates = moveCandidates(position, deadline, true).slice(0, depth >= 2 ? 6 : 4)
  if (candidates.length === 0) return evaluate(position, side)
  const maximizing = position.turn === side
  let best = maximizing ? -Infinity : Infinity
  for (const candidate of candidates) {
    const value = search(candidate.position, side, depth - 1, alpha, beta, deadline)
    best = maximizing ? Math.max(best, value) : Math.min(best, value)
    if (maximizing) alpha = Math.max(alpha, best)
    else beta = Math.min(beta, best)
    if (beta <= alpha) break
  }
  return best
}

/** Local tactical beam search, capped at 650 ms; never mutates the input. */
export function pickAiMoveGo(position: GoPosition, side: GoSide = position.turn, budgetMs = 650): GoMove | null {
  if (position.result || side !== position.turn) return null
  const deadline = performance.now() + Math.max(10, Math.min(650, Number.isNaN(budgetMs) ? 10 : budgetMs))
  const candidates = moveCandidates(position, deadline, false)
  if (candidates.length === 0) return { type: 'pass' }
  // Capture/rescue priorities provide a useful answer even at the smallest budget.
  let best = candidates[0]
  const beam = candidates.slice(0, 10)
  const pass = candidates.find((candidate) => candidate.move.type === 'pass')
  if (pass && !beam.includes(pass)) beam.push(pass)
  try {
    for (let depth = 1; depth <= 4; depth++) {
      let iterationBest = best
      let bestValue = -Infinity
      for (const candidate of beam) {
        checkTime(deadline)
        const value = search(candidate.position, side, depth - 1, -Infinity, Infinity, deadline) + candidate.priority * .35
        if (value > bestValue) {
          iterationBest = candidate
          bestValue = value
        }
      }
      best = iterationBest
      // Move ordering improves pruning on the next complete iteration.
      beam.sort((a, b) => a === best ? -1 : b === best ? 1 : b.priority - a.priority)
    }
  } catch (error) {
    if (error !== SEARCH_TIMEOUT) throw error
  }
  return best.move
}
