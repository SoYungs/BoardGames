import assert from 'node:assert/strict'
import test from 'node:test'
import { boundedAiBudget, searchBestMove, type SearchAdapter } from '../src/games/ai/search.ts'
import { applyMove as chessApply, initialMeta } from '../src/games/chess/chessBoard.ts'
import { allLegalMovesChecked as chessMoves, inCheck as chessCheck, legalMovesFromChecked as chessFrom, pickAiMoveChess } from '../src/games/chess/chessMoves.ts'
import type { Piece as ChessPiece } from '../src/games/chess/chessTypes.ts'
import { allLegalMovesChecked as xiangqiMoves, inCheck as xiangqiCheck, legalMovesFromChecked as xiangqiFrom, pickAiMoveXiangqi } from '../src/games/xiangqi/xiangqiMoves.ts'
import type { Piece as XiangqiPiece } from '../src/games/xiangqi/xiangqiTypes.ts'
import { emptyHand } from '../src/games/shogi/shogiBoard.ts'
import { allLegalMovesChecked as shogiMoves, pickAiMoveShogi } from '../src/games/shogi/shogiMoves.ts'
import type { Piece as ShogiPiece } from '../src/games/shogi/shogiTypes.ts'
import { emptyBoard as gomokuBoard, pickAiMove } from '../src/games/gomoku/gomokuLogic.ts'
import { applyMove as junqiApply } from '../src/games/junqi/junqiBoard.ts'
import { resolveCombat } from '../src/games/junqi/junqiCombat.ts'
import { allLegalMoves as junqiMoves, getWinnerJunqi, pickAiMoveJunqi } from '../src/games/junqi/junqiMoves.ts'
import type { Piece as JunqiPiece } from '../src/games/junqi/junqiTypes.ts'

function board<P>(rows: number, columns: number): (P | null)[][] {
  return Array.from({ length: rows }, () => Array<P | null>(columns).fill(null))
}
const sameMove = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// These budgets exercise the tactical fallback, not a stronger/slower mode.
const budgets = [0, 1, 800]

test('root generation timing out preserves the best completely assessed safe fallback', () => {
  let clock = 0
  const adapter: SearchAdapter<string, string, number> = {
    *moves(_position, _side, check) {
      yield 'unsafe'
      check()
      yield 'safe'
      clock = 20
      check()
      yield 'too-late'
    },
    apply: (_position, move) => move,
    other: side => -side,
    evaluate: () => assert.fail('expired preflight started a deeper search'),
    order: (_position, move) => move === 'unsafe' ? 100 : 0,
    fallback: (_position, move) => move === 'safe' ? 20 : -50,
    tactical: () => false,
    inCheck: () => false,
    terminal: () => 0,
  }
  assert.equal(searchBestMove('root', 1, adapter, { budgetMs: 20, now: () => clock }), 'safe')
})

test('quiescence must answer check even when the nominal capture depth is zero', () => {
  const adapter: SearchAdapter<string, string, number> = {
    *moves(position, _side, check) {
      const moves = position === 'root' ? ['checking-capture', 'safe'] : position === 'checking-capture' ? ['forced-reply'] : ['quiet']
      for (const move of moves) { check(); yield move }
    },
    apply: (_position, move) => move,
    other: side => -side,
    evaluate: position => position === 'checking-capture' ? -100 : position === 'forced-reply' ? -500 : -10,
    order: () => 0,
    tactical: () => false,
    inCheck: position => position === 'checking-capture',
    terminal: () => 0,
  }
  assert.equal(searchBestMove('root', 1, adapter, { budgetMs: 20, maxDepth: 1, quiescenceDepth: 0, now: () => 0 }), 'safe')
})

test('non-finite and negative budgets cannot bypass the 900ms cap or the tactical floor', () => {
  assert.equal(boundedAiBudget(Infinity, 25), 900)
  assert.equal(boundedAiBudget(NaN, 25), 25)
  assert.equal(boundedAiBudget(-Infinity, 25), 25)
  assert.equal(boundedAiBudget(-5), 0)
})

