import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMove } from '../src/games/xiangqi/xiangqiBoard.ts'
import { getXiangqiNaturalDraw, getXiangqiNaturalMoveCount, isXiangqiDeadPosition } from '../src/games/xiangqi/xiangqiNaturalDraw.ts'
import type { XiangqiPositionRecord } from '../src/games/xiangqi/xiangqiRepetition.ts'
import type { Board, Move, PieceType, Side } from '../src/games/xiangqi/xiangqiTypes.ts'

const move = (fromR: number, fromC: number, toR: number, toC: number): Move => ({ fromR, fromC, toR, toC })
function position(rows: readonly string[]): Board {
  return rows.map((row, r) => [...row].map((letter, c) => letter === '.' ? null : { id: `piece-${r}-${c}`, side: letter === letter.toLowerCase() ? 'black' as const : 'red' as const, type: letter.toLowerCase() as PieceType }))
}
function play(board: Board, turn: Side, steps: readonly Move[], plies: number): XiangqiPositionRecord[] {
  const states: XiangqiPositionRecord[] = [{ board, turn }]
  for (let index = 0; index < plies; index++) {
    const step = steps[index % steps.length]
    board = applyMove(board, step.fromR, step.fromC, step.toR, step.toC)
    turn = turn === 'red' ? 'black' : 'red'
    states.push({ board, turn })
  }
  return states
}
function count(states: readonly XiangqiPositionRecord[]) {
  const current = states.at(-1)!
  return getXiangqiNaturalMoveCount(states.slice(0, -1), current.board, current.turn)
}
function outcome(states: readonly XiangqiPositionRecord[]) {
  const current = states.at(-1)!
  return getXiangqiNaturalDraw(states.slice(0, -1), current.board, current.turn)
}

