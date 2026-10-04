import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMove, createInitialBoard } from '../src/games/xiangqi/xiangqiBoard.ts'
import { analyzeXiangqi } from '../src/games/xiangqi/xiangqiAi.ts'
import { allLegalMovesChecked, inCheck, pickAiMoveXiangqi } from '../src/games/xiangqi/xiangqiMoves.ts'
import type { Board, Move, PieceType, Side } from '../src/games/xiangqi/xiangqiTypes.ts'

const other = (side: Side): Side => side === 'red' ? 'black' : 'red'
const sameMove = (a: Move, b: Move) => a.fromR === b.fromR && a.fromC === b.fromC && a.toR === b.toR && a.toC === b.toC
const apply = (board: Board, move: Move) => applyMove(board, move.fromR, move.fromC, move.toR, move.toC)

function position(rows: readonly string[], defender: Side): Board {
  const board: Board = Array.from({ length: 10 }, () => Array(9).fill(null))
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const letter = rows[r][c]
    if (letter === '.') continue
    const originalSide: Side = letter === letter.toLowerCase() ? 'black' : 'red'
    const mirrored = defender === 'red'
    board[mirrored ? 9 - r : r][mirrored ? 8 - c : c] = {
      id: `${r}:${c}`,
      side: mirrored ? other(originalSide) : originalSide,
      type: letter.toLowerCase() as PieceType,
    }
  }
  return board
}

// This oracle examines every legal attacker move and every legal defence. It
// has no evaluation function or move ordering in common with the AI search.
function forcedCheckingMate(board: Board, attacker: Side, attacksRemaining: number): boolean {
  const defender = other(attacker)
  for (const attack of allLegalMovesChecked(board, attacker)) {
    const next = apply(board, attack)
    if (!inCheck(next, defender)) continue
    const replies = allLegalMovesChecked(next, defender)
    if (!replies.length) return true
    if (attacksRemaining > 1 && replies.every(reply => forcedCheckingMate(apply(next, reply), attacker, attacksRemaining - 1))) return true
  }
  return false
}

function withClock<T>(now: () => number, operation: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(performance, 'now')
  Object.defineProperty(performance, 'now', { configurable: true, value: now })
  try {
    return operation()
  } finally {
    if (descriptor) Object.defineProperty(performance, 'now', descriptor)
    else Reflect.deleteProperty(performance, 'now')
  }
}

function controlledPick(board: Board, side: Side, budget: number, step: number) {
  let clock = 0
  const move = withClock(() => clock += step, () => pickAiMoveXiangqi(board, side, budget))
  return { move, clock }
}

// The black pawn is the second screen in front of the rear cannon. Moving the
// front cannon sideways exposes a one-screen cannon check. A tempting rook
// capture leaves the general without an escape or a possible interposition.
const discoveredDoubleCannon = [
  '....k....',
  '...P.P..r',
  '....C....',
  '....p...R',
  '.....P..r',
  '....C....',
  '.........',
  '.........',
  '.........',
  '....K....',
]

// The front cannon already checks over the advanced pawn. Adding an advisor
// or rook as another screen answers that check but allows a quiet rook mate.
// Escaping with the general preserves the spare rook's cannon interpositions.
const checkedCannonBattery = [
  '....k....',
  'r........',
  '...aP....',
  '....C.R..',
  '...P.....',
  '....C....',
  '.........',
  '.........',
  '.........',
  '....K....',
]

test('xiangqi screens a quiet discovered double-cannon mate before accepting a tempting rook capture, for either side', () => {
  for (const defender of ['black', 'red'] as const) {
    const board = position(discoveredDoubleCannon, defender)
    const before = structuredClone(board)
    const legal = allLegalMovesChecked(board, defender)
    const attacker = other(defender)
    assert.equal(inCheck(board, defender), false)
    assert.equal(inCheck(board, attacker), false)
    const safe = legal.filter(move => !forcedCheckingMate(apply(board, move), attacker, 1))
    assert.ok(safe.length > 0 && safe.length < legal.length, 'fixture must have both a defence and a genuine mating trap')
    const rookTrap = legal.find(move => board[move.toR][move.toC]?.type === 'r')
    assert.ok(rookTrap)
    assert.equal(forcedCheckingMate(apply(board, rookTrap), attacker, 1), true)
    for (const budget of [0, 1]) for (const step of [.002, .005, .01, .02]) {
      // The old generic fallback chose the hanging rook before reaching its
      // first complete tactical search round at the two smaller work rates.
      const { move } = controlledPick(board, defender, budget, step)
      assert.ok(move)
      assert.ok(legal.some(candidate => sameMove(candidate, move)))
      assert.equal(forcedCheckingMate(apply(board, move), attacker, 1), false, `${defender}, budget ${budget}, clock step ${step}: failed to prevent a proven cannon mate`)
      assert.deepEqual(board, before)
    }
  }
})