test('chess underpromotes to a rook rather than immediately stalemating with a queen, for either colour', () => {
  for (const side of ['white', 'black'] as const) {
    const position = board<ChessPiece>(8, 8)
    const mirror = (r: number) => side === 'white' ? r : 7 - r
    const opponent = side === 'white' ? 'black' : 'white'
    position[mirror(2)][2] = { id: 'own-king', side, type: 'k' }
    position[mirror(1)][2] = { id: 'pawn', side, type: 'p' }
    position[mirror(1)][0] = { id: 'opponent-king', side: opponent, type: 'k' }
    const meta = initialMeta()
    const queen = chessFrom(position, meta, mirror(1), 2).find(move => move.promotion === 'q')!
    const drawn = chessApply(position, meta, queen)
    assert.equal(chessCheck(drawn.board, opponent), false)
    assert.equal(chessMoves(drawn.board, drawn.meta, opponent).length, 0)
    for (const budget of budgets) {
      const move = pickAiMoveChess(position, meta, side, budget)
      assert.ok(move)
      assert.equal(move.promotion, 'r')
      const next = chessApply(position, meta, move)
      assert.ok(chessMoves(next.board, next.meta, opponent).length)
    }
  }
})

test('chess avoids a quiet mate in one instead of grabbing an undefended rook', () => {
  const position = board<ChessPiece>(8, 8)
  position[7][7] = { id: 'wk', side: 'white', type: 'k' }
  position[6][7] = { id: 'whp', side: 'white', type: 'p' }
  position[6][6] = { id: 'wgp', side: 'white', type: 'p' }
  position[4][3] = { id: 'wq', side: 'white', type: 'q' }
  position[0][0] = { id: 'bk', side: 'black', type: 'k' }
  position[5][6] = { id: 'bq', side: 'black', type: 'q' }
  position[2][2] = { id: 'bb', side: 'black', type: 'b' }
  position[4][1] = { id: 'br', side: 'black', type: 'r' }
  const meta = initialMeta()
  const afterGreedy = chessApply(position, meta, { fromR: 4, fromC: 3, toR: 4, toC: 1 })
  const mates = (next: ReturnType<typeof chessApply>) => chessMoves(next.board, next.meta, 'black').filter(reply => {
    const after = chessApply(next.board, next.meta, reply)
    return chessCheck(after.board, 'white') && !chessMoves(after.board, after.meta, 'white').length
  })
  assert.ok(mates(afterGreedy).length)
  for (const budget of budgets) {
    const move = pickAiMoveChess(position, meta, 'white', budget)
    assert.ok(move)
    assert.equal(mates(chessApply(position, meta, move)).length, 0)
  }
})

test('chess safety fallback does not count a pinned knight as a legal recapturer', () => {
  const position = board<ChessPiece>(8, 8)
  position[7][7] = { id: 'wk', side: 'white', type: 'k' }
  position[0][4] = { id: 'bk', side: 'black', type: 'k' }
  position[7][4] = { id: 'wr', side: 'white', type: 'r' }
  position[4][3] = { id: 'wq', side: 'white', type: 'q' }
  position[2][4] = { id: 'bn', side: 'black', type: 'n' }
  position[3][2] = { id: 'br', side: 'black', type: 'r' }
  const move = pickAiMoveChess(position, initialMeta(), 'white', 0)
  assert.deepEqual(move, { fromR: 4, fromC: 3, toR: 3, toC: 2 })
})

test('extremely short chess, xiangqi and shogi searches still avoid a protected pawn that loses a major piece', () => {
  const chess = board<ChessPiece>(8, 8)
  chess[7][7] = { id: 'wk', side: 'white', type: 'k' }
  chess[0][0] = { id: 'bk', side: 'black', type: 'k' }
  chess[4][3] = { id: 'wq', side: 'white', type: 'q' }
  chess[4][4] = { id: 'bp', side: 'black', type: 'p' }
  chess[0][4] = { id: 'br', side: 'black', type: 'r' }
  const xiangqi = board<XiangqiPiece>(10, 9)
  xiangqi[9][4] = { id: 'rk', side: 'red', type: 'k' }
  xiangqi[0][4] = { id: 'bk', side: 'black', type: 'k' }
  xiangqi[5][4] = { id: 'rp', side: 'red', type: 'p' }
  xiangqi[5][0] = { id: 'rr', side: 'red', type: 'r' }
  xiangqi[5][1] = { id: 'bp', side: 'black', type: 'p' }
  xiangqi[0][1] = { id: 'br', side: 'black', type: 'r' }
  const shogi = board<ShogiPiece>(9, 9)
  shogi[8][8] = { id: 'sk', side: 'sente', type: 'k', promoted: false }
  shogi[0][8] = { id: 'gk', side: 'gote', type: 'k', promoted: false }
  shogi[4][0] = { id: 'sr', side: 'sente', type: 'r', promoted: false }
  shogi[4][1] = { id: 'gp', side: 'gote', type: 'p', promoted: false }
  shogi[0][1] = { id: 'gr', side: 'gote', type: 'r', promoted: false }
  const meta = initialMeta(), hand = emptyHand()
  for (const budget of [0, 1]) {
    const cm = pickAiMoveChess(chess, meta, 'white', budget)
    const xm = pickAiMoveXiangqi(xiangqi, 'red', budget)
    const sm = pickAiMoveShogi(shogi, hand, 'sente', budget)
    assert.ok(cm && xm && sm)
    assert.ok(chessMoves(chess, meta, 'white').some(move => sameMove(move, cm)))
    assert.ok(xiangqiMoves(xiangqi, 'red').some(move => sameMove(move, xm)))
    assert.ok(shogiMoves(shogi, hand, 'sente').some(move => sameMove(move, sm)))
    assert.equal(cm.toR === 4 && cm.toC === 4, false)
    assert.equal(xm.toR === 5 && xm.toC === 1, false)
    assert.equal(sm.toR === 4 && sm.toC === 1, false)
  }
})

