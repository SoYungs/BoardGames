import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMove, createInitialBoard, snapshotBoard } from '../src/games/xiangqi/xiangqiBoard.ts'
import {
  clearXiangqiSession,
  loadXiangqiSession,
  parseXiangqiSession,
  saveXiangqiSession,
  serializeXiangqiSession,
  xiangqiSessionKey,
  type XiangqiSessionState,
  type XiangqiSessionStorage,
  type XiangqiSnap,
} from '../src/games/xiangqi/xiangqiSession.ts'
import type { Board, Move, PieceType } from '../src/games/xiangqi/xiangqiTypes.ts'

function memoryStorage(): XiangqiSessionStorage {
  const entries = new Map<string, string>()
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value) },
    removeItem: key => { entries.delete(key) },
  }
}

function initial(): XiangqiSessionState {
  return { board: createInitialBoard(), turn: 'red', lastMove: null, winner: null, selected: null, repetitionResult: null, history: [], depth: 8 }
}

function play(state: XiangqiSessionState, move: Move): XiangqiSessionState {
  const snapshot: XiangqiSnap = { board: snapshotBoard(state.board), turn: state.turn, lastMove: state.lastMove, winner: state.winner, selected: [move.fromR, move.fromC], repetitionResult: state.repetitionResult }
  return { ...state, board: applyMove(state.board, move.fromR, move.fromC, move.toR, move.toC), turn: state.turn === 'red' ? 'black' : 'red', selected: null, lastMove: move, history: [...state.history, snapshot] }
}

function pendingReply(): XiangqiSessionState {
  let state = play(initial(), { fromR: 6, fromC: 0, toR: 5, toC: 0 })
  state = play(state, { fromR: 3, fromC: 0, toR: 4, toC: 0 })
  return play(state, { fromR: 5, fromC: 0, toR: 4, toC: 0 })
}

function position(rows: string[]): Board {
  return rows.map((row, r) => [...row].map((letter, c) => letter === '.' ? null : { id: `piece-${r}-${c}`, side: letter === letter.toUpperCase() ? 'red' : 'black', type: letter.toLowerCase() as PieceType }))
}

const horseCycle: Move[] = [
  { fromR: 9, fromC: 1, toR: 7, toC: 2 }, { fromR: 0, fromC: 1, toR: 2, toC: 2 },
  { fromR: 7, fromC: 2, toR: 9, toC: 1 }, { fromR: 2, fromC: 2, toR: 0, toC: 1 },
]

test('Xiangqi saves a pending computer turn, captures, last move and all undo snapshots without modifying play', () => {
  const state = pendingReply()
  const original = structuredClone(state)
  const storage = memoryStorage()
  assert.deepEqual(saveXiangqiSession('ai', state, storage), { ok: true })
  const restored = loadXiangqiSession('ai', storage)
  assert.equal(restored.kind, 'restored')
  assert.deepEqual(restored.state, original)
  assert.deepEqual(state, original)
  assert.equal(restored.state!.turn, 'black')
  assert.equal(restored.state!.board[4][0]?.side, 'red')
  assert.equal(restored.state!.history[2].board[4][0]?.side, 'black')
  restored.state!.history[0].board[9][0]!.id = 'changed-copy'
  assert.deepEqual(state, original)
  assert.deepEqual(loadXiangqiSession('ai', storage).state, original)
})

test('Xiangqi storage and exported JSON retain an unlimited complete history and each supported depth', () => {
  let state = initial()
  for (let index = 0; index < 180; index++) state = play(state, horseCycle[index % 4])
  state.repetitionResult = { kind: 'repetition-draw' }
  for (const depth of [4, 6, 8] as const) {
    state.depth = depth
    const raw = serializeXiangqiSession('ai', state)
    const restored = parseXiangqiSession(raw, 'ai')
    assert.ok(restored)
    assert.equal(restored.history.length, 180)
    assert.deepEqual(restored.history, state.history)
    assert.deepEqual(restored, state)
  }
})

test('Xiangqi saves are isolated by mode and browser tab', () => {
  const tabOne = memoryStorage()
  const tabTwo = memoryStorage()
  const aiState = pendingReply()
  const localState = { ...initial(), depth: 4 as const, selected: [9, 0] as [number, number] }
  saveXiangqiSession('ai', aiState, tabOne)
  saveXiangqiSession('local', localState, tabOne)
  assert.deepEqual(loadXiangqiSession('ai', tabOne).state, aiState)
  assert.deepEqual(loadXiangqiSession('local', tabOne).state, localState)
  assert.equal(loadXiangqiSession('ai', tabTwo).kind, 'empty')
  assert.equal(parseXiangqiSession(serializeXiangqiSession('ai', aiState), 'local'), null)
})

