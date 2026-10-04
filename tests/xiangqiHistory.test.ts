import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMove, createInitialBoard } from '../src/games/xiangqi/xiangqiBoard.ts'
import { getXiangqiHistoryMove, validateXiangqiHistory } from '../src/games/xiangqi/xiangqiHistory.ts'
import { allLegalMovesChecked, inCheck } from '../src/games/xiangqi/xiangqiMoves.ts'
import type { XiangqiPositionRecord } from '../src/games/xiangqi/xiangqiRepetition.ts'
import type { Board, Move, PieceType, Side } from '../src/games/xiangqi/xiangqiTypes.ts'

const move = (fromR: number, fromC: number, toR: number, toC: number): Move => ({ fromR, fromC, toR, toC })
const apply = (board: Board, step: Move): Board => applyMove(board, step.fromR, step.fromC, step.toR, step.toC)
function position(rows: readonly string[]): Board {
  return rows.map((row, r) => [...row].map((letter, c) => letter === '.' ? null : { id: `piece-${r}-${c}`, side: letter === letter.toLowerCase() ? 'black' as const : 'red' as const, type: letter.toLowerCase() as PieceType }))
}
function play(board: Board, turn: Side, moves: readonly Move[]): XiangqiPositionRecord[] {
  const states: XiangqiPositionRecord[] = [{ board, turn }]
  for (const step of moves) {
    board = apply(board, step)
    turn = turn === 'red' ? 'black' : 'red'
    states.push({ board, turn })
  }
  return states
}

test('history validates legal moves, captures and arbitrary partial starting positions without changing IDs or inputs', () => {
  const states = play(createInitialBoard(), 'red', [move(6, 0, 5, 0), move(3, 0, 4, 0), move(5, 0, 4, 0)])
  const original = structuredClone(states)
  const current = states.at(-1)!
  assert.deepEqual(validateXiangqiHistory(states.slice(0, -1), current.board, current.turn), { ok: true, turn: 'black' })
  assert.deepEqual(validateXiangqiHistory(states.slice(1, -1), current.board, current.turn), { ok: true, turn: 'black' })
  assert.deepEqual(getXiangqiHistoryMove(states[2].board, current.board, 'red'), { move: move(5, 0, 4, 0), capture: true })
  assert.deepEqual(states, original)
})

test('history accepts the real 18-piece checking cycle with different rook columns and advisor evasions', () => {
  const board = position(['..b.kab..', '...Pn....', '...R.....', 'p........', '........p', '...CR....', 'P...c...P', '....r....', '.........', '..B.KA...'])
  const states = play(board, 'red', [
    move(9, 5, 8, 4), move(7, 4, 7, 2), move(8, 4, 9, 3), move(7, 2, 7, 4),
    move(9, 3, 8, 4), move(7, 4, 7, 6), move(8, 4, 9, 5), move(7, 6, 7, 4), move(9, 5, 8, 4),
  ])
  const current = states.at(-1)!
  assert.deepEqual(validateXiangqiHistory(states.slice(0, -1), current.board, current.turn), { ok: true, turn: 'black' })
})

test('history rejects blocked rook jumps, own-piece captures, identity changes and multi-piece changes', () => {
  const before = createInitialBoard()
  const valid = apply(before, move(6, 0, 5, 0))
  const identityChanged = structuredClone(valid)
  identityChanged[5][0]!.id = 'new-pawn'
  const typeChanged = structuredClone(valid)
  typeChanged[5][0]!.type = 'r'
  const extraMove = apply(valid, move(6, 2, 5, 2))
  const swapped = structuredClone(before)
  ;[swapped[0][2], swapped[0][6]] = [swapped[0][6], swapped[0][2]]
  for (const after of [apply(before, move(9, 0, 5, 0)), apply(before, move(9, 0, 6, 0)), identityChanged, typeChanged, extraMove, swapped]) {
    assert.equal(validateXiangqiHistory([{ board: before, turn: 'red' }], after, 'black').ok, false)
  }
})