test('legal chess moves never capture the opposing king', () => {
  const position = board<ChessPiece>(8, 8)
  position[7][4] = { id: 'wk', side: 'white', type: 'k' }
  position[0][4] = { id: 'bk', side: 'black', type: 'k' }
  position[1][4] = { id: 'wr', side: 'white', type: 'r' }
  assert.equal(chessFrom(position, initialMeta(), 1, 4).some(move => move.toR === 0 && move.toC === 4), false)
})

test('moving or capturing an extra rook outside the home rank preserves original castling rights', () => {
  for (const side of ['white', 'black'] as const) {
    const position = board<ChessPiece>(8, 8)
    const home = side === 'white' ? 7 : 0
    const otherRow = side === 'white' ? 4 : 3
    const opponent = side === 'white' ? 'black' : 'white'
    position[home][4] = { id: 'king', side, type: 'k' }
    position[home][7] = { id: 'original-rook', side, type: 'r' }
    position[otherRow][7] = { id: 'extra-rook', side, type: 'r' }
    position[otherRow][6] = { id: 'capturer', side: opponent, type: 'q' }
    assert.equal(chessApply(position, initialMeta(), { fromR: otherRow, fromC: 7, toR: otherRow - 1, toC: 7 }).meta.castling[side].kingside, true)
    assert.equal(chessApply(position, initialMeta(), { fromR: otherRow, fromC: 6, toR: otherRow, toC: 7 }).meta.castling[side].kingside, true)
  }
})

test('optimized xiangqi checks preserve facing generals, cannon screens and blocked horse legs', () => {
  const position = board<XiangqiPiece>(10, 9)
  position[0][4] = { id: 'bk', side: 'black', type: 'k' }
  position[9][4] = { id: 'rk', side: 'red', type: 'k' }
  assert.equal(xiangqiCheck(position, 'red'), true)
  assert.equal(xiangqiCheck(position, 'black'), true)
  position[4][4] = { id: 'screen', side: 'red', type: 'p' }
  assert.equal(xiangqiCheck(position, 'red'), false)
  assert.equal(xiangqiFrom(position, 4, 4).some(move => move.toC !== 4), false)
  position[0][4] = null
  position[0][3] = { id: 'bk', side: 'black', type: 'k' }
  position[2][4] = { id: 'cannon', side: 'black', type: 'c' }
  assert.equal(xiangqiCheck(position, 'red'), true)
  position[6][4] = { id: 'second-screen', side: 'red', type: 'p' }
  assert.equal(xiangqiCheck(position, 'red'), false)
  position[2][4] = position[4][4] = position[6][4] = null
  position[7][3] = { id: 'horse', side: 'black', type: 'n' }
  assert.equal(xiangqiCheck(position, 'red'), true)
  position[8][3] = { id: 'horse-leg', side: 'red', type: 'p' }
  assert.equal(xiangqiCheck(position, 'red'), false)
})

test('gomoku short-budget fallback defends a distant open three', () => {
  const position = gomokuBoard()
  position[7][7] = 2
  for (const c of [8, 9, 10]) position[2][c] = 1
  const before = structuredClone(position)
  for (const budget of budgets) {
    const move = pickAiMove(position, 2, budget)
    assert.ok(move)
    assert.equal(move[0], 2)
    assert.ok(move[1] === 7 || move[1] === 11)
  }
  assert.deepEqual(position, before)
})

