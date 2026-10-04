import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeXiangqi } from '../src/games/xiangqi/xiangqiAi.ts'
import { applyMove } from '../src/games/xiangqi/xiangqiBoard.ts'
import { allLegalMovesChecked, getXiangqiWinner, inCheck } from '../src/games/xiangqi/xiangqiMoves.ts'
import { getXiangqiNaturalMoveCount } from '../src/games/xiangqi/xiangqiNaturalDraw.ts'
import { XiangqiRepetitionTracker, xiangqiPositionKey, type XiangqiPositionRecord } from '../src/games/xiangqi/xiangqiRepetition.ts'
import { getWxfRepetitionResult, getWxfRepetitionWarning } from '../src/games/xiangqi/xiangqiWxfRepetition.ts'
import type { Board, Move, PieceType, Side } from '../src/games/xiangqi/xiangqiTypes.ts'

const other = (side: Side): Side => side === 'red' ? 'black' : 'red'
const sameMove = (a: Move, b: Move) => a.fromR === b.fromR && a.fromC === b.fromC && a.toR === b.toR && a.toC === b.toC
const apply = (board: Board, move: Move) => applyMove(board, move.fromR, move.fromC, move.toR, move.toC)

function position(rows: readonly string[]): Board {
  return rows.map((row, r) => [...row].map((letter, c) => letter === '.' ? null : {
    id: `test-piece-${r}-${c}`, side: letter === letter.toLowerCase() ? 'black' : 'red', type: letter.toLowerCase() as PieceType,
  }))
}

function move(text: string): Move {
  return { fromR: 9 - Number(text[1]), fromC: text.charCodeAt(0) - 97, toR: 9 - Number(text[3]), toC: text.charCodeAt(2) - 97 }
}

function play(board: Board, turn: Side, sequence: readonly string[], cycles: number): XiangqiPositionRecord[] {
  const states = [{ board, turn }]
  for (let cycle = 0; cycle < cycles; cycle++) for (const text of sequence) {
    const step = move(text)
    assert.ok(allLegalMovesChecked(board, turn).some(candidate => sameMove(candidate, step)), `illegal fixture ${text}`)
    board = apply(board, step); turn = other(turn)
    states.push({ board, turn })
  }
  return states
}

function clocked<T>(now: () => number, operation: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(performance, 'now')
  Object.defineProperty(performance, 'now', { configurable: true, value: now })
  try { return operation() } finally {
    if (descriptor) Object.defineProperty(performance, 'now', descriptor)
    else Reflect.deleteProperty(performance, 'now')
  }
}

// The predecessor walk uses only symmetric rook/general moves and verifies
// every forward replay. No repeated board+turn occurs, so natural-count tests
// cannot pass accidentally through the separate repetition adjudicator.
function quietHistoryEndingAt(board: Board, turn: Side, plies: number, seed: number): XiangqiPositionRecord[] {
  const reversed: XiangqiPositionRecord[] = [{ board, turn }]
  const visited = new Set([xiangqiPositionKey(board, turn)])
  let random = seed
  for (let index = 0; index < plies; index++) {
    const previousTurn = other(turn)
    const candidates = allLegalMovesChecked(board, previousTurn)
      .filter(step => ['r', 'k'].includes(board[step.fromR][step.fromC]!.type) && !board[step.toR][step.toC])
      .map(step => apply(board, step))
      .filter(previous => !inCheck(previous, turn) && !visited.has(xiangqiPositionKey(previous, previousTurn)))
    assert.ok(candidates.length, `predecessor fixture stopped at ${index}`)
    random ^= random << 13; random ^= random >>> 17; random ^= random << 5
    board = candidates[(random >>> 0) % candidates.length]; turn = previousTurn
    visited.add(xiangqiPositionKey(board, turn))
    reversed.push({ board, turn })
  }
  const states = reversed.reverse()
  for (let index = 0; index < states.length - 1; index++) {
    const before = states[index], after = states[index + 1]
    assert.ok(allLegalMovesChecked(before.board, before.turn).some(step => xiangqiPositionKey(apply(before.board, step), after.turn) === xiangqiPositionKey(after.board, after.turn)))
  }
  return states
}

const chaseBoard = position([
  '.cbak....', 'R...a....', '....b....', '.......P.', '.........', '..P......', '...pp....', '........r', '.........', '...AKA...',
])
const chaseMoves = ['a8b8', 'b9a9', 'b8a8', 'a9b9']

