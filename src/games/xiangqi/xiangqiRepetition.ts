import { getWxfRepetitionResult, getWxfRepetitionWarning, type WxfRepetitionResult } from './xiangqiWxfRepetition'
import type { Board, Side } from './xiangqiTypes'

export type XiangqiPositionRecord = { board: Board; turn: Side }
export type XiangqiRepetitionResult = WxfRepetitionResult

/** Layout and side to move define a position; animation instance IDs do not. */
export function xiangqiPositionKey(board: Board, turn: Side): string {
  return `${turn}:${board.map(row => row.map(piece => piece ? piece.side === 'red' ? piece.type.toUpperCase() : piece.type : '.').join('')).join('')}`
}

export type XiangqiRepetitionStamp = { key: string | number; turn: Side; checked: boolean }
const other = (side: Side): Side => side === 'red' ? 'black' : 'red'

/** Compact stamps allow search to track checks without cloning every board. */
export class XiangqiRepetitionTracker {
  private readonly records: XiangqiRepetitionStamp[] = []
  private readonly indices = new Map<string | number, number[]>()

  constructor(records: readonly XiangqiRepetitionStamp[] = []) { records.forEach(record => this.push(record)) }

  push(record: XiangqiRepetitionStamp): void {
    const matches = this.indices.get(record.key) ?? []
    matches.push(this.records.length)
    this.indices.set(record.key, matches)
    this.records.push(record)
  }

  pop(): void {
    const record = this.records.pop()
    if (!record) return
    const matches = this.indices.get(record.key)!
    matches.pop()
    if (!matches.length) this.indices.delete(record.key)
  }

  occurrencesCurrent(): number {
    const current = this.records.at(-1)
    return current ? this.indices.get(current.key)!.length : 0
  }

  /** Both sides' latest played before-move phases can repeat independently. */
  activityOccurrencesCurrent(): number {
    // The last record is the unplayed current position. Legal histories
    // alternate, so the previous two records are the latest played phases.
    const current = this.records.at(-1), first = this.records.at(-2), second = this.records.at(-3)
    if (!current || !first || !second || current.turn === first.turn || first.turn === second.turn) return 0
    const count = (record: XiangqiRepetitionStamp) => {
      const matches = this.indices.get(record.key)!
      return matches.length - Number(matches.at(-1) === this.records.length - 1)
    }
    return Math.min(count(first), count(second))
  }

  /** A cheap check-only screen; full WXF adjudication also inspects chasing. */
  result(occurrences?: number): XiangqiRepetitionResult | null {
    const current = this.records.at(-1)
    if (!current) return null
    const matches = this.indices.get(current.key)!
    const required = occurrences ?? 3
    if (matches.length < required) return null
    const start = matches[matches.length - required]
    const count = { red: 0, black: 0 }, everyCheck = { red: true, black: true }
    for (let index = start + 1; index < this.records.length; index++) {
      const record = this.records[index]
      // Invalid/nonalternating history cannot establish a checking offender.
      if (record.turn === this.records[index - 1].turn) return null
      const mover = other(record.turn)
      count[mover]++
      everyCheck[mover] &&= record.checked
    }
    const redChecks = count.red > 0 && everyCheck.red
    const blackChecks = count.black > 0 && everyCheck.black
    if (redChecks !== blackChecks) {
      const offender: Side = redChecks ? 'red' : 'black'
      return { kind: 'perpetual-check', winner: other(offender), offender }
    }
    // WXF Art. 19.8/20.1: mutual long check can already draw at three.
    // Art. 3.2.B requires FOUR occurrences for an otherwise legal cycle.
    return occurrences !== undefined || redChecks && blackChecks || matches.length >= 4 ? { kind: 'repetition-draw' } : null
  }
}

/** WXF: illegal check/chase cycles at three; ordinary repeated positions at four. */
export function getXiangqiRepetitionResult(history: readonly XiangqiPositionRecord[], currentBoard: Board, nextTurn: Side): XiangqiRepetitionResult | null {
  return getWxfRepetitionResult(history, currentBoard, nextTurn)
}

/** Second occurrence warns about the completed cycle; it is not a result yet. */
export function getXiangqiRepetitionWarning(history: readonly XiangqiPositionRecord[], currentBoard: Board, nextTurn: Side): XiangqiRepetitionResult | null {
  return getWxfRepetitionWarning(history, currentBoard, nextTurn)
}