test('history rejects nonalternating moves, unchanged boards and fabricated repeated snapshots', () => {
  const before = createInitialBoard(), after = apply(before, move(6, 0, 5, 0))
  assert.deepEqual(validateXiangqiHistory([{ board: before, turn: 'red' }], after, 'red'), { ok: false, reason: 'nonalternating-history' })
  assert.equal(validateXiangqiHistory([{ board: before, turn: 'red' }], before, 'black').ok, false)
  assert.equal(validateXiangqiHistory([{ board: before, turn: 'red' }, { board: before, turn: 'black' }], before, 'red').ok, false)
})

test('history rejects impossible palace/elephant/pawn positions and a nonmoving side left in check', () => {
  const boards: Board[] = []
  const king = createInitialBoard()
  king[9][4] = null; king[6][3] = { id: 'red-king', side: 'red', type: 'k' }; boards.push(king)
  const advisor = createInitialBoard()
  advisor[9][3] = null; advisor[8][3] = { id: 'red-advisor', side: 'red', type: 'a' }; boards.push(advisor)
  const elephant = createInitialBoard()
  elephant[9][2] = null; elephant[6][2] = { id: 'red-elephant', side: 'red', type: 'b' }; boards.push(elephant)
  const pawn = createInitialBoard()
  pawn[6][0] = null; pawn[5][1] = { id: 'red-pawn', side: 'red', type: 'p' }; boards.push(pawn)
  const checkedOpponent = position(['...k.....', '.........', '...R.....', '.........', '.........', '.........', '.........', '.........', '.........', '.....K...'])
  boards.push(checkedOpponent)
  for (const board of boards) assert.equal(validateXiangqiHistory([], board, 'red').ok, false)
})

test('history normalizes the old winning mover turn only on proven checkmate or stalemate', () => {
  const mateBefore = position(['....k....', 'R....P...', '...RP....', '.........', '.........', '.........', '.........', '.........', '.........', '....K....'])
  const mateAfter = apply(mateBefore, move(1, 0, 1, 4))
  assert.equal(inCheck(mateAfter, 'black'), true)
  assert.equal(allLegalMovesChecked(mateAfter, 'black').length, 0)
  assert.deepEqual(validateXiangqiHistory([{ board: mateBefore, turn: 'red' }], mateAfter, 'red'), { ok: true, turn: 'black' })
  assert.deepEqual(validateXiangqiHistory([{ board: mateBefore, turn: 'red' }], mateAfter, 'black'), { ok: true, turn: 'black' })
  assert.deepEqual(validateXiangqiHistory([], mateAfter, 'red'), { ok: true, turn: 'black' })

  const stalemateBefore = position(['....k....', 'R........', '....PR...', '.........', '.........', '.........', '.........', '.........', '.........', '....K....'])
  const stalemateAfter = apply(stalemateBefore, move(1, 0, 1, 3))
  assert.equal(inCheck(stalemateAfter, 'black'), false)
  assert.equal(allLegalMovesChecked(stalemateAfter, 'black').length, 0)
  assert.deepEqual(validateXiangqiHistory([{ board: stalemateBefore, turn: 'red' }], stalemateAfter, 'red'), { ok: true, turn: 'black' })
})

test('history permits only a final legacy king capture and cannot continue beyond physical termination', () => {
  const before = position(['R...k....', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.....K...'])
  const after = apply(before, move(0, 0, 0, 4))
  assert.deepEqual(validateXiangqiHistory([{ board: before, turn: 'red' }], after, 'red'), { ok: true, turn: 'black' })
  assert.deepEqual(validateXiangqiHistory([], after, 'red'), { ok: true, turn: 'black' })
  const impossibleNext = apply(after, move(0, 4, 1, 4))
  assert.equal(validateXiangqiHistory([{ board: before, turn: 'red' }, { board: after, turn: 'red' }], impossibleNext, 'black').ok, false)
})