test('AI treats WXF long chase as a loss although the compact check-only screen does not', () => {
  const states = play(chaseBoard, 'red', chaseMoves, 2), current = states.at(-1)!, history = states.slice(0, -1)
  assert.ok(states.every(state => !inCheck(state.board, state.turn)))
  assert.deepEqual(getWxfRepetitionResult(history, current.board, current.turn), { kind: 'perpetual-chase', offender: 'red', winner: 'black' })
  const compact = new XiangqiRepetitionTracker(states.map(state => ({ key: xiangqiPositionKey(state.board, state.turn), turn: state.turn, checked: false })))
  assert.equal(compact.result(), null)
  const before = structuredClone(states)
  assert.equal(analyzeXiangqi(current.board, current.turn, 150, 6, history).move, null)
  assert.deepEqual(states, before)
})

test('AI changes the rook/cannon chasing cycle while preserving a legal 25ms fallback', () => {
  const states = play(chaseBoard, 'red', chaseMoves, 1), current = states.at(-1)!, history = states.slice(0, -1), recurring = move(chaseMoves[0])
  assert.deepEqual(getWxfRepetitionWarning([...history, current], apply(current.board, recurring), 'black'), { kind: 'perpetual-chase', offender: 'red', winner: 'black' })
  const before = structuredClone(states)
  for (const [budget, step] of [[25, .02], [25, .1], [200, .5]]) {
    let time = 0
    const decision = clocked(() => time += step, () => analyzeXiangqi(current.board, current.turn, budget, 6, history))
    assert.ok(decision.move)
    assert.ok(allLegalMovesChecked(current.board, current.turn).some(candidate => sameMove(candidate, decision.move!)))
    assert.equal(sameMove(decision.move, recurring), false, 'AI continued its own illegal chasing cycle')
    assert.ok(decision.analysis.elapsedMs <= budget + step * 3)
    assert.deepEqual(states, before)
  }
})

test('AI avoids WXF diagram 81 long chase even when the final whole board has never occurred', () => {
  const board = position(['..b.ka.P.', '....a....', 'b........', 'p.....R..', '........c', '.......R.', 'P.p...p..', '...rBn...', 'N..C..n.C', '...K.NB..'])
  const steps = ['h4h5', 'i5i7', 'g6g7', 'i7i6', 'h5h6', 'i6i5', 'g7g5', 'i5i7', 'h6h7', 'i7i6', 'g5g6', 'i6i5', 'h7h5', 'i5i7']
  const states = play(board, 'red', steps, 1), current = states.at(-1)!, history = states.slice(0, -1), continuation = move('h5h7')
  const after = { board: apply(current.board, continuation), turn: 'black' as const }
  assert.ok(states.every(state => xiangqiPositionKey(state.board, state.turn) !== xiangqiPositionKey(after.board, after.turn)))
  assert.deepEqual(getWxfRepetitionWarning(states, after.board, after.turn), { kind: 'perpetual-chase', offender: 'red', winner: 'black' })
  const compact = new XiangqiRepetitionTracker([...states, after].map(state => ({ key: xiangqiPositionKey(state.board, state.turn), turn: state.turn, checked: inCheck(state.board, state.turn) })))
  assert.equal(compact.occurrencesCurrent(), 1)
  assert.equal(compact.activityOccurrencesCurrent(), 2)
  const before = structuredClone(states)
  for (const step of [.02, .1]) {
    let time = 0
    const decision = clocked(() => time += step, () => analyzeXiangqi(current.board, current.turn, 25, 6, history))
    assert.ok(decision.move)
    assert.ok(allLegalMovesChecked(current.board, current.turn).some(candidate => sameMove(candidate, decision.move!)))
    assert.equal(sameMove(decision.move, continuation), false)
    const warning = getWxfRepetitionWarning(states, apply(current.board, decision.move), 'black')
    assert.ok(!warning || warning.kind === 'repetition-draw' || warning.offender !== 'red')
    assert.ok(decision.analysis.elapsedMs <= 25 + step * 3)
    assert.deepEqual(states, before)
  }
})

test('AI distinguishes a legal third occurrence from the WXF fourth-occurrence draw', () => {
  const board = position(['....k.b.c', '.......P.', '...a.....', '.........', '.........', '.........', '.........', '.........', '...K.....', '.........'])
  const states = play(board, 'red', ['h8i8', 'i9h9', 'i8h8', 'h9i9'], 3)
  const third = states[8]
  assert.equal(getWxfRepetitionResult(states.slice(0, 8), third.board, third.turn), null)
  const chosen = analyzeXiangqi(third.board, third.turn, 25, 1, states.slice(0, 8)).move
  assert.ok(chosen)
  assert.ok(allLegalMovesChecked(third.board, third.turn).some(candidate => sameMove(candidate, chosen)))
  const fourth = states[12]
  assert.deepEqual(getWxfRepetitionResult(states.slice(0, 12), fourth.board, fourth.turn), { kind: 'repetition-draw' })
  assert.equal(analyzeXiangqi(fourth.board, fourth.turn, 150, 6, states.slice(0, 12)).move, null)
})

