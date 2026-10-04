import test from 'node:test'
import assert from 'node:assert/strict'
import { scheduleAiMove } from '../src/workers/scheduleAiMove.ts'
import { emptyBoard } from '../src/games/gomoku/gomokuLogic.ts'

class WorkerStub {
  static instances: WorkerStub[] = []
  onmessage: ((event: { data: { move: [number, number] } }) => void) | null = null
  onerror: ((event: { preventDefault: () => void }) => void) | null = null
  onmessageerror: (() => void) | null = null
  terminated = false
  request: unknown
  constructor() { WorkerStub.instances.push(this) }
  postMessage(request: unknown) { this.request = request }
  terminate() { this.terminated = true }
}

function withWorkerEnvironment(run: (advance: () => void) => void) {
  const originalWindow = globalThis.window
  const originalWorker = globalThis.Worker
  let timer = () => {}
  WorkerStub.instances = []
  Object.assign(globalThis, {
    window: { setTimeout: (callback: () => void) => { timer = callback; return 1 }, clearTimeout: () => { timer = () => {} } },
    Worker: WorkerStub,
  })
  try { run(() => timer()) } finally {
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

test('a worker applies its result once and then terminates', () => {
  withWorkerEnvironment(advance => {
    const moves: [number, number][] = []
    scheduleAiMove('gomoku', { board: emptyBoard(), side: 2 }, move => { if (move) moves.push(move) })
    advance()
    const worker = WorkerStub.instances[0]
    worker.onmessage?.({ data: { move: [7, 7] } })
    worker.onmessage?.({ data: { move: [8, 8] } })
    assert.deepEqual(moves, [[7, 7]])
    assert.equal(worker.terminated, true)
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