test('Xiangqi restart removes only the chosen game and replaces its full history with the new initial position', () => {
  const storage = memoryStorage()
  saveXiangqiSession('ai', pendingReply(), storage)
  saveXiangqiSession('local', pendingReply(), storage)
  assert.equal(clearXiangqiSession('ai', storage), true)
  assert.equal(loadXiangqiSession('ai', storage).kind, 'empty')
  assert.equal(loadXiangqiSession('local', storage).kind, 'restored')
  saveXiangqiSession('ai', initial(), storage)
  assert.deepEqual(loadXiangqiSession('ai', storage).state, initial())
})

test('Xiangqi preserves legacy captured-king endings and normalizes the losing side to move', () => {
  const captured = initial()
  captured.board[0][4] = null
  captured.winner = 'red'
  assert.deepEqual(parseXiangqiSession(serializeXiangqiSession('ai', captured), 'ai'), { ...captured, turn: 'black' })
})

test('Xiangqi recomputes cached winner and repetition labels rather than locking a playable board', () => {
  const mate = { ...initial(), winner: 'black' as const }
  assert.deepEqual(parseXiangqiSession(serializeXiangqiSession('ai', mate), 'ai'), initial())
  const draw = { ...initial(), repetitionResult: { kind: 'repetition-draw' as const } }
  assert.deepEqual(parseXiangqiSession(serializeXiangqiSession('ai', draw), 'ai'), initial())
  const perpetual = { ...initial(), winner: 'red' as const, repetitionResult: { kind: 'perpetual-check' as const, winner: 'red' as const, offender: 'black' as const } }
  assert.deepEqual(parseXiangqiSession(serializeXiangqiSession('ai', perpetual), 'ai'), initial())
})

test('Xiangqi migrates an obsolete ordinary threefold draw and retains the complete undo history', () => {
  let state = initial()
  for (let index = 0; index < 8; index++) state = play(state, horseCycle[index % 4])
  state.repetitionResult = { kind: 'repetition-draw' }
  const restored = parseXiangqiSession(serializeXiangqiSession('ai', state), 'ai')
  assert.ok(restored)
  assert.equal(restored.repetitionResult, null)
  assert.equal(restored.winner, null)
  assert.deepEqual(restored.history, state.history)
  for (const step of horseCycle) state = play(state, step)
  assert.deepEqual(parseXiangqiSession(serializeXiangqiSession('ai', state), 'ai')?.repetitionResult, { kind: 'repetition-draw' })
})

test('Xiangqi verifies a mate from the board and preserves both kings and the last move on reload', () => {
  const start = { ...initial(), board: position(['....k....', '...R.R...', '....P....', '.........', '.........', '.........', '.........', '.........', '.........', '....K....']) }
  const state = play(start, { fromR: 2, fromC: 4, toR: 1, toC: 4 })
  state.turn = 'red' // Previous UI left the final turn on the winning mover.
  state.winner = 'red'
  const restored = parseXiangqiSession(serializeXiangqiSession('ai', state), 'ai')
  assert.ok(restored)
  assert.equal(restored.turn, 'black')
  assert.equal(restored.winner, 'red')
  assert.equal(restored.board[0][4]?.type, 'k')
  assert.deepEqual(restored.lastMove, state.lastMove)
  assert.deepEqual(restored.history, state.history)
})

test('Xiangqi rejects illegal imported transitions and false last-move records without altering the ongoing game', () => {
  const state = pendingReply(), original = structuredClone(state)
  for (const mutate of [
    (saved: XiangqiSessionState) => { saved.board[4][0]!.id = 'phantom' },
    (saved: XiangqiSessionState) => { saved.board[4][1] = saved.board[4][0]; saved.board[4][0] = null },
    (saved: XiangqiSessionState) => { saved.turn = 'red' },
    (saved: XiangqiSessionState) => { saved.lastMove!.toC = 1 },
    (saved: XiangqiSessionState) => { saved.history[1].lastMove = null },
  ]) {
    const edited = structuredClone(state)
    mutate(edited)
    assert.equal(parseXiangqiSession(serializeXiangqiSession('ai', edited), 'ai'), null)
  }
  assert.deepEqual(state, original)
})

test('Xiangqi unfinished saves require both kings, and a winner must retain its own king', () => {
  for (const winner of [null, 'black'] as const) {
    const state = initial()
    state.board[0][4] = null
    state.winner = winner
    assert.equal(parseXiangqiSession(serializeXiangqiSession('ai', state), 'ai'), null)
  }
  const noKings = initial()
  noKings.board[0][4] = null
  noKings.board[9][4] = null
  noKings.winner = 'red'
  assert.equal(parseXiangqiSession(serializeXiangqiSession('ai', noKings), 'ai'), null)
})

