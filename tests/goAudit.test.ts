import assert from 'node:assert/strict'
import test from 'node:test'
import { pickAiMoveGo } from '../src/games/go/goAi.ts'
import { createGoPosition, getGoGroups, legalGoMoves, playGoMove, scoreGoBoard } from '../src/games/go/goLogic.ts'
import type { GoBoard, GoCell, GoMove, GoMoveError, GoPosition, GoScore, GoSide } from '../src/games/go/goTypes.ts'

// Independent oracle for the README's 9x9 area-scored, 6.5-komi, simple-ko game.
// It uses a flat board and union-find, not the production flood-fill/group API.
const SIZE = 9, POINTS = 81, KOMI = 6.5
type Component = { colour: GoCell; points: number[]; liberties: Set<number>; borders: Set<GoSide> }

function adjacent(index: number): number[] {
  const out: number[] = []
  if (index >= SIZE) out.push(index - SIZE)
  if (index < POINTS - SIZE) out.push(index + SIZE)
  if (index % SIZE !== 0) out.push(index - 1)
  if (index % SIZE !== SIZE - 1) out.push(index + 1)
  return out
}

function components(flat: GoCell[]): { all: Component[]; at: Component[] } {
  const parents = Array.from({ length: POINTS }, (_, index) => index)
  const find = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]]
      index = parents[index]
    }
    return index
  }
  const join = (a: number, b: number) => { parents[find(b)] = find(a) }
  for (let index = 0; index < POINTS; index++) {
    if (index % SIZE < SIZE - 1 && flat[index] === flat[index + 1]) join(index, index + 1)
    if (index < POINTS - SIZE && flat[index] === flat[index + SIZE]) join(index, index + SIZE)
  }
  const byRoot = new Map<number, Component>()
  const at: Component[] = []
  for (let index = 0; index < POINTS; index++) {
    const root = find(index)
    let group = byRoot.get(root)
    if (!group) {
      group = { colour: flat[index], points: [], liberties: new Set(), borders: new Set() }
      byRoot.set(root, group)
    }
    group.points.push(index)
    at[index] = group
  }
  for (let index = 0; index < POINTS; index++) for (const neighbor of adjacent(index)) {
    if (flat[index] !== 0 && flat[neighbor] === 0) at[index].liberties.add(neighbor)
    if (flat[index] === 0 && flat[neighbor] !== 0) at[index].borders.add(flat[neighbor] as GoSide)
  }
  return { all: [...byRoot.values()], at }
}

function unflatten(flat: GoCell[]): GoBoard {
  return Array.from({ length: SIZE }, (_, row) => flat.slice(row * SIZE, (row + 1) * SIZE))
}

type ModelPlacement = { ok: true; flat: GoCell[]; captured: number[] } | { ok: false; reason: GoMoveError }
function modelPlacement(position: GoPosition, r: number, c: number): ModelPlacement {
  if (position.result) return { ok: false, reason: 'finished' }
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= SIZE || c >= SIZE) return { ok: false, reason: 'outside' }
  const index = r * SIZE + c, flat = position.board.flat()
  if (flat[index] !== 0) return { ok: false, reason: 'occupied' }
  flat[index] = position.turn
  const beforeCapture = components(flat)
  const opposing = new Set(adjacent(index).filter(neighbor => flat[neighbor] !== 0 && flat[neighbor] !== position.turn).map(neighbor => beforeCapture.at[neighbor]))
  const captured = [...opposing].filter(group => group.liberties.size === 0).flatMap(group => group.points).sort((a, b) => a - b)
  for (const victim of captured) flat[victim] = 0
  const own = captured.length ? components(flat).at[index] : beforeCapture.at[index]
  if (own.liberties.size === 0) return { ok: false, reason: 'suicide' }
  const ko = position.koBoard?.flat()
  if (ko && flat.every((cell, point) => cell === ko[point])) return { ok: false, reason: 'ko' }
  return { ok: true, flat, captured }
}

function modelScore(board: GoBoard, komi = KOMI): GoScore {
  const flat = board.flat(), ownership = flat.slice()
  const score: GoScore = {
    black: { stones: 0, territory: 0, total: 0 },
    white: { stones: 0, territory: 0, komi, total: 0 },
    neutral: 0, ownership: [],
  }
  for (const group of components(flat).all) {
    if (group.colour !== 0) {
      score[group.colour === 1 ? 'black' : 'white'].stones += group.points.length
      continue
    }
    const owner: GoCell = group.borders.size === 1 ? [...group.borders][0] : 0
    if (owner === 0) score.neutral += group.points.length
    else score[owner === 1 ? 'black' : 'white'].territory += group.points.length
    for (const point of group.points) ownership[point] = owner
  }
  score.ownership = unflatten(ownership)
  score.black.total = score.black.stones + score.black.territory
  score.white.total = score.white.stones + score.white.territory + komi
  return score
}

function key(move: GoMove): string {
  return move.type === 'place' ? `${move.r},${move.c}` : move.type
}

