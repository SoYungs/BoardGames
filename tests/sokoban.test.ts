import assert from 'node:assert/strict'
import test from 'node:test'
import { SOKOBAN_LEVELS } from '../src/games/sokoban/sokobanLevels.ts'
import { moveSokoban, moveSokobanRun, parseSokobanLevel, startSokoban, undoSokoban } from '../src/games/sokoban/sokobanLogic.ts'
import type { Direction, SokobanBoard, SokobanState } from '../src/games/sokoban/sokobanLogic.ts'

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right']

function solve(board: SokobanBoard): Direction[] | null {
  const queue: { state: SokobanState; parent: number; direction: Direction | null }[] = [{ state: board.initial, parent: -1, direction: null }]
  const key = (state: SokobanState) => `${state.player}:${[...state.boxes].sort((a, b) => a - b).join(',')}`
  const seen = new Set([key(board.initial)])
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index]
    if (node.state.won) {
      const path: Direction[] = []
      for (let current = index; queue[current].parent >= 0; current = queue[current].parent) path.push(queue[current].direction!)
      return path.reverse()
    }
    for (const direction of DIRECTIONS) {
      const next = moveSokoban(board, node.state, direction)
      const nextKey = key(next)
      if (next === node.state || seen.has(nextKey)) continue
      seen.add(nextKey)
      queue.push({ state: next, parent: index, direction })
    }
  }
  return null
}

for (const level of SOKOBAN_LEVELS) {
  test(`authored level ${level.id} is solvable and its solution replays legally`, () => {
    const board = parseSokobanLevel(level)
    const solution = solve(board)
    assert.ok(solution && solution.length > 0, `${level.name} must have a playable solution`)
    let state = board.initial
    for (const direction of solution) {
      const next = moveSokoban(board, state, direction)
      assert.notEqual(next, state)
      state = next
    }
    assert.equal(state.won, true)
    assert.equal(state.moves, solution.length)
    assert.ok(state.boxes.every(position => board.goals.has(position)))
  })
}

test('walls and board boundaries stop movement without adding steps', () => {
  const board = parseSokobanLevel({ id: 'bounds', name: '', hint: '', map: ['@$ .'] })
  assert.equal(moveSokoban(board, board.initial, 'left'), board.initial)
  assert.equal(moveSokoban(board, board.initial, 'up'), board.initial)
  const wallBoard = parseSokobanLevel({ id: 'wall', name: '', hint: '', map: ['#####', '#@$##', '# . #', '#####'] })
  assert.equal(moveSokoban(wallBoard, wallBoard.initial, 'right'), wallBoard.initial)
})

test('a player pushes only one box and never pulls a box', () => {
  const board = parseSokobanLevel({ id: 'blocked', name: '', hint: '', map: ['########', '# @$$..#', '#      #', '########'] })
  assert.equal(moveSokoban(board, board.initial, 'right'), board.initial)
  const walked = moveSokoban(board, board.initial, 'left')
  assert.deepEqual(walked.boxes, board.initial.boxes)
  assert.equal(walked.moves, 1)
  assert.equal(walked.pushes, 0)
})

test('a legal push updates counters immutably; undo restores a win and restart clears history', () => {
  const board = parseSokobanLevel(SOKOBAN_LEVELS[0])
  const run = startSokoban(board)
  const original = structuredClone(run.current)
  Object.freeze(run.current.boxes)
  Object.freeze(run.current)
  const won = moveSokobanRun(board, run, 'right')
  assert.equal(won.current.won, true)
  assert.equal(won.current.moves, 1)
  assert.equal(won.current.pushes, 1)
  assert.deepEqual(run.current, original)
  assert.equal(moveSokobanRun(board, won, 'left'), won, 'completed levels stop accepting moves')
  assert.deepEqual(undoSokoban(won), run)
  assert.deepEqual(startSokoban(board), run)
})

test('malformed maps fail clearly instead of creating unwinnable games', () => {
  const malformed = (map: string[]) => ({ id: 'invalid', name: '', hint: '', map })
  assert.throws(() => parseSokobanLevel(malformed(['###', '#@'])), /矩形/)
  assert.throws(() => parseSokobanLevel(malformed(['@$$.'])), /数量相等/)
  assert.throws(() => parseSokobanLevel(malformed(['@@$.'])), /一名玩家/)
  assert.throws(() => parseSokobanLevel(malformed(['@x$.'])), /未知/)
})
