import test from 'node:test'
import assert from 'node:assert/strict'
import { scheduleAiMove } from '../src/workers/scheduleAiMove.ts'
import { emptyBoard } from '../src/games/gomoku/gomokuLogic.ts'
import { createInitialBoard } from '../src/games/xiangqi/xiangqiBoard.ts'
import type { Move as XiangqiMove } from '../src/games/xiangqi/xiangqiTypes.ts'
import type { XiangqiAnalysis } from '../src/games/xiangqi/xiangqiAi.ts'

class WorkerStub {
  static instances: WorkerStub[] = []
  onmessage: ((event: { data: { move: [number, number] | XiangqiMove; analysis?: XiangqiAnalysis } }) => void) | null = null
  onerror: ((event: { preventDefault: () => void }) => void) | null = null
  onmessageerror: (() => void) | null = null
  terminated = false
  request: unknown
  constructor() { WorkerStub.instances.push(this) }
  postMessage(request: unknown) { this.request = request }
  terminate() { this.terminated = true }
}

function withWorkerEnvironment(run: (advance: () => void, pending: () => number) => void) {
  const originalWindow = globalThis.window
  const originalWorker = globalThis.Worker
  const timers = new Map<number, { callback: () => void; delay: number }>()
  let timerId = 0
  WorkerStub.instances = []
  Object.assign(globalThis, {
    window: {
      setTimeout: (callback: () => void, delay: number) => { timers.set(++timerId, { callback, delay }); return timerId },
      clearTimeout: (id: number) => { timers.delete(id) },
    },
    Worker: WorkerStub,
  })
  try {
    run(() => {
      const next = [...timers.entries()].sort((a, b) => a[1].delay - b[1].delay)[0]
      if (next) { timers.delete(next[0]); next[1].callback() }
    }, () => timers.size)
  } finally {
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, 'window')
    else globalThis.window = originalWindow
    if (originalWorker === undefined) Reflect.deleteProperty(globalThis, 'Worker')
    else globalThis.Worker = originalWorker
  }
}

test('reset before thinking begins cancels the timer and creates no worker', () => {
  withWorkerEnvironment(advance => {
    const cancel = scheduleAiMove('gomoku', { board: emptyBoard(), side: 2 }, () => assert.fail('cancelled move applied'))
    cancel()
    advance()
    assert.equal(WorkerStub.instances.length, 0)
  })
})

test('reset during thinking terminates the worker and ignores a late reply', () => {
  withWorkerEnvironment(advance => {
    const cancel = scheduleAiMove('gomoku', { board: emptyBoard(), side: 2 }, () => assert.fail('stale move applied'))
    advance()
    const worker = WorkerStub.instances[0]
    cancel()
    worker.onmessage?.({ data: { move: [7, 7] } })
    assert.equal(worker.terminated, true)
  })
})

test('a worker applies its result once and clears its watchdog', () => {
  withWorkerEnvironment((advance, pending) => {
    const moves: [number, number][] = []
    scheduleAiMove('gomoku', { board: emptyBoard(), side: 2 }, move => { if (move) moves.push(move) })
    advance()
    const worker = WorkerStub.instances[0]
    worker.onmessage?.({ data: { move: [7, 7] } })
    worker.onmessage?.({ data: { move: [8, 8] } })
    assert.deepEqual(moves, [[7, 7]])
    assert.equal(worker.terminated, true)
    assert.equal(pending(), 0)
  })
})

test('an unresponsive worker times out once without becoming a game result', () => {
  withWorkerEnvironment((advance, pending) => {
    let failures = 0
    scheduleAiMove('gomoku', { board: emptyBoard(), side: 2 }, () => assert.fail('timeout became a move'), 140, () => { failures++ })
    advance()
    const worker = WorkerStub.instances[0]
    assert.equal(pending(), 1)
    advance()
    assert.equal(failures, 1)
    assert.equal(worker.terminated, true)
    assert.equal(pending(), 0)
    worker.onmessage?.({ data: { move: [7, 7] } })
    worker.onerror?.({ preventDefault: () => {} })
    assert.equal(failures, 1)
  })
})

test('reset while a worker is running also cancels its watchdog', () => {
  withWorkerEnvironment((advance, pending) => {
    const cancel = scheduleAiMove('gomoku', { board: emptyBoard(), side: 2 }, () => assert.fail('cancelled result applied'), 140, () => assert.fail('cancelled failure reported'))
    advance()
    assert.equal(pending(), 1)
    cancel()
    assert.equal(pending(), 0)
    advance()
  })
})

test('a worker failure reports an error without awarding a game result', () => {
  withWorkerEnvironment(advance => {
    let failed = false
    scheduleAiMove('gomoku', { board: emptyBoard(), side: 2 }, () => assert.fail('failure became a move'), 320, () => { failed = true })
    advance()
    const worker = WorkerStub.instances[0]
    worker.onerror?.({ preventDefault: () => {} })
    worker.onmessage?.({ data: { move: [7, 7] } })
    assert.equal(failed, true)
    assert.equal(worker.terminated, true)
  })
})

test('xiangqi forwards the requested depth and completed analysis once, and cancelling discards both', () => {
  withWorkerEnvironment((advance, pending) => {
    const input = { board: createInitialBoard(), side: 'black' as const, budgetMs: 3000, maxDepth: 8 }
    const move: XiangqiMove = { fromR: 0, fromC: 7, toR: 2, toC: 6 }
    const analysis: XiangqiAnalysis = { depth: 5, nodes: 2000, elapsedMs: 3000, targetDepth: 8, timedOut: true }
    const results: unknown[] = []
    scheduleAiMove('xiangqi', input, (reply, stats) => results.push({ move: reply, analysis: stats }))
    advance()
    const worker = WorkerStub.instances[0]
    assert.deepEqual(worker.request, { game: 'xiangqi', input })
    worker.onmessage?.({ data: { move, analysis } })
    worker.onmessage?.({ data: { move, analysis } })
    assert.deepEqual(results, [{ move, analysis }])
    assert.equal(pending(), 0)
    const cancel = scheduleAiMove('xiangqi', input, () => assert.fail('cancelled analysis reached the game'))
    advance()
    cancel()
    WorkerStub.instances[1].onmessage?.({ data: { move, analysis } })
    assert.equal(pending(), 0)
  })
})
