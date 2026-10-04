import assert from 'node:assert/strict'
import test from 'node:test'
import { initialHuarongState, legalHuarongDirections, moveHuarong, moveHuarongRun, startHuarong, undoHuarong } from '../src/games/huarong/huarongLogic.ts'
import type { Direction, HuarongState } from '../src/games/huarong/huarongLogic.ts'

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right']

function canonical(state: HuarongState): string {
  const groups = ['2x2', '2x1', '1x2', '1x1'].map(size => state.pieces
    .filter(piece => `${piece.width}x${piece.height}` === size)
    .map(piece => piece.row * 4 + piece.col).sort((a, b) => a - b).join(','))
  return groups.join('|')
}

test('classic 横刀立马 has the correct ten pieces, two empty cells, and Cao Cao above the horizontal general', () => {
  const state = initialHuarongState()
  assert.equal(state.pieces.length, 10)
  const occupied = new Set<number>()
  for (const piece of state.pieces) {
    for (let r = piece.row; r < piece.row + piece.height; r++) {
      for (let c = piece.col; c < piece.col + piece.width; c++) {
        assert.equal(occupied.has(r * 4 + c), false)
        occupied.add(r * 4 + c)
      }
    }
  }
  assert.equal(occupied.size, 18)
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].filter(cell => !occupied.has(cell)), [17, 18])
  assert.deepEqual(state.pieces.find(piece => piece.id === 'cao'), { id: 'cao', name: '曹操', width: 2, height: 2, col: 1, row: 0, kind: 'leader' })
  assert.equal(state.pieces.find(piece => piece.id === 'guan')?.width, 2)
})

test('pieces cannot overlap, leave the board, or rotate', () => {
  const state = initialHuarongState()
  for (const direction of DIRECTIONS) assert.equal(moveHuarong(state, 'cao', direction), state)
  assert.equal(moveHuarong(state, 'soldier-3', 'left'), state)
  assert.equal(moveHuarong(state, 'soldier-3', 'down'), state)
  assert.deepEqual(legalHuarongDirections(state, 'soldier-1'), ['down'])
  const next = moveHuarong(state, 'soldier-1', 'down')
  assert.equal(next.pieces.find(piece => piece.id === 'soldier-1')?.row, 4)
  assert.equal(next.moves, 1)
  assert.equal(next.won, false)
})

test('moves preserve earlier positions; undo restores pieces and move count', () => {
  const run = startHuarong()
  const original = structuredClone(run.current)
  run.current.pieces.forEach(Object.freeze)
  Object.freeze(run.current.pieces)
  Object.freeze(run.current)
  const moved = moveHuarongRun(run, 'soldier-1', 'down')
  assert.deepEqual(run.current, original)
  assert.deepEqual(undoHuarong(moved), run)
  assert.deepEqual(startHuarong(), run)
  assert.equal(undoHuarong(run), run)
})

test('only Cao Cao arriving at the bottom center completes the puzzle', () => {
  const state: HuarongState = { moves: 7, won: false, pieces: [{ id: 'cao', name: '曹操', width: 2, height: 2, col: 1, row: 2, kind: 'leader' }] }
  const won = moveHuarong(state, 'cao', 'down')
  assert.equal(won.won, true)
  assert.equal(won.moves, 8)
  assert.equal(moveHuarong(won, 'cao', 'up'), won)
  assert.equal(moveHuarong({ ...state, pieces: [{ ...state.pieces[0], col: 0 }] }, 'cao', 'down').won, false)
  const soldier: HuarongState = { moves: 0, won: false, pieces: [{ id: 'soldier', name: '卒', width: 1, height: 1, col: 1, row: 2, kind: 'soldier' }] }
  assert.equal(moveHuarong(soldier, 'soldier', 'down').won, false)
})

test('the classic layout has a legal complete solution, with interchangeable-piece canonicalization', { timeout: 30000 }, () => {
  const initial = initialHuarongState()
  const queue: { state: HuarongState; parent: number; id: string; direction: Direction }[] = [{ state: initial, parent: -1, id: '', direction: 'up' }]
  const seen = new Set([canonical(initial)])
  let goal = -1
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index]
    if (node.state.won) { goal = index; break }
    for (const piece of node.state.pieces) {
      for (const direction of DIRECTIONS) {
        const next = moveHuarong(node.state, piece.id, direction)
        if (next === node.state) continue
        const key = canonical(next)
        if (seen.has(key)) continue
        seen.add(key)
        queue.push({ state: next, parent: index, id: piece.id, direction })
      }
    }
  }
  assert.ok(goal >= 0, `classic board must be solvable after examining ${queue.length} states`)
  const path: { id: string; direction: Direction }[] = []
  for (let index = goal; queue[index].parent >= 0; index = queue[index].parent) path.push(queue[index])
  let replay = initial
  for (const step of path.reverse()) {
    const next = moveHuarong(replay, step.id, step.direction)
    assert.notEqual(next, replay)
    replay = next
  }
  assert.equal(replay.won, true)
  assert.equal(replay.moves, path.length)
})
