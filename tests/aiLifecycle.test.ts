import test from 'node:test'
import assert from 'node:assert/strict'
import { scheduleAiMove, type AiFailure } from '../src/workers/scheduleAiMove.ts'
import { AI_WATCHDOG_MS, XIANGQI_WORKER_DEADLINE_MS, xiangqiWorkerBudget } from '../src/workers/aiDeadline.ts'
import { emptyBoard } from '../src/games/gomoku/gomokuLogic.ts'
import { createInitialBoard } from '../src/games/xiangqi/xiangqiBoard.ts'
import type { Move as XiangqiMove } from '../src/games/xiangqi/xiangqiTypes.ts'
import type { XiangqiAnalysis } from '../src/games/xiangqi/xiangqiAi.ts'

class WorkerStub {
  static instances: WorkerStub[] = []
  static constructorError: Error | null = null
  static postMessageError: Error | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: { preventDefault: () => void; message?: string }) => void) | null = null
  onmessageerror: (() => void) | null = null
  terminated = false
  request: unknown
  constructor() {
    if (WorkerStub.constructorError) throw WorkerStub.constructorError
    WorkerStub.instances.push(this)
  }
  postMessage(request: unknown) {
    if (WorkerStub.postMessageError) throw WorkerStub.postMessageError
    this.request = request
  }
  terminate() { this.terminated = true }
}

