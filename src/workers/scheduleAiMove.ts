import type { AiAnalysis, AiTasks } from './aiTypes'
import { AI_WATCHDOG_MS, XIANGQI_WORKER_DEADLINE_MS } from './aiDeadline'

export type AiFailure = { kind: 'timeout' | 'error' | 'message_error' | 'start_error'; message?: string }

/** 每次思考独立执行；悔棋、重开、换模式或离开页面时取消定时器并终止计算。 */
export function scheduleAiMove<G extends keyof AiTasks>(game: G, input: AiTasks[G]['input'], apply: (move: AiTasks[G]['move'] | null, analysis?: AiAnalysis<G>) => void, delay = 320, onFailure?: (failure: AiFailure) => void): () => void {
  let worker: Worker | null = null
  let cancelled = false
  let watchdog: number | undefined
  const clearWatchdog = () => {
    if (watchdog !== undefined) window.clearTimeout(watchdog)
    watchdog = undefined
  }
  const fail = (failure: AiFailure) => {
    if (cancelled) return
    cancelled = true
    clearWatchdog()
    worker?.terminate()
    worker = null
    onFailure?.(failure)
  }
  const timer = window.setTimeout(() => {
    if (cancelled) return
    try {
      // Set this before construction: fetching the module must not receive an
      // extra, unbounded allowance before its three-second search begins.
      const workerInput = game === 'xiangqi' ? { ...input, deadlineAt: Date.now() + XIANGQI_WORKER_DEADLINE_MS } : input
      watchdog = window.setTimeout(() => fail({ kind: 'timeout' }), AI_WATCHDOG_MS)
      worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<{ move: AiTasks[G]['move'] | null; analysis?: AiAnalysis<G> }>) => {
        clearWatchdog()
        worker?.terminate()
        worker = null
        if (!cancelled) {
          cancelled = true
          apply(event.data.move, event.data.analysis)
        }
      }
      worker.onerror = event => { event.preventDefault(); fail({ kind: 'error', message: event.message || undefined }) }
      worker.onmessageerror = () => fail({ kind: 'message_error' })
      worker.postMessage({ game, input: workerInput })
    } catch (error) {
      fail({ kind: 'start_error', message: error instanceof Error ? error.message : String(error) })
    }
  }, delay)
  return () => {
    cancelled = true
    window.clearTimeout(timer)
    clearWatchdog()
    worker?.terminate()
    worker = null
  }
}