test('xiangqi answers an existing cannon check without permitting a two-check forced mate, for either side', () => {
  for (const defender of ['black', 'red'] as const) {
    const board = position(checkedCannonBattery, defender)
    const before = structuredClone(board)
    const legal = allLegalMovesChecked(board, defender)
    const attacker = other(defender)
    assert.equal(inCheck(board, defender), true)
    assert.equal(inCheck(board, attacker), false)
    const safe = legal.filter(move => !forcedCheckingMate(apply(board, move), attacker, 2))
    assert.ok(safe.length > 0 && safe.length < legal.length, 'fixture must be defendable against all checking continuations in the tested horizon')
    for (const budget of [0, 1, 700]) {
      const { move } = controlledPick(board, defender, budget, .01)
      assert.ok(move)
      assert.ok(legal.some(candidate => sameMove(candidate, move)))
      const next = apply(board, move)
      assert.equal(inCheck(next, defender), false)
      assert.equal(forcedCheckingMate(next, attacker, 2), false, `${defender}, budget ${budget}: answered one check but allowed a forced continuation`)
      assert.deepEqual(board, before)
    }
  }
})

test('xiangqi recognises the exposed rear-cannon mate itself instead of making a material-only move', () => {
  for (const defender of ['black', 'red'] as const) {
    const board = position(discoveredDoubleCannon, defender)
    const trap = allLegalMovesChecked(board, defender).find(move => board[move.toR][move.toC]?.type === 'r')!
    const afterTrap = apply(board, trap)
    const before = structuredClone(afterTrap)
    const attacker = other(defender)
    assert.equal(forcedCheckingMate(afterTrap, attacker, 1), true)
    const { move } = controlledPick(afterTrap, attacker, 0, .002)
    assert.ok(move)
    assert.ok(allLegalMovesChecked(afterTrap, attacker).some(candidate => sameMove(candidate, move)))
    const next = apply(afterTrap, move)
    assert.equal(inCheck(next, defender), true)
    assert.equal(allLegalMovesChecked(next, defender).length, 0)
    assert.deepEqual(afterTrap, before)
  }
})


test('xiangqi uses its own 25ms floor and 3200ms cap, including non-finite budgets, without changing a frozen board', () => {
  const board = createInitialBoard()
  const before = structuredClone(board)
  for (const row of board) {
    for (const piece of row) if (piece) Object.freeze(piece)
    Object.freeze(row)
  }
  Object.freeze(board)
  const legal = allLegalMovesChecked(board, 'black')
  for (const budget of [NaN, -Infinity, -5, 0, 1, Infinity, 60_000]) {
    const expectedBudget = Number.isNaN(budget) || budget < 25 ? 25 : 3200
    let clock = 0
    const step = expectedBudget === 25 ? .25 : 1
    const { move, analysis } = withClock(() => clock += step, () => analyzeXiangqi(board, 'black', budget, 12))
    assert.ok(move)
    assert.ok(legal.some(candidate => sameMove(candidate, move)))
    assert.equal(analysis.timedOut, true)
    assert.equal(analysis.targetDepth, 12)
    assert.ok(analysis.depth >= 0 && analysis.depth <= 12)
    assert.ok(analysis.elapsedMs >= expectedBudget && analysis.elapsedMs < expectedBudget + step * 3, `${budget}: escaped controlled deadline at ${analysis.elapsedMs}`)
    assert.deepEqual(board, before)
  }
})

