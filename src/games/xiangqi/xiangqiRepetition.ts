import { inCheck } from './xiangqiMoves'
import type { Board, Side } from './xiangqiTypes'

export type XiangqiPositionRecord = { board: Board; turn: Side }
export type XiangqiRepetitionResult =
  | { kind: 'perpetual-check'; winner: Side; offender: Side }
  | { kind: 'repetition-draw' }

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

  result(occurrences = 3): XiangqiRepetitionResult | null {
    const current = this.records.at(-1)
    if (!current) return null
    const matches = this.indices.get(current.key)!
    if (matches.length < occurrences) return null
    const start = matches[matches.length - occurrences]
    const count = { red: 0, black: 0 }, everyCheck = { red: true, black: true }
    for (let index = start + 1; index < this.records.length; index++) {
      const record = this.records[index]
      // Invalid/nonalternating history cannot establish a checking offender.
      if (record.turn === this.records[index - 1].turn) return { kind: 'repetition-draw' }
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
    return { kind: 'repetition-draw' }
  }
}

function inspect(history: readonly XiangqiPositionRecord[], board: Board, turn: Side, occurrences: number): XiangqiRepetitionResult | null {
  const tracker = new XiangqiRepetitionTracker(history.map(record => ({ key: xiangqiPositionKey(record.board, record.turn), turn: record.turn, checked: inCheck(record.board, record.turn) })))
  tracker.push({ key: xiangqiPositionKey(board, turn), turn, checked: inCheck(board, turn) })
  return tracker.result(occurrences)
}

/** Third occurrence: unilateral continuous check loses; other cycles draw. */
export function getXiangqiRepetitionResult(history: readonly XiangqiPositionRecord[], currentBoard: Board, nextTurn: Side): XiangqiRepetitionResult | null {
  return inspect(history, currentBoard, nextTurn, 3)
}

/** Second occurrence warns about the completed cycle; it is not a result yet. */
export function getXiangqiRepetitionWarning(history: readonly XiangqiPositionRecord[], currentBoard: Board, nextTurn: Side): XiangqiRepetitionResult | null {
  return inspect(history, currentBoard, nextTurn, 2)
}