test('AI stops at a proven defensive dead position and continues if an attacking piece remains', () => {
  const board = position(['...k.....', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.....K...'])
  const before = structuredClone(board)
  assert.equal(analyzeXiangqi(board, 'red', 100, 4).move, null)
  assert.deepEqual(board, before)
  board[6][0] = { id: 'remaining-rook', side: 'red', type: 'r' }
  assert.ok(analyzeXiangqi(board, 'red', 25, 1).move)
  board[0][3] = null
  assert.equal(analyzeXiangqi(board, 'red', 25, 1).move, null, 'an imported legacy general capture already ended the game')
})

const mateBefore = position(['....k....', '...P.....', '....P....', '..R......', '.........', '.........', '.........', '.........', '.........', '....K....'])

test('AI natural count stops at 100 distinct quiet plies, without a repetition shortcut', () => {
  const states = quietHistoryEndingAt(mateBefore, 'red', 100, 4), current = states.at(-1)!, history = states.slice(0, -1)
  assert.equal(getWxfRepetitionResult(history, current.board, current.turn), null)
  assert.equal(getXiangqiNaturalMoveCount(history, current.board, current.turn)!.plies, 100)
  assert.ok(allLegalMovesChecked(current.board, current.turn).length)
  const before = structuredClone(states)
  const decision = clocked(() => 0, () => analyzeXiangqi(current.board, current.turn, 100, 1, history))
  assert.equal(decision.move, null)
  assert.equal(decision.analysis.timedOut, false)
  assert.deepEqual(states, before)
})

test('a noncapturing mate on the hundredth ply overrides the prospective natural draw', () => {
  const states = quietHistoryEndingAt(mateBefore, 'red', 99, 4), current = states.at(-1)!, history = states.slice(0, -1)
  assert.equal(getXiangqiNaturalMoveCount(history, current.board, current.turn)!.plies, 99)
  assert.equal(getWxfRepetitionResult(history, current.board, current.turn), null)
  const before = structuredClone(states)
  const decision = clocked(() => 0, () => analyzeXiangqi(current.board, current.turn, 100, 2, history))
  assert.ok(decision.move)
  assert.equal(current.board[decision.move.toR][decision.move.toC], null)
  const won = apply(current.board, decision.move)
  assert.equal(getXiangqiNaturalMoveCount([...history, current], won, 'black')!.plies, 100)
  assert.equal(getXiangqiWinner(won, 'black'), 'red')
  assert.equal(decision.analysis.depth, 1)
  assert.deepEqual(states, before)
})

test('the AI captures at the natural-count boundary and resets search-path counts', () => {
  const board = position(['...k.....', '.........', '.........', '........p', 'r........', '.........', 'R........', '.........', '.........', '.....K...'])
  const states = quietHistoryEndingAt(board, 'red', 99, 1), current = states.at(-1)!, history = states.slice(0, -1)
  assert.equal(getXiangqiNaturalMoveCount(history, current.board, current.turn)!.plies, 99)
  assert.equal(getWxfRepetitionResult(history, current.board, current.turn), null)
  const before = structuredClone(states)
  const decision = clocked(() => 0, () => analyzeXiangqi(current.board, current.turn, 100, 1, history))
  assert.ok(decision.move)
  assert.equal(current.board[decision.move.toR][decision.move.toC]?.side, 'black', 'a winning capture should beat a natural draw')
  const after = apply(current.board, decision.move)
  assert.equal(getXiangqiNaturalMoveCount([...history, current], after, 'black')!.plies, 0)
  assert.ok(allLegalMovesChecked(after, 'black').length)
  assert.deepEqual(states, before)
})

test('compact activity guard counts played phases separately and restores them on undo', () => {
  const tracker = new XiangqiRepetitionTracker()
  const stamps = ['red:A', 'black:B', 'red:C', 'black:D', 'red:A', 'black:B', 'red:C', 'black:D', 'red:novel']
  for (const key of stamps) tracker.push({ key, turn: key.startsWith('red') ? 'red' : 'black', checked: false })
  assert.equal(tracker.occurrencesCurrent(), 1)
  assert.equal(tracker.activityOccurrencesCurrent(), 2)
  tracker.pop()
  tracker.pop()
  tracker.pop()
  assert.equal(tracker.activityOccurrencesCurrent(), 1, 'the current unplayed black phase must not count as its second played occurrence')
  tracker.push({ key: 'red:C', turn: 'red', checked: false })
  tracker.push({ key: 'black:D', turn: 'black', checked: false })
  tracker.push({ key: 'red:novel', turn: 'red', checked: false })
  assert.equal(tracker.activityOccurrencesCurrent(), 2)
})