test('xiangqi clamps requested depth and never labels an interrupted root round as completed', () => {
  const board = position([
    '...k.....',
    '.........',
    '.........',
    '........p',
    '.........',
    '.........',
    'P........',
    '.........',
    '.........',
    '.....K...',
  ], 'black')
  const before = structuredClone(board)
  let firstCalls = 0, secondCalls = 0
  const first = withClock(() => { firstCalls++; return 0 }, () => analyzeXiangqi(board, 'black', 100, 1))
  const second = withClock(() => { secondCalls++; return 0 }, () => analyzeXiangqi(board, 'black', 100, 2))
  assert.equal(first.analysis.depth, 1)
  assert.equal(second.analysis.depth, 2)
  assert.equal(first.analysis.timedOut, false)
  assert.equal(second.analysis.timedOut, false)
  assert.ok(secondCalls > firstCalls)
  let calls = 0
  const interruption = Math.floor((firstCalls + secondCalls) / 2)
  const interrupted = withClock(() => ++calls >= interruption ? 100 : 0, () => analyzeXiangqi(board, 'black', 100, 2))
  assert.equal(interrupted.analysis.timedOut, true)
  assert.equal(interrupted.analysis.depth, 1)
  assert.deepEqual(interrupted.move, first.move, 'an incomplete deeper round replaced the last fully assessed decision')
  assert.deepEqual(board, before)
  for (const [requested, expected] of [[-1, 1], [1.9, 1], [99, 12], [NaN, 8], [Infinity, 8]]) {
    let clock = 0
    const { analysis } = withClock(() => clock += 25, () => analyzeXiangqi(board, 'black', 0, requested))
    assert.equal(analysis.targetDepth, expected)
    assert.equal(analysis.depth, 0)
    assert.equal(analysis.timedOut, true)
  }
})

test('xiangqi defends against a quiet stalemate capture and recognises stalemate as a win for either side', () => {
  const quietStalemate = [
    '....k....',
    '...P.P...',
    '.........',
    'P.......r',
    'R...P....',
    '.........',
    '.........',
    '.........',
    '.........',
    '....K....',
  ]
  const terminalWins = (board: Board, attacker: Side) => allLegalMovesChecked(board, attacker).filter(move => !allLegalMovesChecked(apply(board, move), other(attacker)).length)
  for (const defender of ['black', 'red'] as const) {
    const board = position(quietStalemate, defender)
    const before = structuredClone(board)
    const attacker = other(defender)
    const legal = allLegalMovesChecked(board, defender)
    assert.equal(inCheck(board, defender), false)
    assert.equal(inCheck(board, attacker), false)
    const safe = legal.filter(move => !terminalWins(apply(board, move), attacker).length)
    assert.ok(safe.length > 0 && safe.length < legal.length, 'independent legal-move oracle must find both safe moves and quiet terminal traps')
    const trap = legal.find(move => board[move.toR][move.toC]?.type === 'p')!
    assert.ok(trap)
    const afterTrap = apply(board, trap)
    const winning = terminalWins(afterTrap, attacker)
    assert.ok(winning.length)
    assert.ok(winning.every(move => !inCheck(apply(afterTrap, move), defender)), 'this trap must be stalemate without check, not an ordinary mating attack')
    for (const budget of [0, 1]) {
      const { move } = controlledPick(board, defender, budget, .01)
      assert.ok(move)
      assert.ok(legal.some(candidate => sameMove(candidate, move)))
      assert.equal(terminalWins(apply(board, move), attacker).length, 0)
      assert.deepEqual(board, before)
    }
    const afterBefore = structuredClone(afterTrap)
    let clock = 0
    const { move, analysis } = withClock(() => clock += .01, () => analyzeXiangqi(afterTrap, attacker, 0, 12))
    assert.ok(move)
    assert.ok(winning.some(candidate => sameMove(candidate, move)))
    assert.equal(inCheck(apply(afterTrap, move), defender), false)
    assert.equal(allLegalMovesChecked(apply(afterTrap, move), defender).length, 0)
    assert.equal(analysis.depth, 1, 'a fully proven terminal move should report its completed one-ply decision')
    assert.equal(analysis.timedOut, false)
    assert.deepEqual(afterTrap, afterBefore)
  }
})