function verifyGroupsAndScore(position: GoPosition): void {
  const normalize = (colour: GoCell, points: number[], liberties: number[]) => ({
    colour, points: points.sort((a, b) => a - b), liberties: liberties.sort((a, b) => a - b),
  })
  const expected = components(position.board.flat()).all.filter(group => group.colour !== 0)
    .map(group => normalize(group.colour, [...group.points], [...group.liberties])).sort((a, b) => a.points[0] - b.points[0])
  // Production groups are only the subject under test; none build the oracle.
  const actual = getGoGroups(position.board).map(group => normalize(group.side,
    group.stones.map(point => point.r * SIZE + point.c), group.liberties.map(point => point.r * SIZE + point.c)))
    .sort((a, b) => a.points[0] - b.points[0])
  assert.deepEqual(actual, expected)
  for (const group of actual) {
    assert.equal(new Set(group.points).size, group.points.length)
    assert.equal(new Set(group.liberties).size, group.liberties.length)
  }
  for (const komi of [0, KOMI]) {
    const expectedScore = modelScore(position.board, komi)
    assert.deepEqual(scoreGoBoard(position.board, komi), expectedScore)
    assert.equal(expectedScore.black.total + expectedScore.white.total - komi + expectedScore.neutral, POINTS)
  }
}

function verifyPlacements(position: GoPosition, context: string): GoMove[] {
  const before = structuredClone(position), expectedLegal: GoMove[] = []
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const expected = modelPlacement(position, r, c), move: GoMove = { type: 'place', r, c }
    const actual = playGoMove(position, move)
    assert.equal(actual.ok, expected.ok, `${context} at ${r},${c}`)
    if (!expected.ok) {
      assert.deepEqual(actual, expected, `${context} at ${r},${c}`)
      continue
    }
    assert.ok(actual.ok)
    expectedLegal.push(move)
    assert.deepEqual(actual.position.board.flat(), expected.flat, `${context} at ${r},${c}`)
    assert.deepEqual(actual.captured.map(point => point.r * SIZE + point.c).sort((a, b) => a - b), expected.captured)
    const captureCounts = { ...position.captures }
    captureCounts[position.turn === 1 ? 'black' : 'white'] += expected.captured.length
    assert.deepEqual(actual.position.captures, captureCounts)
    assert.equal(actual.position.turn, position.turn === 1 ? 2 : 1)
    assert.equal(actual.position.moveNumber, position.moveNumber + 1)
    assert.equal(actual.position.consecutivePasses, 0)
    assert.deepEqual(actual.position.koBoard, position.board)
    assert.deepEqual(actual.position.lastMove, move)
    assert.equal(actual.position.result, null)
  }
  if (!position.result) expectedLegal.push({ type: 'pass' })
  assert.deepEqual(legalGoMoves(position).map(key).sort(), expectedLegal.map(key).sort())
  assert.deepEqual(position, before)
  return expectedLegal
}

function setup(black: [number, number][], white: [number, number][], turn: GoSide = 1): GoPosition {
  const position = createGoPosition()
  for (const [r, c] of black) position.board[r][c] = 1
  for (const [r, c] of white) position.board[r][c] = 2
  position.turn = turn
  return position
}

function play(position: GoPosition, move: GoMove): GoPosition {
  const before = structuredClone(position), result = playGoMove(position, move)
  assert.ok(result.ok)
  assert.deepEqual(position, before)
  if (move.type === 'pass') {
    assert.deepEqual(result.captured, [])
    assert.deepEqual(result.position.board, position.board)
    assert.deepEqual(result.position.koBoard, position.board)
    assert.deepEqual(result.position.captures, position.captures)
    assert.equal(result.position.consecutivePasses, position.consecutivePasses + 1)
    assert.equal(result.position.moveNumber, position.moveNumber + 1)
    assert.equal(result.position.turn, position.turn === 1 ? 2 : 1)
    if (position.consecutivePasses === 1) {
      const score = modelScore(position.board)
      const difference = score.black.total - score.white.total
      assert.deepEqual(result.position.result, { reason: 'score', winner: difference > 0 ? 1 : 2, margin: Math.abs(difference), score })
    } else assert.equal(result.position.result, null)
  }
  return result.position
}

function exchangeColours(position: GoPosition): GoPosition {
  return { ...position, turn: position.turn === 1 ? 2 : 1, board: position.board.map(row => row.map(cell => cell === 1 ? 2 : cell === 2 ? 1 : 0)) }
}

