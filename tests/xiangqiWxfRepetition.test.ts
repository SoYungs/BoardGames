import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMove } from '../src/games/xiangqi/xiangqiBoard.ts'
import { allLegalMovesChecked } from '../src/games/xiangqi/xiangqiMoves.ts'
import { getWxfRepetitionResult, getWxfRepetitionWarning, type WxfPositionRecord, type WxfRepetitionResult } from '../src/games/xiangqi/xiangqiWxfRepetition.ts'
import type { Board, Move, PieceType, Side } from '../src/games/xiangqi/xiangqiTypes.ts'

// Chess-position facts transcribed from WXF 2018 diagrams, cross-checked with
// Tan & Watkinson Medina (2024), https://arxiv.org/abs/2412.17334.
// The parser/playback/assertions are independently written for this project.
function fen(text: string): WxfPositionRecord {
  const [placement, side] = text.split(' ')
  const board: Board = placement.split('/').map((row, r) => {
    const result: Board[number] = []
    for (const character of row) {
      if (/\d/.test(character)) result.push(...Array<null>(Number(character)).fill(null))
      else result.push({ id: `${r}:${result.length}`, type: character.toLowerCase() as PieceType, side: character === character.toUpperCase() ? 'red' : 'black' })
    }
    assert.equal(result.length, 9)
    return result
  })
  assert.equal(board.length, 10)
  return { board, turn: side === 'w' ? 'red' : 'black' }
}

function uci(text: string): Move {
  return { fromR: 9 - Number(text[1]), fromC: text.charCodeAt(0) - 97, toR: 9 - Number(text[3]), toC: text.charCodeAt(2) - 97 }
}

function play(initial: WxfPositionRecord, sequence: readonly string[], cycles = 1): WxfPositionRecord[] {
  const states = [initial]
  for (let cycle = 0; cycle < cycles; cycle++) for (const text of sequence) {
    const { board, turn } = states.at(-1)!, step = uci(text)
    assert.ok(allLegalMovesChecked(board, turn).some(move => JSON.stringify(move) === JSON.stringify(step)), `illegal ${turn} ${text}`)
    states.push({ board: applyMove(board, step.fromR, step.fromC, step.toR, step.toC), turn: turn === 'red' ? 'black' : 'red' })
  }
  return states
}

function result(states: readonly WxfPositionRecord[]): WxfRepetitionResult | null {
  const current = states.at(-1)!
  return getWxfRepetitionResult(states.slice(0, -1), current.board, current.turn)
}
const chase = (offender: Side): WxfRepetitionResult => ({ kind: 'perpetual-chase', offender, winner: offender === 'red' ? 'black' : 'red' })
const draw: WxfRepetitionResult = { kind: 'repetition-draw' }

