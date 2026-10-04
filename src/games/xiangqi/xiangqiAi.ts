import { MATE_SCORE } from '../ai/search'
import { pseudoLegalMovesFrom } from './xiangqiMoves'
import { XiangqiSearchPosition, xiangqiPieceValue, xiangqiPlacement } from './xiangqiSearchPosition'
import { XiangqiRepetitionTracker, type XiangqiPositionRecord } from './xiangqiRepetition'
import type { Board, Move, Side } from './xiangqiTypes'

export type XiangqiAnalysis = { depth: number; nodes: number; elapsedMs: number; targetDepth: number; timedOut: boolean }
type Entry = { hash: number; lock: number; context: number; contextLock: number; depth: number; extensions: number; score: number; bound: 'exact' | 'lower' | 'upper'; move: number }
type Candidate = { move: Move; key: number; order: number; capture: boolean; checking: boolean }
const other = (side: Side): Side => side === 'red' ? 'black' : 'red'
const moveKey = (move: Move) => (move.fromR * 9 + move.fromC) * 90 + move.toR * 9 + move.toC
const TIMEOUT = Symbol('Xiangqi search deadline')
const MAX_PLY = 48
const TABLE_SIZE = 65_536

/** A reversible move must be the only two changed squares, without a capture. */
function quietHistoryMove(before: Board, after: Board, side: Side): Move | null {
  let from: [number, number] | null = null, to: [number, number] | null = null, changes = 0
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const a = before[r][c], b = after[r][c]
    if (a?.type === b?.type && a?.side === b?.side) continue
    changes++
    if (a?.side === side && !b) from = [r, c]
    else if (!a && b?.side === side) to = [r, c]
    else return null
  }
  if (changes !== 2 || !from || !to || before[from[0]][from[1]]?.type !== after[to[0]][to[1]]?.type) return null
  return { fromR: from[0], fromC: from[1], toR: to[0], toC: to[1] }
}

function nextBounce(history: readonly XiangqiPositionRecord[], board: Board, side: Side, check: () => void): Move | null {
  const moves: (Move | null)[] = []
  for (let index = history.length - 1; index >= 0 && moves.length < 2; index--) {
    check()
    if (history[index].turn !== side) continue
    const after = history[index + 1]
    if (after && after.turn === side) return null
    moves.push(quietHistoryMove(history[index].board, after?.board ?? board, side))
  }
  const [last, previous] = moves
  return last && previous && last.fromR === previous.toR && last.fromC === previous.toC
    && last.toR === previous.fromR && last.toC === previous.fromC ? previous : null
}