test('dead positions are proven only when both sides have entirely defensive legal material', () => {
  const bare = position(['...k.....', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.....K...'])
  assert.equal(isXiangqiDeadPosition(bare), true)
  assert.deepEqual(getXiangqiNaturalDraw([], bare, 'red'), { kind: 'dead-position' })
  const defenders = position(['..bak....', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '....A....', '..B.K....'])
  assert.equal(isXiangqiDeadPosition(defenders), true)
})

test('one side having only defensive pieces is insufficient to declare a draw', () => {
  const board = position(['...k.....', '.........', '.........', '.........', '.........', '.........', 'R........', '.........', '.........', '.....K...'])
  for (const type of ['r', 'c', 'n', 'p'] as const) {
    board[6][0]!.type = type
    assert.equal(isXiangqiDeadPosition(board), false)
    assert.equal(getXiangqiNaturalDraw([], board, 'red'), null)
  }
})

test('invalid defensive material, missing kings and facing kings are not certified as dead draws', () => {
  const bare = position(['...k.....', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.....K...'])
  const missing = structuredClone(bare); missing[0][3] = null
  const misplaced = structuredClone(bare); misplaced[5][4] = { id: 'wrong-advisor', side: 'red', type: 'a' }
  const facing = structuredClone(bare); facing[9][5] = null; facing[9][3] = { id: 'red-king', side: 'red', type: 'k' }
  for (const board of [missing, misplaced, facing]) assert.equal(isXiangqiDeadPosition(board), false)
})

test('WXF natural count reaches 100 noncapture plies rather than 120, preserving partial-history semantics', () => {
  const board = position(['...k.....', '.........', '.........', '........r', '.........', '.........', 'R........', '.........', '.........', '.....K...'])
  const cycle = [move(9, 5, 8, 5), move(0, 3, 1, 3), move(8, 5, 9, 5), move(1, 3, 0, 3)]
  const states = play(board, 'red', cycle, 100)
  const original = structuredClone(states)
  assert.deepEqual(count(states.slice(0, 100)), { plies: 99, checks: { red: 0, black: 0 }, eligible: { red: 99, black: 99 } })
  assert.equal(outcome(states.slice(0, 100)), null)
  assert.deepEqual(outcome(states), { kind: 'natural-movecount' })
  assert.deepEqual(count(states), { plies: 100, checks: { red: 0, black: 0 }, eligible: { red: 100, black: 100 } })
  assert.equal(outcome(states.slice(1)), null, 'an omitted first ply cannot be invented from the current board')
  assert.equal(getXiangqiNaturalMoveCount([], states[100].board, 'red')!.plies, 0)
  assert.deepEqual(states, original)
})

test('checks beyond ten are excluded from that possible requesting side’s count', () => {
  const board = position(['..b.kab..', '...Pn....', '...R.....', 'p........', '........p', '...CR....', 'P.r.c...P', 'B...r....', '.........', '....KA...'])
  const cycle = [move(9, 5, 8, 4), move(7, 4, 7, 8), move(8, 4, 9, 5), move(7, 8, 7, 4)]
  assert.deepEqual(count(play(board, 'red', cycle, 20)), { plies: 20, checks: { red: 0, black: 10 }, eligible: { red: 20, black: 20 } })
  assert.deepEqual(count(play(board, 'red', cycle, 24)), { plies: 24, checks: { red: 0, black: 12 }, eligible: { red: 24, black: 22 } })
  assert.deepEqual(outcome(play(board, 'red', cycle, 100)), { kind: 'natural-movecount' }, 'the nonchecking side can make a valid 100-ply claim')
})

test('cross-check histories count each side independently and draw when either valid claim reaches 100', () => {
  const board = position(['.........', '.........', '...k.....', '....c....', '.........', '.........', '...p.....', '....C....', '...R.....', '....K....'])
  const cycle = [move(7, 4, 7, 3), move(6, 3, 6, 4), move(7, 3, 7, 4), move(6, 4, 6, 3)]
  const states = play(board, 'red', cycle, 179)
  assert.deepEqual(count(states.slice(0, 179)), { plies: 178, checks: { red: 89, black: 89 }, eligible: { red: 99, black: 99 } })
  assert.equal(outcome(states.slice(0, 179)), null)
  assert.deepEqual(count(states), { plies: 179, checks: { red: 90, black: 89 }, eligible: { red: 99, black: 100 } })
  assert.deepEqual(outcome(states), { kind: 'natural-movecount' })
})

test('a real capture resets natural plies and both checking counters without discarding undo history', () => {
  const board = position(['...k.....', '.........', '.........', '........r', 'p........', '.........', 'R........', '.........', '.........', '.....K...'])
  const cycle = [move(9, 5, 8, 5), move(0, 3, 1, 3), move(8, 5, 9, 5), move(1, 3, 0, 3)]
  const states = play(board, 'red', cycle, 12)
  const previous = states.at(-1)!
  states.push({ board: applyMove(previous.board, 6, 0, 4, 0), turn: 'black' })
  assert.deepEqual(count(states), { plies: 0, checks: { red: 0, black: 0 }, eligible: { red: 0, black: 0 } })
  assert.equal(count(states.slice(0, -1))!.plies, 12, 'undo reconstructs the count before capture')
  assert.equal(states.length, 14)
})

test('pawn advancement is not a capture and does not reset the WXF natural count', () => {
  const board = position(['...k.....', '.........', '.........', '.........', '.........', '.........', 'P........', '.........', '.........', '.....K...'])
  const states = play(board, 'red', [move(6, 0, 5, 0)], 1)
  assert.deepEqual(count(states), { plies: 1, checks: { red: 0, black: 0 }, eligible: { red: 1, black: 1 } })
})

test('malformed or fabricated history cannot manufacture a natural draw', () => {
  const board = position(['...k.....', '.........', '.........', '........r', '.........', '.........', 'R........', '.........', '.........', '.....K...'])
  const history = Array.from({ length: 120 }, (_, index) => ({ board, turn: index % 2 ? 'black' as const : 'red' as const }))
  assert.equal(getXiangqiNaturalMoveCount(history, board, 'red'), null)
  assert.equal(getXiangqiNaturalDraw(history, board, 'red'), null)
})

test('physical checkmate and stalemate remain losses, never dead-position draws', () => {
  const mate = position(['....k....', '....RP...', '...RP....', '.........', '.........', '.........', '.........', '.........', '.........', '....K....'])
  const stalemate = position(['....k....', '...R.....', '....PR...', '.........', '.........', '.........', '.........', '.........', '.........', '....K....'])
  assert.equal(getXiangqiNaturalDraw([], mate, 'black'), null)
  assert.equal(getXiangqiNaturalDraw([], stalemate, 'black'), null)
})

test('natural-count history processing respects the search deadline callback and preserves inputs on interruption', () => {
  const board = position(['...k.....', '.........', '.........', '........r', '.........', '.........', 'R........', '.........', '.........', '.....K...'])
  const states = play(board, 'red', [move(9, 5, 8, 5), move(0, 3, 1, 3), move(8, 5, 9, 5), move(1, 3, 0, 3)], 120)
  const original = structuredClone(states), current = states.at(-1)!, deadline = new Error('deadline')
  let calls = 0
  assert.throws(() => getXiangqiNaturalMoveCount(states.slice(0, -1), current.board, current.turn, { check() { if (++calls === 500) throw deadline } }), error => error === deadline)
  assert.equal(calls, 500)
  assert.deepEqual(states, original)
})
