import { getUndoIndex } from '../undo'
import { isXiangqiRuleLoss, type XiangqiRuleResult } from './xiangqiOutcome'
import type { Side } from './xiangqiTypes'

/** If a human reply closes the computer's loop, revisit the decision before that computer move. */
export function getXiangqiContinueIndex(history: readonly { turn: Side }[], mode: 'local' | 'ai', turn: Side, result: XiangqiRuleResult | null): number {
  const latest = getUndoIndex(history, mode, 'red')
  if (mode === 'ai' && turn === 'black' && isXiangqiRuleLoss(result) && result.offender === 'black' && latest >= 0) {
    const beforeComputer = latest - 1
    if (beforeComputer >= 0 && history[beforeComputer].turn === 'black') return beforeComputer
  }
  return latest
}
