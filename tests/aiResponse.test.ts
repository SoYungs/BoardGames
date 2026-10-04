import test from 'node:test'
import assert from 'node:assert/strict'
import { createInitialBoard } from '../src/games/xiangqi/xiangqiBoard.ts'
import { parseAiReply } from '../src/workers/aiResponse.ts'
import type { Board } from '../src/games/xiangqi/xiangqiTypes.ts'

const playable = () => ({ board: createInitialBoard(), side: 'black' as const })
const move = { fromR: 0, fromC: 7, toR: 2, toC: 6 }
const analysis = { depth: 4, nodes: 1000, elapsedMs: 700, targetDepth: 8, timedOut: true }

test('xiangqi accepts legal replies and never modifies the requested board', () => {
  const input = playable(), before = structuredClone(input)
  assert.deepEqual(parseAiReply('xiangqi', input, { move, analysis }), { ok: true, reply: { move, analysis } })
  assert.deepEqual(parseAiReply('xiangqi', input, { move }), { ok: true, reply: { move } })
  assert.deepEqual(input, before)
})

test('xiangqi rejects no-move replies while a legal move is available', () => {
  assert.equal(parseAiReply('xiangqi', playable(), { move: null }).ok, false)
})

test('xiangqi accepts a no-move result when the general has been lost', () => {
  const input = playable()
  input.board[0][4] = null
  assert.deepEqual(parseAiReply('xiangqi', input, { move: null }), { ok: true, reply: { move: null } })
})

test('xiangqi accepts a no-move result for a genuine palace checkmate', () => {
  const board: Board = Array.from({ length: 10 }, () => Array(9).fill(null))
  board[0][4] = { id: 'bk', side: 'black', type: 'k' }
  board[9][4] = { id: 'rk', side: 'red', type: 'k' }
  board[1][3] = { id: 'rr0', side: 'red', type: 'r' }
  board[1][5] = { id: 'rr1', side: 'red', type: 'r' }
  board[1][4] = { id: 'rp', side: 'red', type: 'p' }
  assert.deepEqual(parseAiReply('xiangqi', { board, side: 'black' }, { move: null }), { ok: true, reply: { move: null } })
})

test('xiangqi rejects corrupt coordinates, enemy moves and moves through occupied pieces', () => {
  const illegal = [
    undefined, 12, {},
    { ...move, toR: 10 },
    { ...move, fromC: -1 },
    { ...move, toC: 0.5 },
    { fromR: 9, fromC: 7, toR: 7, toC: 6 },
    { fromR: 0, fromC: 0, toR: 4, toC: 0 },
    { fromR: 0, fromC: 7, toR: 1, toC: 7 },
  ]
  for (const candidate of illegal) assert.equal(parseAiReply('xiangqi', playable(), { move: candidate }).ok, false)
})

test('xiangqi rejects corrupt analysis before React is handed render-breaking values', () => {
  for (const candidate of [
    null, {}, { ...analysis, depth: {} }, { ...analysis, nodes: -1 },
    { ...analysis, elapsedMs: Infinity }, { ...analysis, targetDepth: 0 },
    { ...analysis, targetDepth: 13 }, { ...analysis, timedOut: 'yes' },
  ]) assert.equal(parseAiReply('xiangqi', playable(), { move, analysis: candidate }).ok, false)
})
