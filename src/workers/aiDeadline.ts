export const AI_WATCHDOG_MS = 4_000
export const XIANGQI_WORKER_DEADLINE_MS = 3_500
const REPLY_MARGIN_MS = 100

/** Module loading and dispatch consume the same deadline as the search. */
export function xiangqiWorkerBudget(input: { budgetMs?: number; deadlineAt?: number }, now = Date.now()): number {
  const requested = Number.isFinite(input.budgetMs) ? input.budgetMs! : 3_000
  const searchBudget = Math.max(25, Math.min(3_200, requested))
  if (!Number.isFinite(input.deadlineAt)) return searchBudget
  return Math.max(25, Math.min(searchBudget, input.deadlineAt! - now - REPLY_MARGIN_MS))
}