test('gomoku prevents the intersection that would form two open fours', () => {
  const position = gomokuBoard()
  position[7][7] = 2
  for (const c of [7, 8, 9]) position[4][c] = 1
  for (const r of [1, 2, 3]) position[r][10] = 1
  for (const budget of budgets) assert.deepEqual(pickAiMove(position, 2, budget), [4, 10])
})

function bombFlagPosition() {
  const position = board<JunqiPiece>(6, 12)
  position[5][5] = { id: 'rf', side: 'red', type: 'flag', revealed: false }
  position[0][6] = { id: 'bf', side: 'blue', type: 'flag', revealed: false }
  position[4][5] = { id: 'bomb', side: 'red', type: 'bomb', revealed: true }
  position[3][5] = { id: 'bc', side: 'blue', type: 'commander', revealed: true }
  position[1][5] = { id: 'attacker', side: 'blue', type: 'company', revealed: true }
  position[2][4] = { id: 'guard', side: 'red', type: 'company', revealed: true }
  return position
}

test('junqi evaluates the actual double-death branch and does not open an immediate flag capture', () => {
  const position = bombFlagPosition()
  const losing = junqiApply(position, { fromR: 4, fromC: 5, toR: 3, toC: 5 }, 'both')
  assert.ok(junqiMoves(losing, 'blue').some(move => move.toR === 5 && move.toC === 5))
  for (const budget of budgets) {
    const move = pickAiMoveJunqi(position, 'red', budget)
    assert.ok(move)
    const attacker = position[move.fromR][move.fromC]!
    const defender = position[move.toR][move.toC]
    const next = junqiApply(position, move, defender ? resolveCombat(attacker, defender) : 'none')
    assert.equal(junqiMoves(next, 'blue').some(reply => reply.toR === 5 && reply.toC === 5), false)
  }
})

test('junqi does not imprison its last mobile piece in headquarters when the opponent can still move', () => {
  const position = board<JunqiPiece>(6, 12)
  position[5][5] = { id: 'rf', side: 'red', type: 'flag', revealed: false }
  position[0][6] = { id: 'bf', side: 'blue', type: 'flag', revealed: false }
  position[0][5] = { id: 'company', side: 'blue', type: 'company', revealed: true }
  position[1][5] = { id: 'commander', side: 'red', type: 'commander', revealed: true }
  position[3][8] = { id: 'engineer', side: 'blue', type: 'engineer', revealed: true }
  for (const budget of budgets) {
    const move = pickAiMoveJunqi(position, 'red', budget)
    assert.ok(move)
    const target = position[move.toR][move.toC]
    const next = junqiApply(position, move, target ? resolveCombat(position[move.fromR][move.fromC]!, target) : 'none')
    assert.ok(junqiMoves(next, 'red').length)
  }
  position[3][8] = null
  const win = pickAiMoveJunqi(position, 'red')
  assert.ok(win)
  const next = junqiApply(position, win, position[win.toR][win.toC] ? 'attacker' : 'none')
  assert.equal(getWinnerJunqi(next, 'blue'), 'red')
})

test('junqi records only public movement facts and infers railway turning without revealing a hidden rank', () => {
  const position = board<JunqiPiece>(6, 12)
  position[1][1] = { id: 'engineer', side: 'blue', type: 'engineer', revealed: false }
  const next = junqiApply(position, { fromR: 1, fromC: 1, toR: 4, toC: 6 }, 'none')
  assert.equal(next[4][6]?.hasMoved, true)
  assert.equal(next[4][6]?.hasTurned, true)
  assert.equal(next[4][6]?.revealed, false)
  assert.equal(position[1][1]?.hasMoved, undefined)
})

test('junqi does not assume a previously moved hidden HQ occupant could be a flag', () => {
  const position = board<JunqiPiece>(6, 12)
  position[5][5] = { id: 'rf', side: 'red', type: 'flag', revealed: false }
  position[0][6] = { id: 'bf', side: 'blue', type: 'flag', revealed: false }
  position[0][5] = { id: 'hidden-hq', side: 'blue', type: 'commander', revealed: false, hasMoved: true }
  position[1][6] = { id: 'blocker', side: 'blue', type: 'company', revealed: true }
  position[1][5] = { id: 'engineer', side: 'red', type: 'engineer', revealed: false }
  position[3][0] = { id: 'other-mobile', side: 'red', type: 'company', revealed: false }
  Object.defineProperty(position[0][5], 'type', { get: () => assert.fail('hidden HQ identity inspected') })
  for (const budget of budgets) {
    const move = pickAiMoveJunqi(position, 'red', budget)
    assert.ok(move)
    assert.equal(move.toR === 0 && move.toC === 5, false)
  }
})
