export const AI_BUDGET_MS = 800
export const MATE_SCORE = 1_000_000
const TIMEOUT = Symbol('AI search deadline')

export function boundedAiBudget(requested: number, minimum = 0): number {
  return Math.min(900, Math.max(minimum, Number.isNaN(requested) ? minimum : requested))
}

export type SearchAdapter<P, M, S> = {
  moves: (position: P, side: S, check: () => void) => Iterable<M>
  apply: (position: P, move: M, side: S) => P
  other: (side: S) => S
  evaluate: (position: P, side: S) => number
  order: (position: P, move: M, side: S) => number
  tactical: (position: P, move: M) => boolean
  inCheck: (position: P, side: S) => boolean
  terminal: (position: P, side: S, ply: number) => number
  fallback?: (position: P, move: M, side: S, check: () => void) => number
  key?: (position: P, side: S) => string
  moveKey?: (move: M) => string
}

type Entry<M> = { depth: number; score: number; bound: 'exact' | 'lower' | 'upper'; best: M | null }

/** Complete shallow rounds first, then deepen without losing the last legal result. */
export function searchBestMove<P, M, S>(position: P, side: S, adapter: SearchAdapter<P, M, S>, options: {
  budgetMs?: number; maxDepth?: number; quiescenceDepth?: number; rootLimit?: number; now?: () => number
} = {}): M | null {
  const now = options.now ?? (() => performance.now())
  const requested = options.budgetMs ?? AI_BUDGET_MS
  const deadline = now() + boundedAiBudget(requested)
  const check = () => { if (now() >= deadline) throw TIMEOUT }
  const root: M[] = []
  let best: M | null = null
  let fallbackScore = -Infinity
  const ranked: { move: M; score: number; fallback: number }[] = []
  try {
    // Even a zero budget obtains one legal fallback before cancellation.
    for (const move of adapter.moves(position, side, () => { if (root.length) check() })) {
      root.push(move)
      best ??= move
      check()
      const score = adapter.order(position, move, side)
      const fallback = adapter.fallback ? adapter.fallback(position, move, side, check) : score
      ranked.push({ move, score, fallback })
      if (fallback > fallbackScore) { fallbackScore = fallback; best = move }
      if (fallback > MATE_SCORE - 100) return move
      check()
    }
  } catch (error) { if (error !== TIMEOUT) throw error }
  if (!root.length) return null
  // Keep only fully evaluated safety scores if generation/preflight times out.
  if (!ranked.length || now() >= deadline) return best
  ranked.sort((a, b) => b.fallback - a.fallback || b.score - a.score)
  best = ranked[0].move
  const candidates = ranked.slice(0, options.rootLimit ?? ranked.length).map(entry => entry.move)
  const table = new Map<string, Entry<M>>()
  const ordered = (pos: P, moves: M[], turn: S, preferred: M | null = null) => {
    const preferredKey = preferred && adapter.moveKey?.(preferred)
    return moves.map(move => {
      check()
      return { move, score: preferredKey && adapter.moveKey?.(move) === preferredKey
        ? MATE_SCORE : adapter.order(pos, move, turn) }
    }).sort((a, b) => b.score - a.score).map(entry => entry.move)
  }
  const movesAt = (pos: P, turn: S) => [...adapter.moves(pos, turn, check)]
  let quietDepth = 0

  const quiet = (pos: P, turn: S, moves: M[], alpha: number, beta: number, ply: number, depth: number): number => {
    check()
    const checked = adapter.inCheck(pos, turn)
    const stand = adapter.evaluate(pos, turn)
    // A position in check cannot stand pat. Permit a short sequence of forced
    // evasions past the nominal capture horizon, still bounded by the deadline.
    if (depth <= 0 && (!checked || depth <= -4)) return stand
    if (!checked) {
      if (stand >= beta) return stand
      alpha = Math.max(alpha, stand)
    }
    let value = checked ? -MATE_SCORE : stand
    const replies = ordered(pos, checked ? moves : moves.filter(move => {
      check()
      if (adapter.tactical(pos, move)) return true
      // The first reply also sees quiet checks: otherwise a material-winning
      // shallow fallback can overlook the opponent's mate in one.
      return ply === 1 && adapter.inCheck(adapter.apply(pos, move, turn), adapter.other(turn))
    }), turn)
    for (const move of replies) {
      check()
      const next = adapter.apply(pos, move, turn)
      const opponent = adapter.other(turn)
      const nextMoves = movesAt(next, opponent)
      const score = nextMoves.length
        ? -quiet(next, opponent, nextMoves, -beta, -alpha, ply + 1, depth - 1)
        : -adapter.terminal(next, opponent, ply + 1)
      value = Math.max(value, score)
      alpha = Math.max(alpha, score)
      if (alpha >= beta) break
    }
    return value
  }

  const negamax = (pos: P, turn: S, depth: number, alpha: number, beta: number, ply: number): number => {
    check()
    const key = adapter.key?.(pos, turn)
    const cached = key ? table.get(key) : undefined
    const originalAlpha = alpha
    const originalBeta = beta
    if (cached && cached.depth >= depth) {
      const score = Math.abs(cached.score) > MATE_SCORE / 2 ? cached.score - Math.sign(cached.score) * ply : cached.score
      if (cached.bound === 'exact') return score
      if (cached.bound === 'lower') alpha = Math.max(alpha, score)
      else beta = Math.min(beta, score)
      if (alpha >= beta) return score
    }
    const moves = movesAt(pos, turn)
    if (!moves.length) return adapter.terminal(pos, turn, ply)
    if (depth <= 0) return quiet(pos, turn, moves, alpha, beta, ply, quietDepth)
    const rankedMoves = ordered(pos, moves, turn, cached?.best ?? null)
    let value = -MATE_SCORE
    let selected: M | null = null
    for (const move of rankedMoves) {
      check()
      const score = -negamax(adapter.apply(pos, move, turn), adapter.other(turn), depth - 1, -beta, -alpha, ply + 1)
      if (score > value) { value = score; selected = move }
      alpha = Math.max(alpha, score)
      if (alpha >= beta) break
    }
    if (key) {
      table.set(key, {
        depth, best: selected,
        score: Math.abs(value) > MATE_SCORE / 2 ? value + Math.sign(value) * ply : value,
        bound: value <= originalAlpha ? 'upper' : value >= originalBeta ? 'lower' : 'exact',
      })
    }
    return value
  }

  for (let depth = 1; depth <= (options.maxDepth ?? 6); depth++) {
    // Check one immediate reply in the first round so cheap pawn captures do not
    // conceal the loss of a queen/rook if a deeper round runs out of time.
    quietDepth = depth === 1 ? Math.min(1, options.quiescenceDepth ?? 3) : options.quiescenceDepth ?? 3
    let roundBest: M | null = best
    let alpha = -MATE_SCORE
    const scores = new Map<M, number>()
    try {
      candidates.sort((a, b) => Number(b === best) - Number(a === best))
      for (const move of candidates) {
        check()
        const score = -negamax(adapter.apply(position, move, side), adapter.other(side), depth - 1, -MATE_SCORE, -alpha, 1)
        scores.set(move, score)
        if (score > alpha) { alpha = score; roundBest = move }
      }
      best = roundBest
      candidates.sort((a, b) => scores.get(b)! - scores.get(a)!)
      if (alpha > MATE_SCORE - 100) break
    } catch (error) {
      if (error !== TIMEOUT) throw error
      break
    }
  }
  return best
}