/** Xiangqi keeps its own bounded search so deeper cannon tactics do not alter other games. */
export function analyzeXiangqi(board: Board, side: Side, budgetMs = 800, maxDepth = 8, gameHistory: readonly XiangqiPositionRecord[] = []): { move: Move | null; analysis: XiangqiAnalysis } {
  const started = performance.now()
  const budget = Math.min(3200, Math.max(25, Number.isNaN(budgetMs) ? 25 : budgetMs))
  const targetDepth = Math.max(1, Math.min(12, Number.isFinite(maxDepth) ? Math.floor(maxDepth) : 8))
  const deadline = started + budget
  const position = new XiangqiSearchPosition(board)
  let nodes = 0, completedDepth = 0, timedOut = false, repeatHits = 0
  let clockChecks = 0
  // Check frequently without a high-resolution clock call for every empty
  // square. A batch is at most 32 small move-generation/search operations.
  const check = () => { if ((clockChecks++ & 31) === 0 && performance.now() >= deadline) throw TIMEOUT }
  const result = (move: Move | null) => ({ move, analysis: { depth: completedDepth, nodes, elapsedMs: Math.max(0, performance.now() - started), targetDepth, timedOut } })
  // Obtain legal reserves before the deadline can interrupt a safety screen.
  const legal = position.legalMoves(side)
  if (!legal.length) return result(null)
  let best = legal[0]
  const table: (Entry | undefined)[] = new Array(TABLE_SIZE)
  const killers = Array.from({ length: MAX_PLY }, () => [-1, -1])
  const history = [new Int32Array(8100), new Int32Array(8100)]
  const hashFor = (turn: Side) => (position.hash ^ (turn === 'red' ? 0xa32f41bd : 0x97db3187)) >>> 0
  const pathKey = (turn: Side) => hashFor(turn) * 0x20_0000 + (position.lock & 0x1f_ffff)
  const repetition = new XiangqiRepetitionTracker()
  const contexts = [0x6db37152], contextLocks = [0x93c72ef1]
  const enterStamp = (key: number, turn: Side, checked: boolean) => {
    repetition.push({ key, turn, checked })
    // A cached board score is meaningful only with the same ordered history.
    // Both tags also include the full 53-bit position stamp and check status.
    const low = key >>> 0, high = Math.floor(key / 0x1_0000_0000)
    contexts.push((Math.imul(contexts.at(-1)! ^ low, 0x01000193) ^ high ^ Number(checked)) >>> 0)
    contextLocks.push((Math.imul(contextLocks.at(-1)! ^ high, 0x85ebca6b) ^ low ^ (checked ? 0x9e3779b9 : 0)) >>> 0)
  }
  const enterPosition = (turn: Side, checked: boolean) => enterStamp(pathKey(turn), turn, checked)
  const leavePosition = () => { repetition.pop(); contexts.pop(); contextLocks.pop() }
  const repeatedScore = (turn: Side, ply: number): number | null => {
    const outcome = repetition.result()
    if (!outcome) return null
    repeatHits++
    return outcome.kind === 'repetition-draw' ? 0 : (outcome.winner === turn ? MATE_SCORE - ply : -MATE_SCORE + ply)
  }
  // Break a second return to any played position, including quiet shuffling.
  // A-B-A-B piece shuffles are also discouraged when other pieces have moved,
  // so the full layout has not repeated yet. Wins and forced defence override.
  const repeatedRoots = new Set<number>()
  const perpetualRoots = new Set<number>()
  const playedPositions = new Set<number>()
  const pastStamp = (record: XiangqiPositionRecord) => {
    const past = new XiangqiSearchPosition(record.board)
    const hash = (past.hash ^ (record.turn === 'red' ? 0xa32f41bd : 0x97db3187)) >>> 0
    return { key: hash * 0x20_0000 + (past.lock & 0x1f_ffff), turn: record.turn, checked: past.inCheck(record.turn) }
  }
  const classifyRoots = (tracker: XiangqiRepetitionTracker) => {
    const bounce = nextBounce(gameHistory, board, side, check)
    for (const move of legal) {
      check()
      const victim = position.make(move)
      const nextTurn = other(side)
      tracker.push({ key: pathKey(nextTurn), turn: nextTurn, checked: position.inCheck(nextTurn) })
      try {
        if (playedPositions.has(pathKey(nextTurn)) || !victim && bounce && moveKey(move) === moveKey(bounce)) repeatedRoots.add(moveKey(move))
        const warning = tracker.result(2)
        if (warning?.kind === 'perpetual-check' && warning.offender === side) perpetualRoots.add(moveKey(move))
      } finally { tracker.pop(); position.unmake(move, victim) }
      const freshReserve = legal.find(candidate => !repeatedRoots.has(moveKey(candidate)) && !perpetualRoots.has(moveKey(candidate)))
      if (freshReserve) best = freshReserve
    }
  }
  try {
    // Classify recent cycles first, before a long history can consume the
    // budget. The full history below still determines every terminal result.
    const recent = new XiangqiRepetitionTracker()
    for (let index = Math.max(0, gameHistory.length - 12); index < gameHistory.length; index++) {
      check()
      const stamp = pastStamp(gameHistory[index])
      playedPositions.add(stamp.key)
      recent.push(stamp)
    }
    recent.push({ key: pathKey(side), turn: side, checked: position.inCheck(side) })
    if (gameHistory.length) classifyRoots(recent)
    for (const record of gameHistory) {
      check()
      const stamp = pastStamp(record)
      playedPositions.add(stamp.key)
      enterStamp(stamp.key, stamp.turn, stamp.checked)
    }
    enterPosition(side, position.inCheck(side))
    if (repetition.result()) return result(null)
    if (gameHistory.length > 12) classifyRoots(repetition)
  } catch (error) {
    if (error !== TIMEOUT) throw error
    timedOut = true
    return result(best)
  }

  const candidates = (turn: Side, ply: number, preferred = -1, tactical = false, allowChecks = true): Candidate[] => {
    const output: Candidate[] = []
    const checked = position.inCheck(turn)
    const enemy = other(turn)
    const turnHistory = history[turn === 'red' ? 0 : 1]
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      check()
      const piece = position.board[r][c]
      if (piece?.side !== turn) continue
      for (const move of pseudoLegalMovesFrom(position.board, r, c)) {
        check()
        const victim = position.make(move)
        let checking = false, valid: boolean
        try {
          valid = !position.inCheck(turn)
          if (valid && (!tactical || checked || victim || allowChecks)) checking = position.inCheck(enemy)
        } finally { position.unmake(move, victim) }
        if (!valid || tactical && !checked && !victim && (!allowChecks || !checking)) continue
        const key = moveKey(move)
        const capture = !!victim
        const order = key === preferred ? 10_000_000
          : (victim ? 100_000 + xiangqiPieceValue(victim.type) * 16 - xiangqiPieceValue(piece.type) : 0)
            + (checking ? 50_000 : 0)
            + (!capture && key === killers[ply]?.[0] ? 30_000 : !capture && key === killers[ply]?.[1] ? 25_000 : 0)
            + Math.min(20_000, turnHistory[key])
            + xiangqiPlacement(piece, move.toR, move.toC) - xiangqiPlacement(piece, r, c)
        output.push({ move, key, order, capture, checking })
      }
    }
    output.sort((a, b) => b.order - a.order)
    return output
  }

  // Legal recaptures protect the fallback from trading a rook for a defended
  // pawn. Each capture opens cannon screens and horse legs anew.
  const captureGain = (turn: Side, target: [number, number] | null = null, remaining = 6): number => {
    check()
    if (!remaining) return 0
    const captures: { move: Move; value: number }[] = []
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      check()
      const piece = position.board[r][c]
      if (piece?.side !== turn) continue
      for (const move of pseudoLegalMovesFrom(position.board, r, c)) {
        if (!position.board[move.toR][move.toC] || target && (move.toR !== target[0] || move.toC !== target[1])) continue
        const victim = position.make(move)
        try { if (!position.inCheck(turn)) captures.push({ move, value: xiangqiPieceValue(piece.type) }) } finally { position.unmake(move, victim) }
      }
    }
    const cheapest = target ? Math.min(...captures.map(entry => entry.value)) : Infinity
    let gain = 0
    for (const { move, value } of captures) {
      check()
      if (target && value > cheapest) continue
      const victim = position.make(move)
      try { gain = Math.max(gain, (victim?.type === 'k' ? MATE_SCORE : victim ? xiangqiPieceValue(victim.type) : 0) - captureGain(other(turn), [move.toR, move.toC], remaining - 1)) } finally { position.unmake(move, victim) }
    }
    return gain
  }

  const ranked: { move: Move; score: number }[] = []
  const losing = new Set<number>()
  const prohibitedCheck = (move: Move) => perpetualRoots.has(moveKey(move)) && legal.some(candidate => !perpetualRoots.has(moveKey(candidate)))
  let fallbackScore = -Infinity
  let safe: Move | null = null
  try {
    legal.sort((a, b) => {
      const gain = (move: Move) => {
        const victim = position.board[move.toR][move.toC]
        return victim ? 10_000 + xiangqiPieceValue(victim.type) * 2 - xiangqiPieceValue(position.board[move.fromR][move.fromC]!.type) : 0
      }
      return Number(perpetualRoots.has(moveKey(a))) - Number(perpetualRoots.has(moveKey(b))) || Number(repeatedRoots.has(moveKey(a))) - Number(repeatedRoots.has(moveKey(b))) || gain(b) - gain(a)
    })
    for (const move of legal) {
      check(); nodes++
      const victim = position.make(move)
      let score: number, loses = false
      enterPosition(other(side), position.inCheck(other(side)))
      try {
        if (!position.hasLegalMove(other(side), check)) { completedDepth = 1; return result(move) }
        score = position.evaluate(side) - captureGain(other(side))
        // A fallback is complete only after all enemy replies have been tested,
        // including quiet cannon checks and non-checking stalemate moves.
        for (const reply of candidates(other(side), 1)) {
          const captured = position.make(reply.move)
          enterPosition(side, reply.checking)
          try {
            // The human's legal evasion can close the cycle and make this AI
            // move lose by continuous check, even when its own layout is new.
            const outcome = repetition.result(2)
            if (outcome?.kind === 'perpetual-check' && outcome.offender === side) {
              perpetualRoots.add(moveKey(move))
              repeatedRoots.add(moveKey(move))
              loses = true
              break
            }
            if (!position.hasLegalMove(side, check)) { loses = true; break }
          } finally { leavePosition(); position.unmake(reply.move, captured) }
        }
      } finally { leavePosition(); position.unmake(move, victim) }
      loses ||= prohibitedCheck(move)
      if (loses) { losing.add(moveKey(move)); score = -MATE_SCORE + 2 }
      else if (repeatedRoots.has(moveKey(move))) score = -MATE_SCORE + MAX_PLY
      ranked.push({ move, score })
      if (!loses && score > fallbackScore) { fallbackScore = score; safe = move; best = move }
    }
    ranked.sort((a, b) => b.score - a.score)
    if (!safe) best = (ranked.find(entry => !prohibitedCheck(entry.move)) ?? ranked[0]).move
  } catch (error) {
    if (error !== TIMEOUT) throw error
    timedOut = true
    if (!safe) best = legal.find(move => !losing.has(moveKey(move)) && !repeatedRoots.has(moveKey(move)) && !prohibitedCheck(move)) ?? legal.find(move => !losing.has(moveKey(move)) && !prohibitedCheck(move)) ?? legal.find(move => !prohibitedCheck(move)) ?? best
    return result(best)
  }

  const quiet = (turn: Side, alphaInput: number, beta: number, ply: number, capturesLeft: number, checksLeft: number): number => {
    check(); nodes++
    const repeated = repeatedScore(turn, ply)
    if (repeated !== null) return repeated
    if (ply >= MAX_PLY) return position.hasLegalMove(turn, check) ? position.evaluate(turn) : -MATE_SCORE + ply
    const checked = position.inCheck(turn)
    if (!checked) {
      if (!position.hasLegalMove(turn, check)) return -MATE_SCORE + ply
      const stand = position.evaluate(turn)
      if (stand >= beta || capturesLeft <= 0 && checksLeft <= 0) return stand
    }
    const moves = candidates(turn, ply, -1, true, checksLeft > 0)
    if (checked && !moves.length) return -MATE_SCORE + ply
    let value = checked ? -MATE_SCORE : position.evaluate(turn)
    let alpha = alphaInput
    if (!checked) { if (value >= beta) return value; alpha = Math.max(alpha, value) }
    for (const entry of moves) {
      if (!checked && !entry.checking && capturesLeft <= 0) continue
      if (checked && checksLeft < -4) break
      const victim = position.make(entry.move)
      let score: number
      enterPosition(other(turn), entry.checking)
      try { score = -quiet(other(turn), -beta, -alpha, ply + 1, capturesLeft - Number(entry.capture), checksLeft - Number(checked || entry.checking)) } finally { leavePosition(); position.unmake(entry.move, victim) }
      value = Math.max(value, score)
      alpha = Math.max(alpha, score)
      if (alpha >= beta) break
    }
    return checked && checksLeft < -4 ? position.evaluate(turn) : value
  }

  const negamax = (turn: Side, depth: number, alphaInput: number, betaInput: number, ply: number, extensions: number): number => {
    check(); nodes++
    const repeated = repeatedScore(turn, ply)
    if (repeated !== null) return repeated
    if (ply >= MAX_PLY) return position.hasLegalMove(turn, check) ? position.evaluate(turn) : -MATE_SCORE + ply
    const repeatsBefore = repeatHits
    const checked = position.inCheck(turn)
    if (checked && extensions < 2) { depth++; extensions++ }
    if (depth <= 0) return quiet(turn, alphaInput, betaInput, ply, 3, 4)
    const hash = hashFor(turn), slot = hash & (TABLE_SIZE - 1)
    const stored = table[slot]
    const cached = stored?.hash === hash && stored.lock === position.lock ? stored : undefined
    let alpha = alphaInput, beta = betaInput
    if (cached && cached.context === contexts.at(-1) && cached.contextLock === contextLocks.at(-1) && cached.depth >= depth && cached.extensions === extensions) {
      const score = Math.abs(cached.score) > MATE_SCORE / 2 ? cached.score - Math.sign(cached.score) * ply : cached.score
      if (cached.bound === 'exact') return score
      if (cached.bound === 'lower') alpha = Math.max(alpha, score)
      else beta = Math.min(beta, score)
      if (alpha >= beta) return score
    }
    const moves = candidates(turn, ply, cached?.move)
    if (!moves.length) return -MATE_SCORE + ply
    const effectiveAlpha = alpha, effectiveBeta = beta
    let value = -MATE_SCORE, chosen = -1
    for (let index = 0; index < moves.length; index++) {
      const entry = moves[index]
      const victim = position.make(entry.move)
      enterPosition(other(turn), entry.checking)
      let score: number
      try {
        score = index === 0 ? -negamax(other(turn), depth - 1, -beta, -alpha, ply + 1, extensions)
          : -negamax(other(turn), depth - 1, -alpha - 1, -alpha, ply + 1, extensions)
        if (index > 0 && score > alpha && score < beta) score = -negamax(other(turn), depth - 1, -beta, -alpha, ply + 1, extensions)
      } finally { leavePosition(); position.unmake(entry.move, victim) }
      if (score > value) { value = score; chosen = entry.key }
      alpha = Math.max(alpha, score)
      if (alpha >= beta) {
        if (!entry.capture) {
          if (killers[ply][0] !== entry.key) { killers[ply][1] = killers[ply][0]; killers[ply][0] = entry.key }
          const scores = history[turn === 'red' ? 0 : 1]
          scores[entry.key] = Math.min(20_000, scores[entry.key] + depth * depth * 8)
        }
        break
      }
    }
    if (repeatHits === repeatsBefore) table[slot] = { hash, lock: position.lock, context: contexts.at(-1)!, contextLock: contextLocks.at(-1)!, depth, extensions, score: Math.abs(value) > MATE_SCORE / 2 ? value + Math.sign(value) * ply : value, move: chosen, bound: value <= effectiveAlpha ? 'upper' : value >= effectiveBeta ? 'lower' : 'exact' }
    return value
  }

  const roots = ranked.filter(entry => !losing.has(moveKey(entry.move)) && !prohibitedCheck(entry.move))
  if (!roots.length) roots.push(...ranked.filter(entry => !prohibitedCheck(entry.move)))
  if (!roots.length) roots.push(...ranked)
  if (roots.some(entry => !repeatedRoots.has(moveKey(entry.move)))) {
    for (let index = roots.length - 1; index >= 0; index--) if (repeatedRoots.has(moveKey(roots[index].move))) roots.splice(index, 1)
    if (repeatedRoots.has(moveKey(best))) best = roots[0].move
  }
  for (let depth = 1; depth <= targetDepth; depth++) {
    let roundBest = best, alpha = -MATE_SCORE
    const scores = new Map<number, number>()
    roots.sort((a, b) => Number(moveKey(b.move) === moveKey(best)) - Number(moveKey(a.move) === moveKey(best)) || b.score - a.score)
    try {
      for (const entry of roots) {
        check()
        const victim = position.make(entry.move)
        enterPosition(other(side), position.inCheck(other(side)))
        let score: number
        try { score = -negamax(other(side), depth - 1, -MATE_SCORE, -alpha, 1, 0) } finally { leavePosition(); position.unmake(entry.move, victim) }
        scores.set(moveKey(entry.move), score)
        if (score > alpha) { alpha = score; roundBest = entry.move }
      }
      best = roundBest
      completedDepth = depth
      roots.forEach(entry => { entry.score = scores.get(moveKey(entry.move))! })
      if (alpha > MATE_SCORE - MAX_PLY) break
    } catch (error) {
      if (error !== TIMEOUT) throw error
      timedOut = true
      break
    }
  }
  return result(best)
}

export function pickAiMoveXiangqi(board: Board, side: Side, budgetMs = 800): Move | null {
  return analyzeXiangqi(board, side, budgetMs).move
}
