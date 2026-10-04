import assert from 'node:assert/strict'
import test from 'node:test'
import { searchBestMove, type SearchAdapter } from '../src/games/ai/search.ts'
import { initialMeta, applyMove as applyChess, createInitialBoard as initialChess } from '../src/games/chess/chessBoard.ts'
import { pickAiMoveChess, allLegalMovesChecked as chessMoves, inCheck as chessCheck } from '../src/games/chess/chessMoves.ts'
import type { Piece as ChessPiece } from '../src/games/chess/chessTypes.ts'
import { applyMove as applyXiangqi, createInitialBoard as initialXiangqi } from '../src/games/xiangqi/xiangqiBoard.ts'
import { pickAiMoveXiangqi, allLegalMovesChecked as xiangqiMoves, getXiangqiWinner } from '../src/games/xiangqi/xiangqiMoves.ts'
import type { Piece as XiangqiPiece } from '../src/games/xiangqi/xiangqiTypes.ts'
import { applyShogiMove, emptyHand } from '../src/games/shogi/shogiBoard.ts'
import { pickAiMoveShogi, allLegalMovesChecked as shogiMoves, inCheck as shogiCheck } from '../src/games/shogi/shogiMoves.ts'
import type { Piece as ShogiPiece } from '../src/games/shogi/shogiTypes.ts'
import { emptyBoard as emptyGomoku, pickAiMove } from '../src/games/gomoku/gomokuLogic.ts'
import { createInitialBoard as initialJunqi } from '../src/games/junqi/junqiBoard.ts'
import { pickAiMoveJunqi, allLegalMoves as junqiMoves } from '../src/games/junqi/junqiMoves.ts'
import type { Piece as JunqiPiece } from '../src/games/junqi/junqiTypes.ts'

function board<P>(rows: number, columns: number): (P | null)[][] {
  return Array.from({ length: rows }, () => Array<P | null>(columns).fill(null))
}
const sameMove = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// The clock is controlled by the expensive work, so this checks cancellation
// semantics without relying on the speed of the computer running the test.
test('an interrupted deeper round keeps the result of the last complete round', () => {
  let clock = 0, cVisits = 0
  const adapter: SearchAdapter<string, string, number> = {
    *moves(position, _side, check) {
      for (const move of position === 'root' ? ['A', 'B', 'C'] : ['A', 'B', 'C'].includes(position) ? [`${position}1`] : []) {
        check()
        yield move
      }
    },
    apply: (_position, move) => {
      if (move === 'C' && ++cVisits === 2) clock = 100
      return move
    },
    other: side => -side,
    evaluate: position => ({ A: -5, B: -10, C: 0 }[position] ?? 0),
    order: () => 0,
    tactical: () => false,
    inCheck: () => false,
    terminal: position => position === 'A1' ? 20 : -20,
    key: (position, side) => `${position}:${side}`,
    moveKey: move => move,
  }
  assert.equal(searchBestMove('root', 1, adapter, { budgetMs: 20, maxDepth: 2, quiescenceDepth: 0, now: () => clock }), 'B')
  assert.equal(cVisits, 2)
})

test('a zero budget still supplies a legal fallback without entering evaluation', () => {
  const adapter: SearchAdapter<number, number, number> = {
    *moves(_position, _side, check) { check(); yield 7; check(); yield 8 },
    apply: () => assert.fail('zero budget entered a search'),
    other: side => -side,
    evaluate: () => assert.fail('zero budget evaluated a position'),
    order: () => assert.fail('zero budget evaluated move ordering'),
    tactical: () => false,
    inCheck: () => false,
    terminal: () => 0,
  }
  assert.equal(searchBestMove(0, 1, adapter, { budgetMs: 0, now: () => 0 }), 7)
})

test('the first complete shallow round already sees an immediate costly recapture', () => {
  const adapter: SearchAdapter<string, string, number> = {
    *moves(position, _side, check) {
      const moves = position === 'root' ? ['take-pawn', 'safe'] : position === 'take-pawn' ? ['lose-queen'] : ['quiet']
      for (const move of moves) { check(); yield move }
    },
    apply: (_position, move) => move,
    other: side => -side,
    evaluate: position => position === 'take-pawn' ? -100 : position === 'lose-queen' ? -800 : 0,
    order: (_position, move) => move === 'take-pawn' ? 100 : 0,
    tactical: (position, move) => position === 'take-pawn' && move === 'lose-queen',
    inCheck: () => false,
    terminal: () => 0,
  }
  assert.equal(searchBestMove('root', 1, adapter, { budgetMs: 20, maxDepth: 1, quiescenceDepth: 3, now: () => 0 }), 'safe')
})

test('an oversized requested budget is capped by the engine deadline', () => {
  let clock = 0
  const adapter: SearchAdapter<number, number, number> = {
    *moves(_position, _side, check) { check(); yield 1; check(); yield 2 },
    apply: (position, move) => position + move,
    other: side => -side,
    evaluate: (position, side) => position * side,
    order: (_position, move) => move,
    tactical: () => false,
    inCheck: () => false,
    terminal: () => 0,
  }
  const move = searchBestMove(0, 1, adapter, { budgetMs: 60_000, maxDepth: 32, quiescenceDepth: 0, now: () => clock++ })
  assert.ok(move === 1 || move === 2)
  assert.ok(clock >= 900 && clock < 910)
})

