import { legalMovesFromChecked } from '../games/xiangqi/xiangqiMoves'
import { adjudicateXiangqi, isXiangqiRuleDraw } from '../games/xiangqi/xiangqiOutcome'
import type { AiAnalysis, AiTasks } from './aiTypes'

type AiReply<G extends keyof AiTasks> = { move: AiTasks[G]['move'] | null; analysis?: AiAnalysis<G> }
type ParsedReply<G extends keyof AiTasks> = { ok: true; reply: AiReply<G> } | { ok: false; message: string }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const coordinate = (value: unknown, limit: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < limit

/** A broken reply must become a recoverable error before its watchdog is removed. */
export function parseAiReply<G extends keyof AiTasks>(game: G, input: AiTasks[G]['input'], value: unknown): ParsedReply<G> {
  if (!record(value) || !Object.hasOwn(value, 'move') || value.move === undefined) return { ok: false, message: 'Worker reply does not contain a move.' }
  if (game === 'xiangqi') {
    const { board, side, history = [] } = input as AiTasks['xiangqi']['input']
    const move = value.move
    if (move === null) {
      const outcome = adjudicateXiangqi(history, board, side)
      if (!outcome.winner && !isXiangqiRuleDraw(outcome.result)) {
        for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
          if (board[r][c]?.side === side && legalMovesFromChecked(board, r, c).length) return { ok: false, message: 'Xiangqi worker returned no move for a playable position.' }
        }
      }
    } else {
      if (!record(move) || !coordinate(move.fromR, 10) || !coordinate(move.toR, 10) || !coordinate(move.fromC, 9) || !coordinate(move.toC, 9)) return { ok: false, message: 'Xiangqi worker returned invalid move coordinates.' }
      if (board[move.fromR][move.fromC]?.side !== side || !legalMovesFromChecked(board, move.fromR, move.fromC).some(legal => legal.toR === move.toR && legal.toC === move.toC)) return { ok: false, message: 'Xiangqi worker returned an illegal move.' }
    }
    if (value.analysis !== undefined) {
      const stats = value.analysis
      if (!record(stats)
        || !coordinate(stats.depth, 13)
        || typeof stats.nodes !== 'number' || !Number.isSafeInteger(stats.nodes) || stats.nodes < 0
        || typeof stats.elapsedMs !== 'number' || !Number.isFinite(stats.elapsedMs) || stats.elapsedMs < 0
        || !coordinate(stats.targetDepth, 13) || stats.targetDepth < 1
        || typeof stats.timedOut !== 'boolean') return { ok: false, message: 'Xiangqi worker returned invalid analysis.' }
    }
  }
  return { ok: true, reply: value as AiReply<G> }
}
