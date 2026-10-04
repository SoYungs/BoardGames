import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeXiangqi } from '../src/games/xiangqi/xiangqiAi.ts'
import { applyMove } from '../src/games/xiangqi/xiangqiBoard.ts'
import { allLegalMovesChecked, inCheck } from '../src/games/xiangqi/xiangqiMoves.ts'
import { getXiangqiRepetitionResult, getXiangqiRepetitionWarning, xiangqiPositionKey, type XiangqiPositionRecord } from '../src/games/xiangqi/xiangqiRepetition.ts'
import type { Board, Move, PieceType, Side } from '../src/games/xiangqi/xiangqiTypes.ts'

const other = (side: Side): Side => side === 'red' ? 'black' : 'red'
const sameMove = (a: Move, b: Move) => a.fromR === b.fromR && a.fromC === b.fromC && a.toR === b.toR && a.toC === b.toC
const move = (fromR: number, fromC: number, toR: number, toC: number): Move => ({ fromR, fromC, toR, toC })
const apply = (board: Board, step: Move) => applyMove(board, step.fromR, step.fromC, step.toR, step.toC)

function position(rows: readonly string[]): Board {
  return rows.map((row, r) => [...row].map((letter, c) => letter === '.' ? null : {
    id: `${r}:${c}`, side: letter === letter.toLowerCase() ? 'black' : 'red', type: letter.toLowerCase() as PieceType,
  }))
}

function play(board: Board, turn: Side, moves: readonly Move[], cycles = 1): XiangqiPositionRecord[] {
  const states: XiangqiPositionRecord[] = [{ board, turn }]
  for (let cycle = 0; cycle < cycles; cycle++) for (const step of moves) {
    assert.ok(allLegalMovesChecked(board, turn).some(candidate => sameMove(candidate, step)), `illegal ${turn} fixture move ${JSON.stringify(step)}`)
    board = apply(board, step)
    turn = other(turn)
    states.push({ board, turn })
  }
  return states
}

function inspect(states: readonly XiangqiPositionRecord[]) {
  const current = states.at(-1)!
  return getXiangqiRepetitionResult(states.slice(0, -1), current.board, current.turn)
}

// Exact 19-piece position captured from the user's stalled checking cycle.
// The rook checks on column 4; moving it off column 4 discovers the cannon
// check over the defending advisor. Both red advisor moves are legal evasions.
const actualGame = position([
  '..b.kab..',
  '...Pn....',
  '...R.....',
  'p........',
  '........p',
  '...CR....',
  'P.r.c...P',
  'B...r....',
  '.........',
  '....KA...',
])
const cannonRookCycle = [move(9, 5, 8, 4), move(7, 4, 7, 8), move(8, 4, 9, 5), move(7, 8, 7, 4)]

test('actual cannon/rook cycle is unilateral continuous check, with the checking side losing at the third occurrence', () => {
  const states = play(actualGame, 'red', cannonRookCycle, 3)
  for (let index = 1; index < states.length; index++) {
    const state = states[index]
    assert.equal(inCheck(state.board, state.turn), state.turn === 'red')
  }
  assert.equal(inspect(states.slice(0, 5)), null, 'a second occurrence is a warning, not a finished game')
  assert.deepEqual(getXiangqiRepetitionWarning(states.slice(0, 4), states[4].board, 'red'), { kind: 'perpetual-check', winner: 'red', offender: 'black' })
  // The result is the same at all four cycle phases, including a position
  // after the defender's move whose side to move is not currently checked.
  for (let phase = 0; phase < 4; phase++) {
    assert.deepEqual(inspect(states.slice(0, phase + 9)), { kind: 'perpetual-check', winner: 'red', offender: 'black' })
  }
})

