import { applyMove } from './xiangqiBoard'
import { inCheck, pseudoLegalMovesFrom } from './xiangqiMoves'
import type { Board, Move, Piece, Side } from './xiangqiTypes'

/** A position before the next move. Piece animation IDs are not rule identities. */
export interface WxfPositionRecord { board: Board; turn: Side }

export type WxfRepetitionResult =
  | { kind: 'perpetual-check' | 'perpetual-chase'; winner: Side; offender: Side }
  | { kind: 'repetition-draw' }

export interface WxfRepetitionOptions {
  /** WXF 3.2.B uses four occurrences for a permitted repetition. */
  drawOccurrences?: number
  /** WXF 19.8 defines prohibited perpetual checking at three occurrences. */
  illegalOccurrences?: number
  /** Override both thresholds, for an early search warning rather than a result. */
  occurrences?: number
  /** Search callers can throw here when their deadline expires. */
  check?: () => void
}

type Tokens = (string | null)[][]
type Threat = { move: Move; victim: string }
type Activity = { kind: 'check' | 'chase' | 'idle'; victims: Set<string> }
const other = (side: Side): Side => side === 'red' ? 'black' : 'red'
const samePiece = (a: Piece | null, b: Piece | null) => a?.type === b?.type && a?.side === b?.side
const sameMove = (a: Move, b: Move) => a.fromR === b.fromR && a.fromC === b.fromC && a.toR === b.toR && a.toC === b.toC
const moved = (board: Board, move: Move) => applyMove(board, move.fromR, move.fromC, move.toR, move.toC)

function key(board: Board, turn: Side, check: () => void): string {
  let result = turn + ':'
  for (const row of board) {
    check()
    for (const piece of row) result += piece ? (piece.side === 'red' ? piece.type.toUpperCase() : piece.type) : '.'
  }
  return result
}

function legalCapture(board: Board, move: Move, check: () => void): boolean {
  check()
  const attacker = board[move.fromR]?.[move.fromC]
  const victim = board[move.toR]?.[move.toC]
  return !!attacker && !!victim && attacker.side !== victim.side && victim.type !== 'k'
    && pseudoLegalMovesFrom(board, move.fromR, move.fromC).some(candidate => sameMove(candidate, move))
    && !inCheck(moved(board, move), attacker.side)
}

function exchange(board: Board, move: Move, check: () => void): boolean {
  const attacker = board[move.fromR][move.fromC]!
  const victim = board[move.toR][move.toC]!
  if (attacker.type !== victim.type) return false
  // WXF 20.7: a pinned piece or a horse with a blocked reverse leg cannot
  // exchange, even though the two pieces have the same type.
  return legalCapture(board, { fromR: move.toR, fromC: move.toC, toR: move.fromR, toC: move.fromC }, check)
}

function slidingDefender(board: Board, r: number, c: number, move: Move, type: 'r' | 'c'): boolean {
  if (r !== move.toR && c !== move.toC) return false
  const dr = Math.sign(move.toR - r), dc = Math.sign(move.toC - c)
  let screens = 0
  for (let nr = r + dr, nc = c + dc; nr !== move.toR || nc !== move.toC; nr += dr, nc += dc) {
    if (board[nr][nc]) screens++
  }
  return screens === (type === 'r' ? 0 : 1)
}

function protectedVictim(board: Board, move: Move, check: () => void): boolean {
  const attacker = board[move.fromR][move.fromC]!, victim = board[move.toR][move.toC]!
  // WXF 20.6 names this exception specifically. Do not extend it using the
  // engine's material evaluation: a rooted piece is otherwise a real root.
  if (victim.type === 'r' && (attacker.type === 'n' || attacker.type === 'c')) return false
  const afterCapture = moved(board, move)
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    check()
    const defender = afterCapture[r][c]
    if (defender?.side !== victim.side) continue
    const recapture = { fromR: r, fromC: c, toR: move.toR, toC: move.toC }
    // WXF diagrams 39–41/108: slider protection is assessed using the
    // occupied squares of the position under consideration. Removing the
    // prospective capturer must not create a new cannon screen/rook ray.
    const canRecapture = defender.type === 'c' || defender.type === 'r'
      ? slidingDefender(board, r, c, move, defender.type)
      : pseudoLegalMovesFrom(afterCapture, r, c).some(candidate => sameMove(candidate, recapture))
    if (canRecapture && !inCheck(moved(afterCapture, recapture), victim.side)) return true
  }
  return false
}

