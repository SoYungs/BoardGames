import assert from 'node:assert/strict'
import test from 'node:test'
import { getXiangqiContinueIndex } from '../src/games/xiangqi/xiangqiPractice.ts'

test('continuing after a human reply completes black perpetual check returns before the computer repeated', () => {
  const history = Array.from({ length: 15 }, (_, index) => ({ turn: index % 2 ? 'black' as const : 'red' as const }))
  assert.equal(getXiangqiContinueIndex(history, 'ai', 'black', { kind: 'perpetual-check', offender: 'black', winner: 'red' }), 13)
  assert.equal(history.length, 15, 'choosing a continuation must not mutate the backup history')
})

test('ordinary undo remains one human decision and local continuation remains one move', () => {
  const history = [{ turn: 'red' as const }, { turn: 'black' as const }, { turn: 'red' as const }]
  assert.equal(getXiangqiContinueIndex(history, 'ai', 'black', null), 2)
  assert.equal(getXiangqiContinueIndex(history, 'ai', 'red', { kind: 'perpetual-check', offender: 'black', winner: 'red' }), 2)
  assert.equal(getXiangqiContinueIndex(history, 'ai', 'black', { kind: 'perpetual-check', offender: 'red', winner: 'black' }), 2)
  assert.equal(getXiangqiContinueIndex(history, 'local', 'black', { kind: 'perpetual-check', offender: 'black', winner: 'red' }), 2)
  assert.equal(getXiangqiContinueIndex([], 'ai', 'black', { kind: 'perpetual-check', offender: 'black', winner: 'red' }), -1)
  assert.equal(getXiangqiContinueIndex([{ turn: 'red' }], 'ai', 'black', { kind: 'perpetual-check', offender: 'black', winner: 'red' }), 0)
})