test('nonchecking repeated king moves draw, and changing side to move prevents a false match', () => {
  const board = position(['...k.....', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.....K...'])
  const cycle = [move(9, 5, 8, 5), move(0, 3, 1, 3), move(8, 5, 9, 5), move(1, 3, 0, 3)]
  const states = play(board, 'red', cycle, 2)
  assert.ok(states.every(state => !inCheck(state.board, state.turn)))
  assert.deepEqual(inspect(states), { kind: 'repetition-draw' })
  assert.notEqual(xiangqiPositionKey(board, 'red'), xiangqiPositionKey(board, 'black'))
  assert.equal(getXiangqiRepetitionResult(states.slice(0, 8), states[8].board, 'black'), null)
})

test('mutual perpetual check draws using a legal cannon/pawn/rook counterchecking cycle', () => {
  const board = position(['.........', '.........', '...k.....', '....c....', '.........', '.........', '...p.....', '....C....', '...R.....', '....K....'])
  const cycle = [move(7, 4, 7, 3), move(6, 3, 6, 4), move(7, 3, 7, 4), move(6, 4, 6, 3)]
  const states = play(board, 'red', cycle, 2)
  assert.ok(states.every(state => inCheck(state.board, state.turn)))
  assert.deepEqual(inspect(states), { kind: 'repetition-draw' })
})

test('a cycle containing a nonchecking move is not adjudicated as continuous check', () => {
  const board = position(['...k.....', '.........', '.........', '.........', '.........', '.........', '....r....', '.........', '.........', '....K....'])
  const cycle = [move(9, 4, 9, 5), move(6, 4, 6, 6), move(9, 5, 9, 4), move(6, 6, 6, 4)]
  const states = play(board, 'red', cycle, 2)
  assert.equal(inCheck(states[2].board, 'red'), false)
  assert.deepEqual(inspect(states), { kind: 'repetition-draw' })
})

test('repetition ignores animation IDs, preserves inputs, and respects undo or omitted history', () => {
  const states = play(actualGame, 'red', cannonRookCycle, 2)
  const renamed = states.map((state, index) => ({ ...state, board: state.board.map(row => row.map(piece => piece ? { ...piece, id: `${index}-${piece.id}` } : null)) }))
  const before = structuredClone(renamed)
  assert.deepEqual(inspect(renamed), { kind: 'perpetual-check', winner: 'red', offender: 'black' })
  assert.deepEqual(renamed, before)
  assert.equal(inspect(states.slice(0, 7)), null, 'undo removed the third occurrence')
  assert.equal(getXiangqiRepetitionResult([], states[8].board, 'red'), null, 'current layout alone cannot reconstruct old repetitions')
})

test('AI breaks the actual recurring cannon/rook check when played history supplies a safe alternative', () => {
  const states = play(actualGame, 'red', cannonRookCycle, 1)
  const current = { board: apply(states[4].board, cannonRookCycle[0]), turn: 'black' as const }
  const history = states
  const before = structuredClone({ current, history })
  const recurring = cannonRookCycle[1]
  assert.deepEqual(getXiangqiRepetitionWarning([...history, current], apply(current.board, recurring), 'red'), { kind: 'perpetual-check', winner: 'red', offender: 'black' })
  for (const budget of [25, 180]) {
    const { move: chosen, analysis } = analyzeXiangqi(current.board, 'black', budget, 6, history)
    assert.ok(chosen)
    assert.ok(allLegalMovesChecked(current.board, 'black').some(candidate => sameMove(chosen, candidate)))
    assert.equal(sameMove(chosen, recurring), false, 'AI repeated the same proven long-check cycle')
    assert.equal(inCheck(apply(current.board, chosen), 'black'), false)
    assert.ok(analysis.elapsedMs < budget + 150, 'history processing escaped the bounded search budget')
    assert.deepEqual({ current, history }, before)
  }
})

test('AI stops at an already adjudicated third occurrence and bounds large history processing', () => {
  const states = play(actualGame, 'red', cannonRookCycle, 2)
  const current = states.at(-1)!
  assert.equal(analyzeXiangqi(current.board, current.turn, 100, 8, states.slice(0, -1)).move, null)
  const before = structuredClone(actualGame)
  const descriptor = Object.getOwnPropertyDescriptor(performance, 'now')
  let clock = 0
  Object.defineProperty(performance, 'now', { configurable: true, value: () => clock += 25 })
  try {
    const hugeHistory = Array<XiangqiPositionRecord>(100_000).fill(states[0])
    const { move: chosen, analysis } = analyzeXiangqi(actualGame, 'red', 25, 8, hugeHistory)
    assert.ok(chosen)
    assert.ok(allLegalMovesChecked(actualGame, 'red').some(candidate => sameMove(chosen, candidate)))
    assert.equal(analysis.timedOut, true)
    assert.equal(analysis.depth, 0)
    assert.ok(analysis.elapsedMs <= 100)
    assert.deepEqual(actualGame, before)
  } finally {
    if (descriptor) Object.defineProperty(performance, 'now', descriptor)
    else Reflect.deleteProperty(performance, 'now')
  }
})

test('played history does not suppress a novel discovered-cannon mate', () => {
  const board = position(['....k....', '...P.P..r', '....C....', '....p...R', '.....P..r', '....C....', '.........', '.........', '.........', '....K....'])
  const trap = allLegalMovesChecked(board, 'black').find(step => board[step.toR][step.toC]?.type === 'r')!
  assert.ok(trap)
  const after = apply(board, trap)
  const history: XiangqiPositionRecord[] = [{ board, turn: 'black' }]
  const before = structuredClone({ board: after, history })
  const { move: chosen } = analyzeXiangqi(after, 'red', 25, 8, history)
  assert.ok(chosen)
  const won = apply(after, chosen)
  assert.equal(inCheck(won, 'black'), true)
  assert.equal(allLegalMovesChecked(won, 'black').length, 0)
  assert.deepEqual({ board: after, history }, before)
})
