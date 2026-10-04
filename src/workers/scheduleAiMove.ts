import type { AiTasks } from './aiTypes'

/** 每次思考独立执行；重开、换模式或离开页面时取消定时器并终止计算。 */
export function scheduleAiMove<G extends keyof AiTasks>(game: G, input: AiTasks[G]['input'], apply: (move: AiTasks[G]['move'] | null) => void, delay = 320, onFailure?: () => void): () => void {
  let worker: Worker | null = null
  let cancelled = false
  const fail = () => {
    if (cancelled) return
    cancelled = true
    worker?.terminate()
    worker = null
    onFailure?.()
  }
  const timer = window.setTimeout(() => {
    if (cancelled) return
    try {
      worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<{ move: AiTasks[G]['move'] | null }>) => {
        worker?.terminate()
        worker = null
        if (!cancelled) {
          cancelled = true
          apply(event.data.move)
        }
      }
      worker.onerror = event => { event.preventDefault(); fail() }
      worker.onmessageerror = fail
      worker.postMessage({ game, input })
    } catch {
      fail()
    }
  }, delay)
  return () => {
    cancelled = true
    window.clearTimeout(timer)
    worker?.terminate()
    worker = null
  }
}