test('union-find agrees on every candidate for multiple captures, shared liberties, suicide and snapback, in both colours', () => {
  const fixtures = [
    setup([[0, 0], [0, 1], [1, 0]], [[2, 2]]),
    setup([[2, 4], [3, 3], [3, 5], [4, 2], [5, 3]], [[3, 4], [4, 3]]),
    setup([[2, 4], [3, 5], [2, 3], [3, 2], [4, 2], [5, 3]], [[3, 4], [3, 3], [4, 3]]),
    setup([[4, 3]], [[3, 3], [5, 3], [4, 2], [3, 4], [5, 4], [4, 5]]),
    setup([[2, 3], [2, 4], [3, 2], [4, 3]], [[3, 3], [1, 3], [1, 4], [2, 2], [2, 5], [3, 5], [4, 4]]),
  ]
  for (const original of fixtures) for (const position of [original, exchangeColours(original)]) {
    verifyGroupsAndScore(position)
    verifyPlacements(position, 'capture/suicide fixture')
  }
  for (const position of [fixtures[4], exchangeColours(fixtures[4])]) {
    const taken = play(position, { type: 'place', r: 3, c: 4 })
    assert.equal(modelPlacement(taken, 3, 3).ok, true, 'snapback changes more than a simple-ko stone')
    verifyGroupsAndScore(taken)
    verifyPlacements(taken, 'snapback reply')
  }
})

test('the independent board comparison distinguishes immediate simple ko from recapture after intervening moves', () => {
  const original = setup([[2, 3], [3, 2], [4, 3]], [[3, 3], [2, 4], [4, 4], [3, 5]])
  for (const initial of [original, exchangeColours(original)]) {
    const taken = play(initial, { type: 'place', r: 3, c: 4 })
    assert.deepEqual(modelPlacement(taken, 3, 3), { ok: false, reason: 'ko' })
    verifyPlacements(taken, 'immediate ko')
    const threat = play(taken, { type: 'place', r: 8, c: 8 })
    const answered = play(threat, { type: 'place', r: 8, c: 7 })
    assert.equal(modelPlacement(answered, 3, 3).ok, true)
    verifyPlacements(answered, 'ko after two intervening moves')
    const afterPass = play(play(taken, { type: 'pass' }), { type: 'place', r: 8, c: 8 })
    assert.equal(modelPlacement(afterPass, 3, 3).ok, true)
    verifyPlacements(afterPass, 'ko after an intervening pass')
  }
})

test('area ownership follows empty union-find regions, keeps mixed borders neutral, and retains unremoved dead stones', () => {
  const fixtures = [
    createGoPosition(),
    setup([[0, 1], [1, 0], [0, 2], [0, 4], [1, 3]], [[8, 7], [7, 8]]),
    setup([[0, 1]], [[1, 0]]),
    setup([[3, 4], [5, 4], [4, 3], [3, 5], [5, 5], [4, 6]], [[4, 4]]),
  ]
  for (const position of fixtures) {
    position.captures = { black: 27, white: 31 }
    verifyGroupsAndScore(position)
    const ended = play(play(position, { type: 'pass' }), { type: 'pass' })
    assert.deepEqual(ended.board, position.board)
    assert.deepEqual(ended.result?.score, modelScore(position.board))
    assert.deepEqual(verifyPlacements(ended, 'finished area scoring'), [])
  }
  assert.equal(modelScore(fixtures[3].board).white.stones, 1)
})

test('three seeded legal games compare every candidate, all groups/liberties and area scoring against union-find at each turn', () => {
  for (const seed of [17, 73, 211]) {
    let position = createGoPosition(), value = seed
    const random = () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296)
    for (let ply = 0; ply < 96 && !position.result; ply++) {
      verifyGroupsAndScore(position)
      const legal = verifyPlacements(position, `seed ${seed}, ply ${ply}`)
      assert.ok(legal.length)
      position = play(position, legal[Math.floor(random() * legal.length)])
      for (const group of components(position.board.flat()).all) if (group.colour !== 0) assert.ok(group.liberties.size > 0)
    }
    // Finish any surviving random game under the documented two-pass rule.
    while (!position.result) position = play(position, { type: 'pass' })
    verifyGroupsAndScore(position)
    assert.deepEqual(verifyPlacements(position, `seed ${seed}, final position`), [])
    assert.deepEqual(position.result.score, modelScore(position.board))
  }
})

test('a controlled-clock minimal-budget Go AI returns an independently legal move and preserves ko/history state', () => {
  const originalClock = Object.getOwnPropertyDescriptor(performance, 'now')
  const ko = play(setup([[2, 3], [3, 2], [4, 3]], [[3, 3], [2, 4], [4, 4], [3, 5]]), { type: 'place', r: 3, c: 4 })
  const fixtures = [createGoPosition(), ko, setup([[4, 4]], [[3, 4], [5, 4], [4, 3]])]
  for (const position of fixtures) {
    const before = structuredClone(position)
    let tick = 0, move: GoMove | null
    Object.defineProperty(performance, 'now', { configurable: true, value: () => tick += 100 })
    try { move = pickAiMoveGo(position, position.turn, 0) } finally {
      if (originalClock) Object.defineProperty(performance, 'now', originalClock)
      else Reflect.deleteProperty(performance, 'now')
    }
    assert.ok(move)
    assert.equal(move.type === 'place' ? modelPlacement(position, move.r, move.c).ok : move.type === 'pass', true)
    assert.deepEqual(position, before)
    assert.equal(pickAiMoveGo(position, position.turn === 1 ? 2 : 1, 0), null)
  }
})