test('Xiangqi validates board size, piece identifiers, type, side and counts before restoring', () => {
  const malformed = [
    (state: XiangqiSessionState) => { state.board.pop() },
    (state: XiangqiSessionState) => { state.board[4].pop() },
    (state: XiangqiSessionState) => { state.board[0][0]!.id = '' },
    (state: XiangqiSessionState) => { state.board[0][0]!.id = state.board[0][1]!.id },
    (state: XiangqiSessionState) => { Object.assign(state.board[0][0]!, { side: 'blue' }) },
    (state: XiangqiSessionState) => { Object.assign(state.board[0][0]!, { type: 'constructor' }) },
    (state: XiangqiSessionState) => { state.board[4][0] = { id: 'extra-cannon', side: 'red', type: 'c' } },
    (state: XiangqiSessionState) => { state.board[4][0] = { id: 'extra-king', side: 'red', type: 'k' } },
  ]
  for (const mutate of malformed) {
    const state = initial()
    mutate(state)
    assert.equal(parseXiangqiSession(serializeXiangqiSession('ai', state), 'ai'), null)
  }
})

test('Xiangqi rejects invalid turn, move coordinates, selection, depth and corrupted history', () => {
  const value = JSON.parse(serializeXiangqiSession('ai', pendingReply()))
  const mutations = [
    (saved: typeof value) => { saved.turn = 'blue' },
    (saved: typeof value) => { saved.depth = 5 },
    (saved: typeof value) => { saved.lastMove.toR = 10 },
    (saved: typeof value) => { saved.lastMove.fromC = 0.5 },
    (saved: typeof value) => { saved.lastMove = { fromR: 0, fromC: 0, toR: 0, toC: 0 } },
    (saved: typeof value) => { saved.selected = [9, 0] }, // red piece on a black turn
    (saved: typeof value) => { saved.selected = [1, 9] },
    (saved: typeof value) => { saved.history[0].board = [] },
    (saved: typeof value) => { saved.history[0].turn = 'blue' },
    (saved: typeof value) => { saved.history = {} },
    (saved: typeof value) => { saved.version = 2 },
  ]
  for (const mutate of mutations) {
    const saved = structuredClone(value)
    mutate(saved)
    assert.equal(parseXiangqiSession(JSON.stringify(saved), 'ai'), null)
  }
})

test('Xiangqi validates repetition results and accepts a pre-repetition version-1 save', () => {
  const legacy = JSON.parse(serializeXiangqiSession('ai', pendingReply()))
  delete legacy.repetitionResult
  for (const snapshot of legacy.history) delete snapshot.repetitionResult
  assert.deepEqual(parseXiangqiSession(JSON.stringify(legacy), 'ai'), pendingReply())
  for (const repetitionResult of [
    { kind: 'unknown' },
    { kind: 'perpetual-check', winner: 'red', offender: 'red' },
    { kind: 'perpetual-check', winner: 'red', offender: 'black' }, // mismatched null winner
  ]) {
    assert.equal(parseXiangqiSession(JSON.stringify({ ...legacy, repetitionResult }), 'ai'), null)
  }
  assert.equal(parseXiangqiSession(serializeXiangqiSession('ai', { ...initial(), winner: 'red', repetitionResult: { kind: 'repetition-draw' } }), 'ai'), null)
})

test('Xiangqi malformed JSON and unavailable storage never throw or change a live position', () => {
  const state = pendingReply()
  const original = structuredClone(state)
  const storage = memoryStorage()
  storage.setItem(xiangqiSessionKey('ai'), '{bad JSON')
  assert.deepEqual(loadXiangqiSession('ai', storage), { kind: 'invalid', state: null })
  for (const raw of ['', 'null', '[]', '{}', '{bad JSON']) assert.equal(parseXiangqiSession(raw, 'ai'), null)
  assert.deepEqual(loadXiangqiSession('ai', null), { kind: 'unavailable', state: null })
  assert.deepEqual(saveXiangqiSession('ai', state, null), { ok: false, reason: 'unavailable' })
  assert.equal(clearXiangqiSession('ai', null), false)
  const denied: XiangqiSessionStorage = {
    getItem() { throw new DOMException('Denied', 'SecurityError') },
    setItem() { throw new DOMException('Denied', 'SecurityError') },
    removeItem() { throw new DOMException('Denied', 'SecurityError') },
  }
  assert.equal(loadXiangqiSession('ai', denied).kind, 'unavailable')
  assert.deepEqual(saveXiangqiSession('ai', state, denied), { ok: false, reason: 'unavailable' })
  assert.equal(clearXiangqiSession('ai', denied), false)
  assert.deepEqual(state, original)
})

test('Xiangqi quota failures preserve the prior save and report that the complete new game was not saved', () => {
  const storage = memoryStorage()
  saveXiangqiSession('ai', initial(), storage)
  const full: XiangqiSessionStorage = { ...storage, setItem() { throw new DOMException('Full', 'QuotaExceededError') } }
  assert.deepEqual(saveXiangqiSession('ai', pendingReply(), full), { ok: false, reason: 'quota' })
  assert.deepEqual(loadXiangqiSession('ai', storage).state, initial())
})