test('chess AI finishes mate in one instead of settling for positional gains', () => {
  const position = board<ChessPiece>(8, 8)
  position[2][5] = { id: 'wk', side: 'white', type: 'k' }
  position[2][6] = { id: 'wq', side: 'white', type: 'q' }
  position[0][7] = { id: 'bk', side: 'black', type: 'k' }
  const meta = initialMeta()
  const move = pickAiMoveChess(position, meta, 'white')
  assert.ok(move)
  const next = applyChess(position, meta, move)
  assert.equal(chessCheck(next.board, 'black'), true)
  assert.equal(chessMoves(next.board, next.meta, 'black').length, 0)
})

test('chess AI does not trade its queen for a pawn defended by a rook', () => {
  const position = board<ChessPiece>(8, 8)
  position[7][7] = { id: 'wk', side: 'white', type: 'k' }
  position[0][0] = { id: 'bk', side: 'black', type: 'k' }
  position[4][3] = { id: 'wq', side: 'white', type: 'q' }
  position[4][4] = { id: 'bp', side: 'black', type: 'p' }
  position[0][4] = { id: 'br', side: 'black', type: 'r' }
  const move = pickAiMoveChess(position, initialMeta(), 'white')
  assert.ok(move)
  assert.equal(move.fromR === 4 && move.fromC === 3 && move.toR === 4 && move.toC === 4, false)
})

test('xiangqi AI searches a forced win including positions where the general has no legal move', () => {
  const position = board<XiangqiPiece>(10, 9)
  position[0][4] = { id: 'bk', side: 'black', type: 'k' }
  position[9][4] = { id: 'rk', side: 'red', type: 'k' }
  position[5][4] = { id: 'rp', side: 'red', type: 'p' }
  position[1][3] = { id: 'rr1', side: 'red', type: 'r' }
  position[2][6] = { id: 'rr2', side: 'red', type: 'r' }
  assert.ok(xiangqiMoves(position, 'black').length)
  const move = pickAiMoveXiangqi(position, 'red')
  assert.ok(move)
  assert.equal(getXiangqiWinner(applyXiangqi(position, move.fromR, move.fromC, move.toR, move.toC), 'black'), 'red')
})

test('xiangqi AI does not lose a rook by capturing a protected pawn', () => {
  const position = board<XiangqiPiece>(10, 9)
  position[0][4] = { id: 'bk', side: 'black', type: 'k' }
  position[9][4] = { id: 'rk', side: 'red', type: 'k' }
  position[5][4] = { id: 'rp', side: 'red', type: 'p' }
  position[5][0] = { id: 'rr', side: 'red', type: 'r' }
  position[5][1] = { id: 'bp', side: 'black', type: 'p' }
  position[0][1] = { id: 'br', side: 'black', type: 'r' }
  const move = pickAiMoveXiangqi(position, 'red')
  assert.ok(move)
  assert.equal(move.fromR === 5 && move.fromC === 0 && move.toR === 5 && move.toC === 1, false)
})

test('shogi AI uses a mating gold drop while honouring legal drops', () => {
  const position = board<ShogiPiece>(9, 9)
  const place = (r: number, c: number, piece: Omit<ShogiPiece, 'id'>) => { position[r][c] = { id: `${r}:${c}`, ...piece } }
  place(8, 8, { side: 'sente', type: 'k', promoted: false })
  place(0, 4, { side: 'gote', type: 'k', promoted: false })
  for (const c of [3, 5]) {
    place(0, c, { side: 'gote', type: 'l', promoted: false })
    place(1, c, { side: 'gote', type: 'p', promoted: false })
  }
  place(2, 4, { side: 'sente', type: 'g', promoted: false })
  const hand = { sente: ['g' as const], gote: [] }
  const before = structuredClone({ position, hand })
  const move = pickAiMoveShogi(position, hand, 'sente')
  assert.ok(move)
  assert.ok(shogiMoves(position, hand, 'sente').some(candidate => sameMove(candidate, move)))
  const next = applyShogiMove(position, hand, move, 'sente')
  assert.equal(shogiCheck(next.board, 'gote'), true)
  assert.equal(shogiMoves(next.board, next.hand, 'gote').length, 0)
  assert.deepEqual({ position, hand }, before)
})

test('shogi AI does not sacrifice a rook for a pawn protected by another rook', () => {
  const position = board<ShogiPiece>(9, 9)
  position[8][8] = { id: 'sk', side: 'sente', type: 'k', promoted: false }
  position[0][8] = { id: 'gk', side: 'gote', type: 'k', promoted: false }
  position[4][0] = { id: 'sr', side: 'sente', type: 'r', promoted: false }
  position[4][1] = { id: 'gp', side: 'gote', type: 'p', promoted: false }
  position[0][1] = { id: 'gr', side: 'gote', type: 'r', promoted: false }
  const move = pickAiMoveShogi(position, emptyHand(), 'sente')
  assert.ok(move)
  assert.equal(move.fromR === 4 && move.fromC === 0 && move.toR === 4 && move.toC === 1, false)
})