function withWorkerEnvironment(run: (advance: () => void, pending: () => number, now: () => number) => void) {
  const originalWindow = globalThis.window
  const originalWorker = globalThis.Worker
  const originalNow = Date.now
  const timers = new Map<number, { callback: () => void; at: number }>()
  let now = 1_700_000_000_000
  let timerId = 0
  WorkerStub.instances = []
  WorkerStub.constructorError = null
  WorkerStub.postMessageError = null
  Date.now = () => now
  Object.assign(globalThis, {
    window: {
      setTimeout: (callback: () => void, delay: number) => { timers.set(++timerId, { callback, at: now + delay }); return timerId },
      clearTimeout: (id: number) => { timers.delete(id) },
    },
    Worker: WorkerStub,
  })
  try {
    run(() => {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0]
      if (next) { timers.delete(next[0]); now = next[1].at; next[1].callback() }
    }, () => timers.size, () => now)
  } finally {
    Date.now = originalNow
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
  withWorkerEnvironment((advance, pending, now) => {
    const input = { board: createInitialBoard(), side: 'black' as const, budgetMs: 3000, maxDepth: 8 }
    const move: XiangqiMove = { fromR: 0, fromC: 7, toR: 2, toC: 6 }
    const analysis: XiangqiAnalysis = { depth: 5, nodes: 2000, elapsedMs: 3000, targetDepth: 8, timedOut: true }
    const results: unknown[] = []
    scheduleAiMove('xiangqi', input, (reply, stats) => results.push({ move: reply, analysis: stats }))
    advance()
    const worker = WorkerStub.instances[0]
    assert.deepEqual(worker.request, { game: 'xiangqi', input: { ...input, deadlineAt: now() + XIANGQI_WORKER_DEADLINE_MS } })
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

test('xiangqi startup and dispatch share the search deadline without mutating the caller input', () => {
  withWorkerEnvironment((advance, pending, now) => {
    const input = Object.freeze({ board: createInitialBoard(), side: 'black' as const, budgetMs: 3000, maxDepth: 8, deadlineAt: 1 })
    const started = now()
    const failures: AiFailure[] = []
    scheduleAiMove('xiangqi', input, () => assert.fail('timeout became a move'), 140, failure => failures.push(failure))
    advance()
    const worker = WorkerStub.instances[0]
    const request = worker.request as { game: 'xiangqi'; input: typeof input }
    assert.notEqual(request.input, input)
    assert.equal(input.deadlineAt, 1)
    assert.equal(request.input.deadlineAt, started + 140 + XIANGQI_WORKER_DEADLINE_MS)
    assert.equal(xiangqiWorkerBudget(request.input, now()), 3000)
    assert.equal(xiangqiWorkerBudget(request.input, now() + 1500), 1900)
    advance()
    assert.deepEqual(failures, [{ kind: 'timeout' }])
    assert.equal(now() - started, 140 + AI_WATCHDOG_MS)
    assert.ok(now() - started < 5000)
    assert.equal(pending(), 0)
    assert.equal(worker.terminated, true)
    worker.onerror?.({ preventDefault() {}, message: 'late error' })
    worker.onmessageerror?.()
    worker.onmessage?.({ data: { move: { fromR: 0, fromC: 7, toR: 2, toC: 6 } } })
    assert.deepEqual(failures, [{ kind: 'timeout' }])
  })
})

test('worker errors expose their diagnostic message once and cancel the watchdog', () => {
  withWorkerEnvironment((advance, pending) => {
    const failures: AiFailure[] = []
    let prevented = false
    scheduleAiMove('gomoku', { board: emptyBoard(), side: 2 }, () => assert.fail('failed move applied'), 140, failure => failures.push(failure))
    advance()
    const worker = WorkerStub.instances[0]
    worker.onerror?.({ preventDefault() { prevented = true }, message: 'worker runtime failed' })
    worker.onmessageerror?.()
    advance()
    assert.deepEqual(failures, [{ kind: 'error', message: 'worker runtime failed' }])
    assert.equal(prevented, true)
    assert.equal(worker.terminated, true)
    assert.equal(pending(), 0)
  })
})

test('unreadable worker messages report a message failure once', () => {
  withWorkerEnvironment((advance, pending) => {
    const failures: AiFailure[] = []
    scheduleAiMove('gomoku', { board: emptyBoard(), side: 2 }, () => assert.fail('failed move applied'), 140, failure => failures.push(failure))
    advance()
    const worker = WorkerStub.instances[0]
    worker.onmessageerror?.()
    worker.onmessageerror?.()
    assert.deepEqual(failures, [{ kind: 'message_error' }])
    assert.equal(worker.terminated, true)
    assert.equal(pending(), 0)
  })
})

test('worker construction failures expose a start failure without leaving timers', () => {
  withWorkerEnvironment((advance, pending) => {
    WorkerStub.constructorError = new Error('module worker unavailable')
    const failures: AiFailure[] = []
    scheduleAiMove('gomoku', { board: emptyBoard(), side: 2 }, () => assert.fail('failed move applied'), 140, failure => failures.push(failure))
    advance()
    assert.deepEqual(failures, [{ kind: 'start_error', message: 'module worker unavailable' }])
    assert.equal(WorkerStub.instances.length, 0)
    assert.equal(pending(), 0)
  })
})

test('worker dispatch failures terminate the worker and clear the watchdog', () => {
  withWorkerEnvironment((advance, pending) => {
    WorkerStub.postMessageError = new Error('input cannot be cloned')
    const failures: AiFailure[] = []
    scheduleAiMove('gomoku', { board: emptyBoard(), side: 2 }, () => assert.fail('failed move applied'), 140, failure => failures.push(failure))
    advance()
    assert.deepEqual(failures, [{ kind: 'start_error', message: 'input cannot be cloned' }])
    assert.equal(WorkerStub.instances[0].terminated, true)
    assert.equal(pending(), 0)
    advance()
    assert.equal(failures.length, 1)
  })
})

test('non-xiangqi tasks keep their original input and timing contract', () => {
  withWorkerEnvironment(advance => {
    const input = Object.freeze({ board: emptyBoard(), side: 2 as const, budgetMs: 650 })
    scheduleAiMove('gomoku', input, () => {})
    advance()
    assert.deepEqual(WorkerStub.instances[0].request, { game: 'gomoku', input })
    assert.equal((WorkerStub.instances[0].request as { input: unknown }).input, input)
  })
})

test('malformed replies settle as recoverable failures instead of disabling the watchdog silently', () => {
  for (const data of [null, undefined, {}, { analysis: {} }, { move: undefined }]) {
    withWorkerEnvironment((advance, pending) => {
      const failures: AiFailure[] = []
      scheduleAiMove('gomoku', { board: emptyBoard(), side: 2 }, () => assert.fail('malformed reply applied'), 140, failure => failures.push(failure))
      advance()
      const worker = WorkerStub.instances[0]
      assert.doesNotThrow(() => worker.onmessage?.({ data }))
      assert.equal(failures.length, 1)
      assert.equal(failures[0].kind, 'message_error')
      assert.equal(worker.terminated, true)
      assert.equal(pending(), 0)
      worker.onmessage?.({ data: { move: [7, 7] } })
      worker.onerror?.({ preventDefault() {} })
      advance()
      assert.equal(failures.length, 1)
    })
  }
})

test('a throwing move callback reports a recoverable error once and leaves no thinking worker', () => {
  withWorkerEnvironment((advance, pending) => {
    const failures: AiFailure[] = []
    scheduleAiMove('gomoku', { board: emptyBoard(), side: 2 }, () => { throw new Error('move application failed') }, 140, failure => failures.push(failure))
    advance()
    const worker = WorkerStub.instances[0]
    assert.doesNotThrow(() => worker.onmessage?.({ data: { move: [7, 7] } }))
    assert.deepEqual(failures, [{ kind: 'error', message: 'move application failed' }])
    assert.equal(worker.terminated, true)
    assert.equal(pending(), 0)
    worker.onmessage?.({ data: { move: [8, 8] } })
    worker.onmessageerror?.()
    assert.equal(failures.length, 1)
  })
})

test('an invalid xiangqi reply can be retried with the same position and full history', () => {
  withWorkerEnvironment((advance, pending) => {
    const board = createInitialBoard()
    const history = [{ board: createInitialBoard(), turn: 'red' as const }]
    const input = { board, side: 'black' as const, history, budgetMs: 3000, maxDepth: 8 }
    const before = structuredClone(input)
    const failures: AiFailure[] = []
    const replies: unknown[] = []
    scheduleAiMove('xiangqi', input, move => replies.push(move), 140, failure => failures.push(failure))
    advance()
    WorkerStub.instances[0].onmessage?.({ data: { move: null } })
    assert.equal(failures[0].kind, 'message_error')
    assert.deepEqual(replies, [])
    scheduleAiMove('xiangqi', input, move => replies.push(move), 140, failure => failures.push(failure))
    advance()
    const move = { fromR: 0, fromC: 7, toR: 2, toC: 6 }
    WorkerStub.instances[1].onmessage?.({ data: { move } })
    WorkerStub.instances[0].onmessage?.({ data: { move } })
    assert.deepEqual(replies, [move])
    assert.equal(failures.length, 1)
    assert.deepEqual(input, before)
    assert.equal(pending(), 0)
  })
})

test('StrictMode setup-cleanup-setup runs one worker and applies only its current reply', () => {
  withWorkerEnvironment((advance, pending) => {
    const input = { board: createInitialBoard(), side: 'black' as const, budgetMs: 700, maxDepth: 4 }
    const replies: unknown[] = []
    const discarded = scheduleAiMove('xiangqi', input, () => assert.fail('discarded StrictMode setup applied'), 140)
    discarded()
    const current = scheduleAiMove('xiangqi', input, move => replies.push(move), 140)
    advance()
    assert.equal(WorkerStub.instances.length, 1)
    const move = { fromR: 0, fromC: 7, toR: 2, toC: 6 }
    WorkerStub.instances[0].onmessage?.({ data: { move } })
    current()
    WorkerStub.instances[0].onmessage?.({ data: { move } })
    assert.deepEqual(replies, [move])
    assert.equal(pending(), 0)
  })
})

test('changing xiangqi depth cancels a running worker without accepting its late result', () => {
  withWorkerEnvironment((advance, pending) => {
    const input = { board: createInitialBoard(), side: 'black' as const, budgetMs: 3000, maxDepth: 8 }
    const replies: unknown[] = []
    const previous = scheduleAiMove('xiangqi', input, () => assert.fail('old depth result applied'), 140)
    advance()
    previous()
    scheduleAiMove('xiangqi', { ...input, budgetMs: 700, maxDepth: 4 }, move => replies.push(move), 140)
    advance()
    const move = { fromR: 0, fromC: 7, toR: 2, toC: 6 }
    WorkerStub.instances[0].onmessage?.({ data: { move } })
    WorkerStub.instances[0].onerror?.({ preventDefault() {} })
    WorkerStub.instances[1].onmessage?.({ data: { move } })
    assert.equal(WorkerStub.instances[0].terminated, true)
    assert.deepEqual(replies, [move])
    assert.equal(pending(), 0)
  })
})
