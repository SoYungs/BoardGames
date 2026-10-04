import { getXiangqiWinner } from './xiangqiMoves'
import { getXiangqiNaturalDraw, type XiangqiNaturalDrawResult } from './xiangqiNaturalDraw'
import { getXiangqiRepetitionResult, type XiangqiPositionRecord, type XiangqiRepetitionResult } from './xiangqiRepetition'
import type { Board, Side } from './xiangqiTypes'

/** The legacy save field is named repetitionResult; it now carries any rule draw. */
export type XiangqiRuleResult = XiangqiRepetitionResult | XiangqiNaturalDrawResult
export type XiangqiOutcome = { winner: Side | null; result: XiangqiRuleResult | null }

export function isXiangqiRuleLoss(result: XiangqiRuleResult | null): result is Extract<XiangqiRuleResult, { offender: Side }> {
  return result?.kind === 'perpetual-check' || result?.kind === 'perpetual-chase'
}

export function isXiangqiRuleDraw(result: XiangqiRuleResult | null): boolean {
  return result !== null && !isXiangqiRuleLoss(result)
}

/** Mate/stalemate ends the game immediately, before a later repetition or draw claim. */
export function adjudicateXiangqi(history: readonly XiangqiPositionRecord[], board: Board, nextTurn: Side): XiangqiOutcome {
  const winner = getXiangqiWinner(board, nextTurn)
  if (winner) return { winner, result: null }
  const repeated = getXiangqiRepetitionResult(history, board, nextTurn)
  if (repeated) return { winner: isXiangqiRuleLoss(repeated) ? repeated.winner : null, result: repeated }
  return { winner: null, result: getXiangqiNaturalDraw(history, board, nextTurn) }
}