test('gomoku AI creates an open four with two winning ends', () => {
  const position = emptyGomoku()
  for (const c of [6, 7, 8]) position[7][c] = 2
  position[3][3] = position[3][4] = 1
  const move = pickAiMove(position, 2)
  assert.ok(move)
  assert.equal(move[0], 7)
  assert.ok(move[1] === 5 || move[1] === 9)
})

test('junqi AI uses an engineer to remove a revealed mine and captures a revealed flag', () => {
  const position = board<JunqiPiece>(6, 12)
  position[5][5] = { id: 'rf', side: 'red', type: 'flag', revealed: false }
  position[0][5] = { id: 'bf', side: 'blue', type: 'flag', revealed: true }
  position[2][0] = { id: 're', side: 'red', type: 'engineer', revealed: false }
  position[2][1] = { id: 'bm', side: 'blue', type: 'mine', revealed: true }
  assert.deepEqual(pickAiMoveJunqi(position, 'red', 200), { fromR: 2, fromC: 0, toR: 2, toC: 1 })
  position[2][1] = { id: 'bc', side: 'blue', type: 'commander', revealed: true }
  const safeMove = pickAiMoveJunqi(position, 'red', 200)
  assert.ok(safeMove)
  assert.equal(safeMove.toR === 2 && safeMove.toC === 1, false)
  position[2][0] = null
  position[1][5] = { id: 're', side: 'red', type: 'engineer', revealed: false }
  assert.deepEqual(pickAiMoveJunqi(position, 'red', 200), { fromR: 1, fromC: 5, toR: 0, toC: 5 })
})

test('junqi AI never reads hidden enemy identities and preserves the source board', () => {
  const position = initialJunqi(() => .41)
  const legal = junqiMoves(position, 'red')
  const before = structuredClone(position)
  const expected = pickAiMoveJunqi(position, 'red', 200)
  for (const row of position) for (const piece of row) {
    if (piece?.side === 'blue' && !piece.revealed) {
      Object.defineProperty(piece, 'type', { configurable: true, get: () => assert.fail('AI inspected an enemy hidden identity') })
    }
  }
  const actual = pickAiMoveJunqi(position, 'red', 200)
  assert.ok(actual)
  assert.ok(legal.some(candidate => sameMove(candidate, actual)))
  assert.deepEqual(actual, expected)
  // Restore the test-only getter before checking the complete immutable input.
  for (let r = 0; r < position.length; r++) for (let c = 0; c < position[r].length; c++) {
    const piece = position[r][c]
    if (piece?.side === 'blue' && !piece.revealed) Object.defineProperty(piece, 'type', { value: before[r][c]!.type, configurable: true, writable: true })
  }
  assert.deepEqual(position, before)
})

test('short budgets bound all five engines and still return legal immutable results', () => {
  const chess = initialChess(), meta = initialMeta(), xiangqi = initialXiangqi(), shogi = board<ShogiPiece>(9, 9), gomoku = emptyGomoku(), junqi = initialJunqi(() => .37)
  shogi[8][4] = { id: 'sk', side: 'sente', type: 'k', promoted: false }
  shogi[0][4] = { id: 'gk', side: 'gote', type: 'k', promoted: false }
  const hand = { sente: ['p', 'l', 'n', 's', 'g', 'b', 'r'] as ShogiPiece['type'][], gote: ['p', 'l', 'n', 's', 'g', 'b', 'r'] as ShogiPiece['type'][] }
  gomoku[7][7] = 1
  gomoku[6][7] = 2
  const cases = [
    { pick: () => pickAiMoveChess(chess, meta, 'black', 40), input: { chess, meta }, legal: chessMoves(chess, meta, 'black') },
    { pick: () => pickAiMoveXiangqi(xiangqi, 'black', 40), input: { xiangqi }, legal: xiangqiMoves(xiangqi, 'black') },
    { pick: () => pickAiMoveShogi(shogi, hand, 'gote', 40), input: { shogi, hand }, legal: shogiMoves(shogi, hand, 'gote') },
    { pick: () => pickAiMove(gomoku, 2, 40), input: { gomoku }, legal: gomoku.flatMap((row, r) => row.flatMap((cell, c) => cell ? [] : [[r, c]])) },
    { pick: () => pickAiMoveJunqi(junqi, 'blue', 40), input: { junqi }, legal: junqiMoves(junqi, 'blue') },
  ]
  for (const fixture of cases) {
    const before = structuredClone(fixture.input)
    const start = performance.now()
    const move = fixture.pick()
    const elapsed = performance.now() - start
    assert.ok(move)
    assert.ok(fixture.legal.some(candidate => sameMove(candidate, move)))
    assert.deepEqual(fixture.input, before)
    // A deliberately wide margin catches runaway searches, not CPU speed.
    assert.ok(elapsed < 1_500, `40ms search unexpectedly ran for ${elapsed.toFixed(0)}ms`)
  }
})
