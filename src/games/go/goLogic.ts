import { GO_KOMI, GO_SIZE, otherGoSide } from './goTypes'
import type { GoBoard, GoGroup, GoMove, GoPlayResult, GoPoint, GoPosition, GoScore } from './goTypes'

export function emptyGoBoard(): GoBoard {
  return Array.from({ length: GO_SIZE }, () => Array.from({ length: GO_SIZE }, () => 0))
}

export function createGoPosition(): GoPosition {
  return {
    board: emptyGoBoard(), turn: 1, koBoard: null, consecutivePasses: 0,
    captures: { black: 0, white: 0 }, lastMove: null, moveNumber: 0, result: null,
  }
}

export function goNeighbors(r: number, c: number): GoPoint[] {
  return [{ r: r - 1, c }, { r: r + 1, c }, { r, c: c - 1 }, { r, c: c + 1 }]
    .filter((point) => point.r >= 0 && point.r < GO_SIZE && point.c >= 0 && point.c < GO_SIZE)
}

export function goPointKey(point: GoPoint): number {
  return point.r * GO_SIZE + point.c
}

export function getGoGroup(board: GoBoard, r: number, c: number): GoGroup | null {
  const side = board[r]?.[c]
  if (!side) return null
  const stones: GoPoint[] = [{ r, c }]
  const visited = new Set([r * GO_SIZE + c])
  const liberties = new Map<number, GoPoint>()
  for (let i = 0; i < stones.length; i++) {
    for (const point of goNeighbors(stones[i].r, stones[i].c)) {
      const key = goPointKey(point)
      if (board[point.r][point.c] === 0) liberties.set(key, point)
      else if (board[point.r][point.c] === side && !visited.has(key)) {
        visited.add(key)
        stones.push(point)
      }
    }
  }
  return { side, stones, liberties: [...liberties.values()] }
}

export function getGoGroups(board: GoBoard): GoGroup[] {
  const visited = new Set<number>()
  const groups: GoGroup[] = []
  for (let r = 0; r < GO_SIZE; r++) {
    for (let c = 0; c < GO_SIZE; c++) {
      if (board[r][c] === 0 || visited.has(r * GO_SIZE + c)) continue
      const group = getGoGroup(board, r, c)!
      for (const point of group.stones) visited.add(goPointKey(point))
      groups.push(group)
    }
  }
  return groups
}

export function sameGoBoard(a: GoBoard, b: GoBoard): boolean {
  return a.every((row, r) => row.every((cell, c) => cell === b[r][c]))
}

/** Area score: stones plus vacant regions bordered by exactly one colour. */
export function scoreGoBoard(board: GoBoard, komi = GO_KOMI): GoScore {
  const score: GoScore = {
    black: { stones: 0, territory: 0, total: 0 },
    white: { stones: 0, territory: 0, komi, total: 0 },
    neutral: 0, ownership: emptyGoBoard(),
  }
  const visited = new Set<number>()
  for (let r = 0; r < GO_SIZE; r++) {
    for (let c = 0; c < GO_SIZE; c++) {
      const cell = board[r][c]
      if (cell) {
        score[cell === 1 ? 'black' : 'white'].stones++
        score.ownership[r][c] = cell
        continue
      }
      const startKey = r * GO_SIZE + c
      if (visited.has(startKey)) continue
      const region: GoPoint[] = [{ r, c }]
      const borders = new Set<number>()
      visited.add(startKey)
      for (let i = 0; i < region.length; i++) {
        for (const point of goNeighbors(region[i].r, region[i].c)) {
          const neighbor = board[point.r][point.c]
          if (neighbor) borders.add(neighbor)
          else if (!visited.has(goPointKey(point))) {
            visited.add(goPointKey(point))
            region.push(point)
          }
        }
      }
      const owner = borders.size === 1 ? [...borders][0] as 1 | 2 : 0
      if (owner) score[owner === 1 ? 'black' : 'white'].territory += region.length
      else score.neutral += region.length
      for (const point of region) score.ownership[point.r][point.c] = owner
    }
  }
  score.black.total = score.black.stones + score.black.territory
  score.white.total = score.white.stones + score.white.territory + komi
  return score
}

export function playGoMove(position: GoPosition, move: GoMove): GoPlayResult {
  if (position.result) return { ok: false, reason: 'finished' }
  const turn = otherGoSide(position.turn)
  const common = { ...position, turn, moveNumber: position.moveNumber + 1, lastMove: move }
  if (move.type === 'resign') {
    return { ok: true, captured: [], position: { ...common, result: { winner: otherGoSide(move.side), reason: 'resign' } } }
  }
  if (move.type === 'pass') {
    const consecutivePasses = position.consecutivePasses + 1
    const next = { ...common, koBoard: position.board, consecutivePasses }
    if (consecutivePasses >= 2) {
      const score = scoreGoBoard(position.board)
      const difference = score.black.total - score.white.total
      next.result = { reason: 'score', winner: difference > 0 ? 1 : 2, margin: Math.abs(difference), score }
    }
    return { ok: true, captured: [], position: next }
  }

  const { r, c } = move
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= GO_SIZE || c < 0 || c >= GO_SIZE) return { ok: false, reason: 'outside' }
  if (position.board[r][c] !== 0) return { ok: false, reason: 'occupied' }
  const board = position.board.map((row) => row.slice())
  board[r][c] = position.turn
  const captured: GoPoint[] = []
  const seen = new Set<number>()
  for (const point of goNeighbors(r, c)) {
    if (board[point.r][point.c] !== turn || seen.has(goPointKey(point))) continue
    const group = getGoGroup(board, point.r, point.c)!
    for (const stone of group.stones) seen.add(goPointKey(stone))
    if (group.liberties.length === 0) {
      for (const stone of group.stones) {
        board[stone.r][stone.c] = 0
        captured.push(stone)
      }
    }
  }
  // Captures happen before the suicide check, so a capture can create liberties.
  if (getGoGroup(board, r, c)!.liberties.length === 0) return { ok: false, reason: 'suicide' }
  if (position.koBoard && sameGoBoard(board, position.koBoard)) return { ok: false, reason: 'ko' }
  const captures = { ...position.captures }
  captures[position.turn === 1 ? 'black' : 'white'] += captured.length
  return {
    ok: true, captured,
    position: { ...common, board, captures, consecutivePasses: 0, koBoard: position.board },
  }
}

export function legalGoMoves(position: GoPosition): GoMove[] {
  if (position.result) return []
  const moves: GoMove[] = []
  for (let r = 0; r < GO_SIZE; r++) {
    for (let c = 0; c < GO_SIZE; c++) {
      if (position.board[r][c] === 0 && playGoMove(position, { type: 'place', r, c }).ok) moves.push({ type: 'place', r, c })
    }
  }
  moves.push({ type: 'pass' })
  return moves
}
