import { applyMove, isCamp, isHeadquarters } from './junqiBoard'
import { resolveCombat } from './junqiCombat'
import { allLegalMoves, movesForPiece } from './junqiMoves'
import { piecePool, type Board, type Move, type Piece, type PieceType, type Side } from './junqiTypes'

const VALUES: Record<PieceType, number> = {
  commander: 220, army: 185, division: 150, brigade: 120, regiment: 100,
  battalion: 80, company: 65, platoon: 50, engineer: 60, bomb: 130, mine: 80, flag: 1_200,
}
type Belief = { type: PieceType; probability: number }
const TIMEOUT = Symbol('junqi search deadline')

/** Enemy hidden identities are never inspected: use visible ranks and deployment priors. */
export function pickAiMoveJunqi(board: Board, side: Side, budgetMs = 800): Move | null {
  const deadline = performance.now() + Math.min(900, Math.max(0, budgetMs))
  const check = () => { if (performance.now() >= deadline) throw TIMEOUT }
  const enemy: Side = side === 'red' ? 'blue' : 'red'
  const moves = allLegalMoves(board, side)
  if (!moves.length) return null
  const remaining = new Map<PieceType, number>()
  for (const type of piecePool()) remaining.set(type, (remaining.get(type) ?? 0) + 1)
  let ownFlag: [number, number] | null = null
  for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) {
    const piece = board[r][c]
    if (!piece) continue
    if (piece.side === side && piece.type === 'flag') ownFlag = [r, c]
    if (piece.side === enemy && piece.revealed) remaining.set(piece.type, Math.max(0, (remaining.get(piece.type) ?? 0) - 1))
  }
  const beliefs = (piece: Piece, r: number, c: number): Belief[] => {
    if (piece.revealed) return [{ type: piece.type, probability: 1 }]
    const rear = enemy === 'blue' ? 0 : 5
    const counts = [...remaining].filter(([type, count]) => count > 0 && (type !== 'flag' || isHeadquarters(r, c)) && (type !== 'mine' || r === rear))
    const ordinary = counts.filter(([type]) => type !== 'flag' && type !== 'mine').reduce((sum, [, count]) => sum + count, 0)
    const weights = counts.map(([type, count]) => [type, type === 'flag' ? ordinary + (remaining.get('mine') ?? 0) : type === 'mine' ? Math.max(count, ordinary * .35) : count] as const)
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0)
    return weights.map(([type, weight]) => ({ type, probability: weight / total }))
  }
  const imagined = (type: PieceType): Piece => ({ id: 'public-information-hypothesis', side: enemy, type, revealed: false })
  const danger = (position: Board, r: number, c: number, victim: Piece): number => {
    if (isCamp(r, c)) return 0
    let worst = 0
    for (let er = 0; er < 6; er++) for (let ec = 0; ec < 12; ec++) {
      check()
      const attacker = position[er][ec]
      if (!attacker || attacker.side !== enemy || isHeadquarters(er, ec)) continue
      const distribution = beliefs(attacker, er, ec)
      const normalPath = movesForPiece(position, er, ec, imagined('commander')).some(move => move.toR === r && move.toC === c)
      const engineerPath = movesForPiece(position, er, ec, imagined('engineer')).some(move => move.toR === r && move.toC === c)
      let risk = 0
      for (const hypothesis of distribution) {
        if (hypothesis.type === 'flag' || hypothesis.type === 'mine') continue
        if (hypothesis.type === 'engineer' ? !engineerPath : !normalPath) continue
        const outcome = resolveCombat(imagined(hypothesis.type), victim)
        if (outcome === 'attacker' || outcome === 'both') risk += hypothesis.probability * VALUES[victim.type]
      }
      worst = Math.max(worst, risk)
    }
    return worst
  }
  const immediate = (move: Move) => {
    const attacker = board[move.fromR][move.fromC]!
    const defender = board[move.toR][move.toC]
    let gain = 0, survive = 1
    if (defender) {
      survive = 0
      for (const hypothesis of beliefs(defender, move.toR, move.toC)) {
        const outcome = resolveCombat(attacker, imagined(hypothesis.type))
        if (outcome === 'attacker') { gain += hypothesis.probability * VALUES[hypothesis.type]; survive += hypothesis.probability }
        else if (outcome === 'both') gain += hypothesis.probability * (VALUES[hypothesis.type] - VALUES[attacker.type])
        else gain -= hypothesis.probability * VALUES[attacker.type]
      }
    }
    const enemyRear = enemy === 'blue' ? 0 : 5
    const distance = (r: number, c: number) => Math.abs(r - enemyRear) + Math.min(Math.abs(c - 5), Math.abs(c - 6))
    const progress = (distance(move.fromR, move.fromC) - distance(move.toR, move.toC)) * 7
    return { gain, survive, score: gain + progress * survive + (isCamp(move.toR, move.toC) ? 10 : 0) - (isHeadquarters(move.toR, move.toC) && !defender ? 35 : 0) }
  }
  const ranked = moves.map(move => ({ move, ...immediate(move) })).sort((a, b) => b.score - a.score)
  let best = ranked[0].move, bestScore = -Infinity
  try {
    const flagRisk = ownFlag ? danger(board, ...ownFlag, board[ownFlag[0]][ownFlag[1]]!) : 0
    for (const candidate of ranked) {
      check()
      const move = candidate.move
      const target = board[move.toR][move.toC]
      if (target?.revealed && target.type === 'flag') return move
      // The survival branch has the same occupancy for every possible victim rank.
      // No actual hidden defender type is used to construct it.
      const next = applyMove(board, move, target ? 'attacker' : 'none')
      const moved = next[move.toR][move.toC]!
      const risk = danger(next, move.toR, move.toC, moved) * candidate.survive
      const nextFlagRisk = ownFlag ? danger(next, ...ownFlag, next[ownFlag[0]][ownFlag[1]]!) : 0
      const score = candidate.score - risk * .9 + (flagRisk - nextFlagRisk) * .8
      if (score > bestScore) { bestScore = score; best = move }
    }
  } catch (error) { if (error !== TIMEOUT) throw error }
  return best
}
