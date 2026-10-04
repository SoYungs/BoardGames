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

function clocked<T>(step: number, operation: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(performance, 'now')
  let clock = 0
  Object.defineProperty(performance, 'now', { configurable: true, value: () => clock += step })
  try { return operation() } finally {
    if (descriptor) Object.defineProperty(performance, 'now', descriptor)
    else Reflect.deleteProperty(performance, 'now')
  }
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

// The later, complete user game captured after the first repair. A rook was
// exchanged for a bishop before the advisor/rook loop resumed in 18 pieces.
const laterUserMoves = [
  move(9, 5, 8, 4), move(7, 4, 7, 6), move(8, 4, 9, 5), move(6, 2, 9, 2), move(7, 0, 9, 2),
  move(7, 6, 7, 4), move(9, 5, 8, 4), move(7, 4, 7, 2), move(8, 4, 9, 3), move(7, 2, 7, 4),
  move(9, 3, 8, 4), move(7, 4, 7, 6), move(8, 4, 9, 5), move(7, 6, 7, 4), move(9, 5, 8, 4),
]

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

test('AI changes a quiet second position return before a third repetition is reached', () => {
  const board = position(['....k....', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '...K.....'])
  const steps = [move(9, 3, 8, 3), move(0, 4, 1, 4), move(8, 3, 9, 3)]
  const states = play(board, 'red', steps)
  const current = states[3], history = states.slice(0, 3), returnMove = move(1, 4, 0, 4)
  assert.deepEqual(getXiangqiRepetitionWarning([...history, current], apply(current.board, returnMove), 'red'), { kind: 'repetition-draw' })
  for (const depth of [1, 6]) {
    const { move: chosen } = analyzeXiangqi(current.board, 'black', 25, depth, history)
    assert.ok(chosen)
    assert.equal(sameMove(chosen, returnMove), false, 'AI preferred a quiet loop over another legal king square')
    assert.ok(allLegalMovesChecked(current.board, 'black').some(candidate => sameMove(candidate, chosen)))
  }
})

test('AI discourages its own A-B-A-B piece shuffle even when a pawn makes the board layouts new', () => {
  const board = position(['....k....', '.........', '.........', '...r.....', '.........', '.........', 'P........', '.........', '.........', '.....K...'])
  const steps = [move(3, 3, 3, 4), move(6, 0, 5, 0), move(3, 4, 3, 3), move(5, 0, 4, 0)]
  const states = play(board, 'black', steps)
  const current = states[4], history = states.slice(0, 4), bounce = move(3, 3, 3, 4)
  const next = apply(current.board, bounce)
  assert.ok(history.every(state => xiangqiPositionKey(state.board, state.turn) !== xiangqiPositionKey(next, 'red')), 'this fixture must exercise shuffling without a repeated whole layout')
  const { move: chosen } = analyzeXiangqi(current.board, 'black', 25, 6, history)
  assert.ok(chosen)
  assert.equal(sameMove(chosen, bounce), false)
  assert.ok(allLegalMovesChecked(current.board, 'black').some(candidate => sameMove(candidate, chosen)))
})

test('a repeated square remains available when it is the only legal check evasion', () => {
  const board = position(['...k.a...', '....p....', '.........', '.........', '.........', '.........', '.........', '....C....', '.........', '....K....'])
  const steps = [move(7, 4, 7, 5), move(0, 3, 0, 4), move(7, 5, 7, 4)]
  const states = play(board, 'red', steps)
  const current = states[3], history = states.slice(0, 3), evasion = move(0, 4, 0, 3)
  assert.equal(inCheck(current.board, 'black'), true)
  assert.deepEqual(allLegalMovesChecked(current.board, 'black'), [evasion])
  assert.deepEqual(getXiangqiRepetitionWarning([...history, current], apply(current.board, evasion), 'red'), { kind: 'repetition-draw' })
  assert.deepEqual(analyzeXiangqi(current.board, 'black', 25, 6, history).move, evasion)
})

test('the actual later user game changes at move 11 and avoids a rule-losing check after the human reply', () => {
  const states = play(actualGame, 'red', laterUserMoves)
  const current = states[11], history = states.slice(0, 11), original = laterUserMoves[11]
  const repeatedCheckBoard = apply(current.board, original)
  const humanReply = laterUserMoves[12]
  assert.equal(getXiangqiRepetitionWarning([...history, current], repeatedCheckBoard, 'red'), null, 'the checking move itself has a new layout')
  assert.deepEqual(getXiangqiRepetitionWarning([...history, current, { board: repeatedCheckBoard, turn: 'red' }], apply(repeatedCheckBoard, humanReply), 'black'), { kind: 'perpetual-check', winner: 'red', offender: 'black' })
  for (const [budget, step] of [[25, .02], [25, .1], [700, 1]]) {
    const { move: chosen } = clocked(step, () => analyzeXiangqi(current.board, 'black', budget, 8, history))
    assert.ok(chosen)
    assert.equal(sameMove(chosen, original), false, 'AI waited until after the human closed the long-check cycle')
    const after = apply(current.board, chosen)
    for (const reply of allLegalMovesChecked(after, 'red')) {
      const response = apply(after, reply)
      assert.ok(allLegalMovesChecked(response, 'black').length > 0, 'the fixture still has defences that avoid immediate mate')
      const warning = getXiangqiRepetitionWarning([...history, current, { board: after, turn: 'red' }], response, 'black')
      assert.ok(warning?.kind !== 'perpetual-check' || warning.offender !== 'black')
    }
  }
})

test('when every fresh move loses by mate, the AI accepts the losing position instead of prolonging its own illegal long check', () => {
  const states = play(actualGame, 'red', laterUserMoves)
  const current = states[13], history = states.slice(0, 13), original = laterUserMoves[13]
  const before = structuredClone({ current, history })
  const legal = allLegalMovesChecked(current.board, 'black')
  assert.equal(legal.length, 29)
  for (const candidate of legal) {
    const after = apply(current.board, candidate), replies = allLegalMovesChecked(after, 'red')
    const mateReplies = replies.filter(reply => !allLegalMovesChecked(apply(after, reply), 'black').length)
    if (sameMove(candidate, original)) {
      assert.equal(mateReplies.length, 0, 'only this checking cycle delayed the immediate ordinary mate')
      const finish = apply(after, laterUserMoves[14])
      assert.deepEqual(getXiangqiRepetitionResult([...history, current, { board: after, turn: 'red' }], finish, 'black'), { kind: 'perpetual-check', winner: 'red', offender: 'black' })
    } else assert.ok(mateReplies.length > 0, 'every other legal move must allow immediate mate in this exact defeated game')
  }
  for (const [budget, step] of [[25, .02], [25, .1], [25, .5], [25, 2], [700, 1]]) {
    const { move: chosen } = clocked(step, () => analyzeXiangqi(current.board, 'black', budget, 8, history))
    assert.ok(chosen)
    assert.ok(legal.some(candidate => sameMove(candidate, chosen)))
    assert.equal(sameMove(chosen, original), false, 'the safety fallback treated rule-losing long check as safe')
  }
  const strongest = analyzeXiangqi(current.board, 'black', 3000, 8, history)
  assert.ok(strongest.move)
  assert.equal(sameMove(strongest.move, original), false)
  assert.ok(strongest.analysis.elapsedMs < 3750, 'strongest search escaped its time bound')
  assert.deepEqual({ current, history }, before)
})