const facts = [
  { name: 'unprotected cannon chased by rook', position: '1cbak4/R3a4/4b4/7P1/9/2P6/3pp4/8r/9/3AKA3 w', moves: ['a8b8', 'b9a9', 'b8a8', 'a9b9'], expected: chase('red') },
  { name: 'WXF diagram 29: real-root cannon', position: '2b1ka3/4a4/4b4/9/9/9/9/4B3R/4A1rc1/4KA3 w', moves: ['i2h2', 'h1i1', 'h2i2', 'i1h1'], expected: draw },
  { name: 'WXF diagram 34: chase against mating threats', position: '3aka3/7R1/7c1/9/9/9/9/9/4A4/3AK1p2 b', moves: ['h7c7', 'h8c8', 'c7h7', 'c8h8'], expected: chase('red') },
  { name: 'WXF diagram 39: cannon/horse/rook protection', position: '2bak4/RC2arN2/4b1n2/2p5p/6p2/2P6/4p1P1c/4B4/4A4/4KAB2 b', moves: ['e8f9', 'b8b9', 'f9e8', 'b9b8'], expected: chase('red') },
  { name: 'WXF diagram 40: discovered cannon root', position: '2baka3/C4rN2/4b1n2/1Rp5p/6p2/2P6/4c1P1c/4B3C/4A4/4KAB2 w', moves: ['b6b8', 'f9e8', 'b8b6', 'e8f9'], expected: chase('red') },
  { name: 'WXF diagram 41: horse cannon screen', position: '3aka3/C4rN2/4b1n2/N7p/2p3p2/8P/2P3P2/9/4A4/4KA3 w', moves: ['a6b8', 'f9e8', 'b8a6', 'e8f9'], expected: chase('red') },
  { name: 'WXF diagram 59: crossed pawn can be chased', position: '3akabC1/9/4b4/7P1/2n6/8p/3p5/9/4A1c2/2BAK1B1C w', moves: ['g0i2', 'g1i1', 'i2g0', 'i1g1'], expected: chase('red') },
  { name: 'WXF diagram 60: uncrossed pawn exempt', position: '3akabC1/9/4b4/7P1/2n5p/9/3p5/9/4A1c2/2BAK1B1C w', moves: ['g0i2', 'g1i1', 'i2g0', 'i1g1'], expected: draw },
  { name: 'WXF diagram 69: pawn chasing cannon exempt', position: '4k1b1c/7P1/3a5/9/9/9/9/9/3K5/9 w', moves: ['h8i8', 'i9h9', 'i8h8', 'h9i9'], expected: draw },
  { name: 'WXF diagram 70: king/pawn attack excluded', position: '4kab2/4a4/4b1n2/4p2P1/2p5P/9/9/7C1/4A4/4K4 w', moves: ['h6g6', 'g7h9', 'g6h6', 'h9g7'], expected: draw },
  { name: 'WXF diagram 55: blocked horse reverse is no exchange', position: '5ab2/4k2P1/5an1b/p1p3p2/8p/2P4N1/6P1P/B8/5p2c/3KC4 w', moves: ['h4f5', 'g7i6', 'f5h4', 'i6g7'], expected: chase('red') },
] as const

for (const fact of facts) test(fact.name, () => {
  const states = play(fen(fact.position), fact.moves, 3)
  assert.deepEqual(result(states), fact.expected)
  const second = states[4]
  assert.deepEqual(getWxfRepetitionWarning(states.slice(0, 4), second.board, second.turn), fact.expected)
  assert.equal(result(states.slice(0, 5)), null, 'a warning must not finish the game')
  assert.deepEqual(result(states.slice(0, 9)), fact.expected.kind === 'repetition-draw' ? null : fact.expected)
})

test('ordinary repetition uses four occurrences, illegal check uses three, at each cycle phase', () => {
  const quiet = play(fen('3k5/9/9/9/9/9/9/9/9/5K3 w'), ['f0f1', 'd9d8', 'f1f0', 'd8d9'], 4)
  assert.equal(result(quiet.slice(0, 9)), null)
  assert.deepEqual(result(quiet.slice(0, 13)), draw)
  const checking = play(fen('3k5/9/9/9/9/9/4r4/9/9/4K4 w'), ['e0f0', 'e3f3', 'f0e0', 'f3e3'], 3)
  for (let phase = 0; phase < 4; phase++) {
    assert.deepEqual(result(checking.slice(0, 9 + phase)), { kind: 'perpetual-check', offender: 'black', winner: 'red' })
  }
})

test('mutual check is a draw from the third occurrence', () => {
  const states = play(fen('9/9/3k5/4c4/9/9/3p5/4C4/3R5/4K4 w'), ['e2d2', 'd3e3', 'd2e2', 'e3d3'], 2)
  assert.deepEqual(result(states), draw)
})