function captureThreats(board: Board, side: Side, tokens: Tokens, check: () => void): Threat[] {
  const threats: Threat[] = []
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    check()
    const attacker = board[r][c]
    // WXF 20.3/20.9: general/pawn chasing moves are permitted.
    if (attacker?.side !== side || attacker.type === 'k' || attacker.type === 'p') continue
    for (const move of pseudoLegalMovesFrom(board, r, c)) {
      check()
      const victim = board[move.toR][move.toC]
      if (!victim || victim.side === side || victim.type === 'k') continue
      // A pawn on its original bank is exempt; a crossed pawn is not.
      if (victim.type === 'p' && (victim.side === 'red' ? move.toR >= 5 : move.toR <= 4)) continue
      if (legalCapture(board, move, check) && !exchange(board, move, check) && !protectedVictim(board, move, check)) {
        threats.push({ move, victim: tokens[move.toR][move.toC]! })
      }
    }
  }
  return threats
}

function inferMove(before: WxfPositionRecord, after: WxfPositionRecord, check: () => void): Move | null {
  if (other(before.turn) !== after.turn) return null
  let from: [number, number] | null = null, to: [number, number] | null = null
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    check()
    const a = before.board[r]?.[c], b = after.board[r]?.[c]
    if (a === undefined || b === undefined) return null
    if (samePiece(a, b)) continue
    if (a?.side === before.turn && !b && !from) from = [r, c]
    else if (b?.side === before.turn && a?.side !== before.turn && !to) to = [r, c]
    else return null
  }
  if (!from || !to) return null
  const move = { fromR: from[0], fromC: from[1], toR: to[0], toC: to[1] }
  if (!pseudoLegalMovesFrom(before.board, ...from).some(candidate => sameMove(candidate, move))) return null
  const applied = moved(before.board, move)
  if (inCheck(applied, before.turn) || key(applied, after.turn, check) !== key(after.board, after.turn, check)) return null
  return move
}

function advanceTokens(tokens: Tokens, move: Move): Tokens {
  const next = tokens.map(row => [...row])
  next[move.toR][move.toC] = next[move.fromR][move.fromC]
  next[move.fromR][move.fromC] = null
  return next
}

function activity(after: Board, mover: Side, threats: Threat[], reply: Move, replyBoard: Board, check: () => void): Activity {
  if (inCheck(after, other(mover))) return { kind: 'check', victims: new Set() }
  const victims = new Set<string>()
  for (const threat of threats) {
    check()
    const move = { ...threat.move }
    if (move.toR === reply.fromR && move.toC === reply.fromC) {
      move.toR = reply.toR; move.toC = reply.toC
    }
    // A freely available capture left unanswered is an offer/idle (WXF
    // diagram 10), not a chase. Only actual evasions/blocks/protection count.
    if (!legalCapture(replyBoard, move, check) || protectedVictim(replyBoard, move, check)) victims.add(threat.victim)
  }
  return { kind: victims.size ? 'chase' : 'idle', victims }
}

function level(activities: Activity[]): 0 | 1 | 2 {
  if (activities.length === 0) return 0
  if (activities.every(item => item.kind === 'check')) return 2
  if (activities.some(item => item.kind !== 'chase')) return 0
  // Alternating attackers can chase one physical victim; chasing different
  // victims is permitted. Coordinates alone lose that distinction (20.3–5).
  const common = new Set(activities[0].victims)
  for (const item of activities.slice(1)) for (const victim of common) if (!item.victims.has(victim)) common.delete(victim)
  return common.size ? 1 : 0
}

type ActivityWindows = Record<Side, [number, number]>

