import type { Piece, PieceType } from './junqiTypes'
import { RANK } from './junqiTypes'

export type CombatResult = 'attacker' | 'defender' | 'both' | 'none'

export function resolveCombat(attacker: Piece, defender: Piece): CombatResult {
  if (defender.type === 'mine') {
    if (attacker.type === 'engineer') return 'attacker'
    if (attacker.type === 'bomb') return 'both'
    return 'defender'
  }
  if (defender.type === 'flag') return 'attacker'
  if (attacker.type === 'bomb' || defender.type === 'bomb') return 'both'

  const a = RANK[attacker.type]
  const d = RANK[defender.type]
  if (a > d) return 'attacker'
  if (a < d) return 'defender'
  return 'both'
}

export function canMoveType(type: PieceType): boolean {
  return type !== 'mine' && type !== 'flag'
}