test('closing chase phase, regenerated IDs and truncated/invalid history do not change responsibility', () => {
  const fact = facts[0], states = play(fen(fact.position), fact.moves, 3)
  for (let phase = 0; phase < 4; phase++) assert.deepEqual(result(states.slice(0, 9 + phase)), chase('red'))
  const renamed = states.map((state, index) => ({ ...state, board: state.board.map(row => row.map(piece => piece ? { ...piece, id: `new-${index}-${piece.id}` } : null)) }))
  const before = structuredClone(renamed)
  assert.deepEqual(result(renamed), chase('red'))
  assert.deepEqual(renamed, before)
  assert.equal(result(states.slice(0, 8)), null)
  assert.equal(result([states[0], states[0], states[0], states[0]]), null, 'duplicated snapshots are not legal moves')
})

test('deadline cancellation reaches position scans and chase classification without input mutation', () => {
  const fact = facts[0], states = play(fen(fact.position), fact.moves, 3), current = states.at(-1)!
  const before = structuredClone(states)
  const cancel = new Error('test deadline')
  for (const limit of [200, 1600]) {
    let checks = 0
    assert.throws(() => getWxfRepetitionResult(states.slice(0, -1), current.board, current.turn, { check: () => { if (++checks === limit) throw cancel } }), error => error === cancel)
    assert.deepEqual(states, before)
    assert.equal(checks, limit)
  }
})

test('WXF diagram 81 warns about the same physical victim, but an actual quiet variation ends the warning', () => {
  const initial = fen('2b1ka1P1/4a4/b8/p5R2/8c/7R1/P1p3p2/3rBn3/N2C2n1C/3K1NB2 w')
  const steps = ['h4h5', 'i5i7', 'g6g7', 'i7i6', 'h5h6', 'i6i5', 'g7g5', 'i5i7', 'h6h7', 'i7i6', 'g5g6', 'i6i5', 'h7h5', 'i5i7']
  const states = play(initial, steps), prefix = states.slice(0, -1), beforeMove = states.at(-1)!
  const continuation = play(beforeMove, ['h5h7']).at(-1)!
  const variation = play(beforeMove, ['h5h4']).at(-1)!
  const history = [...prefix, beforeMove]
  assert.deepEqual(getWxfRepetitionWarning(history, continuation.board, continuation.turn), chase('red'))
  assert.equal(getWxfRepetitionResult(history, continuation.board, continuation.turn), null, 'an early warning is not a finished game')
  assert.equal(getWxfRepetitionWarning(history, variation.board, variation.turn), null, 'the changed rook move is no longer chasing that cannon')
})

test('a novel discovered check does not inherit a previous checking-cycle warning', () => {
  const board = fen('2b1kab2/3Pn4/3R5/p8/8p/3CR4/P1r1c3P/B3r4/9/4KA3 w')
  const states = play(board, ['f0e1', 'e2i2', 'e1f0', 'i2e2', 'f0e1'])
  const current = states.at(-1)!, chosen = play(current, ['e2d2']).at(-1)!
  assert.equal(getWxfRepetitionWarning(states, chosen.board, chosen.turn), null)
})

test('WXF 20.9: a crossed pawn and a rook alternating attacks on one cannon are permitted', () => {
  const initial = fen('3k5/9/2c6/3P5/5R3/3p5/9/9/9/3K5 w')
  const cycle = ['d6c6', 'c7e7', 'f5e5', 'e7d7', 'c6d6', 'd7f7', 'e5f5', 'f7c7']
  const states = play(initial, cycle, 3)
  assert.deepEqual(result(states), draw)
  const current = states.at(-1)!
  assert.deepEqual(getWxfRepetitionWarning(states.slice(0, -1), current.board, current.turn), draw)
})

test('WXF 20.8: simultaneously offering a rook exchange does not exempt chasing another unrooted cannon', () => {
  const initial = fen('3k5/9/9/1c7/9/2R5r/9/9/9/5K3 w')
  const cycle = ['c4b4', 'b6c6', 'b4c4', 'c6b6']
  const states = play(initial, cycle, 2)
  assert.deepEqual(result(states), chase('red'))
  const current = states.at(-1)!
  assert.deepEqual(getWxfRepetitionWarning(states.slice(0, -1), current.board, current.turn), chase('red'))
})