function traceActivities(
  states: WxfPositionRecord[], check: () => void, windows?: ActivityWindows, includeLatest = false,
): Record<Side, Activity[]> | null {
  const steps: Move[] = []
  const tokenBoards: Tokens[] = [states[0].board.map((row, r) => row.map((piece, c) => piece ? `${r}:${c}` : null))]
  for (let index = 0; index < states.length - 1; index++) {
    check()
    const step = inferMove(states[index], states[index + 1], check)
    if (!step) return null
    const piece = states[index].board[step.fromR][step.fromC]!
    // A valid repetition cannot cross a capture or forward pawn move.
    if (states[index].board[step.toR][step.toC] || piece.type === 'p' && step.fromR !== step.toR) return null
    steps.push(step)
    tokenBoards.push(advanceTokens(tokenBoards[index], step))
  }
  const activities: Record<Side, Activity[]> = { red: [], black: [] }
  for (let index = 0; index < steps.length; index++) {
    check()
    const mover = states[index].turn, after = states[index + 1].board
    const window = windows?.[mover]
    if (window && (index < window[0] || index > window[1] || index === window[1] && !includeLatest)) continue
    if (inCheck(after, other(mover))) {
      activities[mover].push({ kind: 'check', victims: new Set() })
      continue
    }
    const threats = captureThreats(after, mover, tokenBoards[index + 1], check)
    // At the closing repeated position, the same-phase response was already
    // played earlier in this cycle. Reuse its legal move on this equal board
    // to classify the closing threat without inventing a future variation.
    if (includeLatest && index === steps.length - 1) {
      // The last quiet move has not yet been answered. It may continue a
      // confirmed chase of the SAME victim, but cannot establish a chase by
      // itself. The existing confirmed activities keep offers/idle from
      // being upgraded by this prospective threat.
      activities[mover].push({ kind: threats.length ? 'chase' : 'idle', victims: new Set(threats.map(threat => threat.victim)) })
      continue
    }
    const reply = steps[index + 1] ?? steps[0]
    const replyBoard = states[index + 2]?.board ?? moved(after, reply)
    activities[mover].push(activity(after, mover, threats, reply, replyBoard, check))
  }
  return activities
}

function responsibility(states: WxfPositionRecord[], check: () => void): [0 | 1 | 2, 0 | 1 | 2] | null {
  const activities = traceActivities(states, check)
  return activities ? [level(activities.red), level(activities.black)] : null
}

function fromLevels(levels: [0 | 1 | 2, 0 | 1 | 2]): WxfRepetitionResult {
  if (levels[0] === levels[1]) return { kind: 'repetition-draw' }
  const offender: Side = levels[0] > levels[1] ? 'red' : 'black'
  return { kind: Math.max(...levels) === 2 ? 'perpetual-check' : 'perpetual-chase', winner: other(offender), offender }
}

/**
 * Early warnings examine each player's last confirmed activity cycle. Their
 * before-move phases can have different periods (WXF diagrams 80/81): using
 * only the shortest current-board loop can lose a different chased victim.
 * Undefined means that one side has no confirmed cycle yet; the caller can
 * still inspect a just-closed full-position cycle. Null is a confirmed
 * warning that the latest move broke, and must not be replaced by an older
 * shorter-window warning.
 */
function activityCycleResult(
  history: readonly WxfPositionRecord[], current: WxfPositionRecord, occurrences: number, allowIdleDraw: boolean, check: () => void,
): WxfRepetitionResult | null | undefined {
  if (history.length < occurrences * 2) return undefined
  const windows = {} as ActivityWindows
  for (const side of ['red', 'black'] as const) {
    check()
    const last = history.at(-1)!.turn === side ? history.length - 1 : history.length - 2
    if (last < 0 || history[last].turn !== side) return undefined
    const phaseKey = key(history[last].board, side, check)
    let start = last - 2, matches = 1
    while (start >= 0) {
      check()
      if (key(history[start].board, history[start].turn, check) === phaseKey && ++matches >= occurrences) break
      start -= 2
    }
    if (start < 0 || matches < occurrences) return undefined
    windows[side] = [start, last]
  }
  const start = Math.min(windows.red[0], windows.black[0])
  const states: WxfPositionRecord[] = []
  for (let index = start; index < history.length; index++) { check(); states.push(history[index]) }
  states.push(current)
  const relative: ActivityWindows = {
    red: [windows.red[0] - start, windows.red[1] - start],
    black: [windows.black[0] - start, windows.black[1] - start],
  }
  const confirmed = traceActivities(states, check, relative)
  const continued = traceActivities(states, check, relative, true)
  if (!confirmed || !continued) return null
  // A final unresolved threat cannot turn a permitted cycle into an offense.
  // It can only continue (or break) an already confirmed pure activity.
  const levels = (['red', 'black'] as const).map(side => {
    const known = level(confirmed[side]), latest = level(continued[side])
    return known === latest ? known : 0
  }) as [0 | 1 | 2, 0 | 1 | 2]
  const currentKey = key(current.board, current.turn, check)
  let repeated = false
  for (let index = history.length - 1; index >= start; index--) {
    check()
    if (key(history[index].board, history[index].turn, check) === currentKey) { repeated = true; break }
  }
  const result = fromLevels(levels)
  if (result.kind === 'repetition-draw' && levels[0] === 0 && !allowIdleDraw) return null
  // Diagram 81's alternating chasers can continue the same victim attack
  // without recreating the entire final board. A new checking or idle board
  // does not inherit an old loop warning merely because its parent repeated.
  return repeated || result.kind === 'perpetual-chase' ? result : null
}

