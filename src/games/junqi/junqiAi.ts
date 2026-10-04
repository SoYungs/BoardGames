import { applyMove, isCamp, isHeadquarters } from './junqiBoard'
import { boundedAiBudget } from '../ai/search'
import { resolveCombat, type CombatResult } from './junqiCombat'
import { allLegalMoves, movesForPiece } from './junqiMoves'
import { piecePool, type Board, type Move, type Piece, type PieceType, type Side } from './junqiTypes'

const VALUES: Record<PieceType, number> = {
  commander: 220, army: 185, division: 150, brigade: 120, regiment: 100,
  battalion: 80, company: 65, platoon: 50, engineer: 60, bomb: 130, mine: 80, flag: 1_200,
}
type Belief = { type: PieceType; probability: number }
type Branch = { outcome: CombatResult; probability: number; defenders: Belief[] }
const TIMEOUT = Symbol('junqi search deadline')

/** Enemy hidden identities are never inspected: use visible ranks and deployment priors. */
export function pickAiMoveJunqi(board: Board, side: Side, budgetMs = 800): Move | null {
  // A tiny tactical floor keeps explicit zero/short budgets from skipping the
  // flag-safety pass. Normal play still uses 800ms and never exceeds the 900 cap.
  const deadline = performance.now() + boundedAiBudget(budgetMs, 25)
  const check = () => { if (performance.now() >= deadline) throw TIMEOUT }
  const enemy: Side = side === 'red' ? 'blue' : 'red'
  const moves = allLegalMoves(board, side)
  if (!moves.length) return null
  const remaining = new Map<PieceType, number>()
  for (const type of piecePool()) remaining.set(type, (remaining.get(type) ?? 0) + 1)
  for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) {
    const piece = board[r][c]
    if (piece?.side === enemy && piece.revealed) remaining.set(piece.type, Math.max(0, (remaining.get(piece.type) ?? 0) - 1))
  }
  const beliefs = (piece: Piece, r: number, c: number): Belief[] => {
    if (piece.revealed) return [{ type: piece.type, probability: 1 }]
    if (piece.hasTurned) return [{ type: 'engineer', probability: 1 }]
    const rear = enemy === 'blue' ? 0 : 5
    const counts = [...remaining].filter(([type, count]) => count > 0 && (type !== 'flag' || (!piece.hasMoved && isHeadquarters(r, c))) && (type !== 'mine' || (!piece.hasMoved && r === rear)))
    const ordinary = counts.filter(([type]) => type !== 'flag' && type !== 'mine').reduce((sum, [, count]) => sum + count, 0)
    const weights = counts.map(([type, count]) => [type, type === 'flag' ? ordinary + (remaining.get('mine') ?? 0) : type === 'mine' ? Math.max(count, ordinary * .35) : count] as const)
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0)
    return weights.map(([type, weight]) => ({ type, probability: weight / total }))
  }
  const imagined = (type: PieceType): Piece => ({ id: 'public-information-hypothesis', side: enemy, type, revealed: false })

  // Generate each enemy's two public movement possibilities once, rather than
  // recomputing its paths separately for every own piece under attack.
  const risks = (position: Board, posterior?: { piece: Piece; distribution: Belief[] }): { flag: number; material: number; canMove: boolean } => {
    const losses = new Map<string, { flag: boolean; loss: number }>()
    let canMove = false
    for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) {
      check()
      const attacker = position[r][c]
      if (attacker?.side !== enemy || isHeadquarters(r, c)) continue
      const distribution = posterior?.piece === attacker ? posterior.distribution : beliefs(attacker, r, c)
      const normal = movesForPiece(position, r, c, imagined('commander'))
      const engineers = movesForPiece(position, r, c, imagined('engineer'))
      const normalTargets = new Set(normal.map(move => `${move.toR},${move.toC}`))
      const engineerTargets = new Set(engineers.map(move => `${move.toR},${move.toC}`))
      const canUse = (paths: Move[]) => paths.some(move => !(isCamp(move.toR, move.toC) && position[move.toR][move.toC]))
      if (distribution.some(hypothesis => hypothesis.type === 'engineer') && canUse(engineers)) canMove = true
      if (distribution.some(hypothesis => !['engineer', 'mine', 'flag'].includes(hypothesis.type)) && canUse(normal)) canMove = true
      for (const move of [...normal, ...engineers]) {
        const victim = position[move.toR][move.toC]
        if (victim?.side !== side || isCamp(move.toR, move.toC)) continue
        const key = `${move.toR},${move.toC}`
        let loss = 0
        for (const hypothesis of distribution) {
          if (hypothesis.type === 'flag' || hypothesis.type === 'mine') continue
          if (!(hypothesis.type === 'engineer' ? engineerTargets : normalTargets).has(key)) continue
          const outcome = resolveCombat(imagined(hypothesis.type), victim)
          if (outcome === 'attacker') loss += hypothesis.probability * VALUES[victim.type]
          else if (outcome === 'both') loss += hypothesis.probability * Math.max(0, VALUES[victim.type] - VALUES[hypothesis.type])
        }
        const previous = losses.get(victim.id)?.loss ?? 0
        losses.set(victim.id, { flag: victim.type === 'flag', loss: Math.max(previous, loss) })
      }
    }
    const values = [...losses.values()]
    return {
      flag: Math.max(0, ...values.filter(value => value.flag).map(value => value.loss)),
      material: Math.max(0, ...values.filter(value => !value.flag).map(value => value.loss)),
      canMove,
    }
  }

  const immediate = (move: Move) => {
    const attacker = board[move.fromR][move.fromC]!
    const defender = board[move.toR][move.toC]
    let gain = 0, survive = 1
    const branches: Branch[] = []
    if (defender) {
      survive = 0
      const outcomes = new Map<CombatResult, Belief[]>()
      for (const hypothesis of beliefs(defender, move.toR, move.toC)) {
        const outcome = resolveCombat(attacker, imagined(hypothesis.type))
        const group = outcomes.get(outcome) ?? []
        group.push(hypothesis)
        outcomes.set(outcome, group)
        if (outcome === 'attacker') { gain += hypothesis.probability * VALUES[hypothesis.type]; survive += hypothesis.probability }
        else if (outcome === 'both') gain += hypothesis.probability * (VALUES[hypothesis.type] - VALUES[attacker.type])
        else gain -= hypothesis.probability * VALUES[attacker.type]
      }
      for (const [outcome, distribution] of outcomes) {
        const probability = distribution.reduce((sum, belief) => sum + belief.probability, 0)
        branches.push({ outcome, probability, defenders: distribution.map(belief => ({ ...belief, probability: belief.probability / probability })) })
      }
    } else branches.push({ outcome: 'none', probability: 1, defenders: [] })
    const enemyRear = enemy === 'blue' ? 0 : 5
    const distance = (r: number, c: number) => Math.abs(r - enemyRear) + Math.min(Math.abs(c - 5), Math.abs(c - 6))
    const progress = (distance(move.fromR, move.fromC) - distance(move.toR, move.toC)) * 7
    return { branches, score: gain + progress * survive + (isCamp(move.toR, move.toC) ? 10 : 0) - (isHeadquarters(move.toR, move.toC) && !defender ? 35 : 0) }
  }

  // A visible flag capture wins before any response is possible.
  const win = moves.find(move => board[move.toR][move.toC]?.revealed && board[move.toR][move.toC]?.type === 'flag')
  if (win) return win
  const ranked = moves.map(move => ({ move, ...immediate(move) })).sort((a, b) => b.score - a.score)
  let best = ranked[0].move, bestScore = -Infinity
  try {
    for (const candidate of ranked) {
      check()
      const move = candidate.move
      const target = board[move.toR][move.toC]
      let materialRisk = 0, flagRisk = 0, mobilityResult = 0
      for (const branch of candidate.branches) {
        check()
        let next: Board
        if (branch.outcome === 'defender') {
          // Keep a hidden surviving defender by reference. Spreading it would
          // inspect its actual rank, and the branch's public posterior suffices.
          next = board.map(row => row.slice())
          next[move.fromR][move.fromC] = null
        } else next = applyMove(board, move, branch.outcome)
        const risk = risks(next, branch.outcome === 'defender' && target ? { piece: target, distribution: branch.defenders } : undefined)
        materialRisk += branch.probability * risk.material
        flagRisk += branch.probability * risk.flag
        if (!risk.canMove) mobilityResult += branch.probability * 10_000
        else if (!allLegalMoves(next, side).length) {
          const capturedFlag = branch.outcome === 'attacker' ? branch.defenders.filter(defender => defender.type === 'flag').reduce((sum, defender) => sum + defender.probability, 0) : 0
          mobilityResult -= branch.probability * (1 - capturedFlag) * 10_000
        }
      }
      const score = candidate.score - materialRisk * .95 - flagRisk + mobilityResult
      if (score > bestScore) { bestScore = score; best = move }
    }
  } catch (error) { if (error !== TIMEOUT) throw error }
  return best
}
