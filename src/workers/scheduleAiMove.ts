import type { AiAnalysis, AiTasks } from './aiTypes'
import { AI_WATCHDOG_MS, XIANGQI_WORKER_DEADLINE_MS } from './aiDeadline'
import { parseAiReply } from './aiResponse'

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
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (cancelled) return
        let parsed: ReturnType<typeof parseAiReply<G>>
        try {
          parsed = parseAiReply(game, input, event.data)
        } catch (error) {
          fail({ kind: 'message_error', message: error instanceof Error ? error.message : String(error) })
          return
        }
        if (!parsed.ok) {
          fail({ kind: 'message_error', message: parsed.message })
          return
        }
        clearWatchdog()
        worker?.terminate()
        worker = null
        cancelled = true
        try {
          apply(parsed.reply.move, parsed.reply.analysis)
        } catch (error) {
          // The request has settled, so late messages remain ignored while the
          // game receives an explicit error instead of being left thinking.
          onFailure?.({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
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