/**
 * WXF 2018 articles 3/19/20. The independent implementation follows the
 * response-based chase model described in Tan & Watkinson Medina (2024),
 * https://arxiv.org/abs/2412.17334 (CC BY 4.0); no engine source is copied.
 * It deliberately separates a game's adjudication threshold from an early
 * warning used by search. Ordinary repetitions require four occurrences;
 * prohibited/mutual prohibited cycles are assessed from the third.
 */
export function getWxfRepetitionResult(
  historyBeforeCurrent: readonly WxfPositionRecord[], currentBoard: Board, nextTurn: Side, options: WxfRepetitionOptions = {},
): WxfRepetitionResult | null {
  const check = options.check ?? (() => {})
  const drawOccurrences = Math.max(2, options.occurrences ?? options.drawOccurrences ?? 4)
  const illegalOccurrences = Math.max(2, options.occurrences ?? options.illegalOccurrences ?? 3)
  const minimum = Math.min(drawOccurrences, illegalOccurrences)
  if (historyBeforeCurrent.length < minimum - 1) return null
  if (options.occurrences === 2) {
    const warning = activityCycleResult(historyBeforeCurrent, { board: currentBoard, turn: nextTurn }, 2, true, check)
    if (warning !== undefined) return warning
  }
  const currentKey = key(currentBoard, nextTurn, check), matches: number[] = [historyBeforeCurrent.length]
  const needed = Math.max(drawOccurrences, illegalOccurrences)
  for (let index = historyBeforeCurrent.length - 1; index >= 0 && matches.length < needed; index--) {
    check()
    const position = historyBeforeCurrent[index]
    if (key(position.board, position.turn, check) === currentKey) matches.push(index)
  }
  const current = { board: currentBoard, turn: nextTurn }
  // A nonrepeated final board can have a chase-pattern warning (diagram 81)
  // whose latest threat has not been answered. It must not end the real game.
  if (matches.length < minimum) return null
  const inspect = (count: number) => {
    const start = matches[count - 1]
    const states: WxfPositionRecord[] = []
    for (let index = start; index < historyBeforeCurrent.length; index++) { check(); states.push(historyBeforeCurrent[index]) }
    states.push(current)
    return responsibility(states, check)
  }
  if (matches.length >= illegalOccurrences) {
    const levels = inspect(illegalOccurrences)
    if (!levels) return null
    if (levels[0] !== levels[1]) {
      return fromLevels(levels)
    }
    if (levels[0] > 0) return { kind: 'repetition-draw' }
  }
  if (matches.length >= drawOccurrences) {
    const levels = inspect(drawOccurrences)
    if (levels && levels[0] === levels[1]) return { kind: 'repetition-draw' }
  }
  return null
}

export function getWxfRepetitionWarning(
  historyBeforeCurrent: readonly WxfPositionRecord[], currentBoard: Board, nextTurn: Side, occurrences = 2,
  options: Pick<WxfRepetitionOptions, 'check'> = {},
): WxfRepetitionResult | null {
  return getWxfRepetitionResult(historyBeforeCurrent, currentBoard, nextTurn, { ...options, occurrences })
}
