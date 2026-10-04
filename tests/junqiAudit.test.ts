import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMove, createInitialBoard, isCamp, isHeadquarters, isRailway } from '../src/games/junqi/junqiBoard.ts'
import { canMoveType, resolveCombat } from '../src/games/junqi/junqiCombat.ts'
import { allLegalMoves, getWinnerJunqi, legalMovesFrom } from '../src/games/junqi/junqiMoves.ts'
import { pickAiMoveJunqi } from '../src/games/junqi/junqiAi.ts'
import { piecePool } from '../src/games/junqi/junqiTypes.ts'
import type { Board, Move, Piece, PieceType, Side } from '../src/games/junqi/junqiTypes.ts'

// Primary provider rules: https://www.ourgame.com/game/junqi.html
// The board/deployment geometry here follows the README's 6x12 variant.
function piece(type: PieceType, side: Side, id = `${side}-${type}`, revealed = false): Piece {
  return { id, type, side, revealed }
}

function empty(): Board {
  return Array.from({ length: 6 }, () => Array(12).fill(null))
}

function random(seed: number): () => number {
  let value = seed
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296)
}

function moveKey(move: Move): string {
  return [move.fromR, move.fromC, move.toR, move.toC].join(':')
}

test('every ordinary rank combat is symmetric, equal ranks trade, and mine/bomb/flag exceptions override ranks', () => {
  const ranks: PieceType[] = ['commander', 'army', 'division', 'brigade', 'regiment', 'battalion', 'company', 'platoon', 'engineer']
  for (let a = 0; a < ranks.length; a++) for (let d = 0; d < ranks.length; d++) {
    assert.equal(resolveCombat(piece(ranks[a], 'red'), piece(ranks[d], 'blue')), a < d ? 'attacker' : a > d ? 'defender' : 'both')
  }
  for (const type of ranks) {
    assert.equal(resolveCombat(piece(type, 'red'), piece('mine', 'blue')), type === 'engineer' ? 'attacker' : 'defender')
    assert.equal(resolveCombat(piece(type, 'red'), piece('bomb', 'blue')), 'both')
    assert.equal(resolveCombat(piece('bomb', 'red'), piece(type, 'blue')), 'both')
    assert.equal(resolveCombat(piece(type, 'red'), piece('flag', 'blue')), 'attacker')
  }
  assert.equal(resolveCombat(piece('bomb', 'red'), piece('mine', 'blue')), 'both')
  assert.equal(resolveCombat(piece('bomb', 'red'), piece('bomb', 'blue')), 'both')
  assert.equal(resolveCombat(piece('bomb', 'red'), piece('flag', 'blue')), 'attacker')
  assert.equal(canMoveType('mine'), false)
  assert.equal(canMoveType('flag'), false)
})

test('camps protect both sides, but an occupant may leave or attack outside the camp', () => {
  for (const side of ['red', 'blue'] as const) {
    const enemy: Side = side === 'red' ? 'blue' : 'red'
    const board = empty()
    board[1][2] = piece('company', side)
    board[2][2] = piece('platoon', enemy)
    assert.equal(legalMovesFrom(board, 2, 2, enemy).some(move => move.toR === 1 && move.toC === 2), false)
    assert.equal(legalMovesFrom(board, 1, 2, side).some(move => move.toR === 2 && move.toC === 2), true)
    board[1][2] = null
    assert.equal(legalMovesFrom(board, 2, 2, enemy).some(move => move.toR === 1 && move.toC === 2), true)
  }
})

test('engineers can take an alternate railway route around blockers, without using an occupied camp or headquarters as transit', () => {
  const board = empty()
  board[1][1] = piece('engineer', 'red')
  board[1][5] = piece('company', 'red', 'blocker')
  const engineer = legalMovesFrom(board, 1, 1, 'red')
  assert.ok(engineer.some(move => move.toR === 1 && move.toC === 6), 'lower rail line provides an alternate path')
  board[1][1] = piece('commander', 'red')
  assert.equal(legalMovesFrom(board, 1, 1, 'red').some(move => move.toR === 1 && move.toC === 6), false)
  board[1][1] = piece('engineer', 'red')
  board[2][1] = piece('mine', 'red')
  board[1][2] = piece('company', 'blue')
  assert.deepEqual(legalMovesFrom(board, 1, 1, 'red').map(move => [move.toR, move.toC]).sort(), [[0, 1], [1, 0]].sort())

  const headquarters = empty()
  headquarters[1][5] = piece('engineer', 'red')
  headquarters[1][4] = piece('company', 'red', 'left-blocker')
  headquarters[1][6] = piece('company', 'red', 'right-blocker')
  headquarters[2][5] = piece('mine', 'red')
  assert.deepEqual(legalMovesFrom(headquarters, 1, 5, 'red'), [{ fromR: 1, fromC: 5, toR: 0, toC: 5 }])
  const entered = applyMove(headquarters, { fromR: 1, fromC: 5, toR: 0, toC: 5 }, 'none')
  assert.deepEqual(legalMovesFrom(entered, 0, 5, 'red'), [])
})

test('both flags and last-mobile-piece losses determine a symmetric winner even when stationary pieces remain', () => {
  for (const side of ['red', 'blue'] as const) {
    const enemy: Side = side === 'red' ? 'blue' : 'red'
    const board = empty()
    board[0][6] = piece('flag', 'blue')
    board[5][6] = piece('flag', 'red')
    board[2][3] = piece('company', side)
    board[3][3] = piece('company', enemy)
    const move = { fromR: 2, fromC: 3, toR: 3, toC: 3 }
    const next = applyMove(board, move, resolveCombat(board[2][3]!, board[3][3]!))
    assert.equal(getWinnerJunqi(next, enemy), side, 'next side loses when the equal-rank exchange removes its last mobile piece')
    board[3][8] = piece('mine', enemy)
    const withMine = applyMove(board, move, 'both')
    assert.equal(getWinnerJunqi(withMine, enemy), side)
    board[3][8] = piece('company', enemy)
    assert.equal(getWinnerJunqi(applyMove(board, move, 'both'), enemy), null)
  }
})

test('seeded legal junqi sequences preserve old boards, count combat casualties, and never move a mine, flag or headquarters occupant', () => {
  for (const seed of [11, 47, 109, 211, 397, 521]) {
    const choose = random(seed)
    let board = createInitialBoard(choose), turn: Side = 'red'
    for (let ply = 0; ply < 100 && getWinnerJunqi(board, turn) === null; ply++) {
      const before = structuredClone(board)
      const legal = allLegalMoves(board, turn)
      assert.ok(legal.length)
      assert.equal(new Set(legal.map(moveKey)).size, legal.length)
      const move = legal[Math.floor(choose() * legal.length)]
      const attacker = board[move.fromR][move.fromC]!, defender = board[move.toR][move.toC]
      assert.equal(attacker.side, turn)
      assert.equal(canMoveType(attacker.type), true)
      assert.equal(isHeadquarters(move.fromR, move.fromC), false)
      assert.equal(defender?.side === turn, false)
      assert.equal(Boolean(defender) && isCamp(move.toR, move.toC), false)
      const result = defender ? resolveCombat(attacker, defender) : 'none'
      const next = applyMove(board, move, result)
      assert.deepEqual(board, before)
      const casualties = defender ? result === 'both' ? 2 : 1 : 0
      assert.equal(next.flat().filter(Boolean).length, board.flat().filter(Boolean).length - casualties)
      assert.equal(new Set(next.flat().filter(Boolean).map(cell => cell!.id)).size, next.flat().filter(Boolean).length)
      assert.equal(next[move.fromR][move.fromC], null)
      for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) {
        if ((r === move.fromR && c === move.fromC) || (r === move.toR && c === move.toC)) continue
        assert.equal(next[r][c], board[r][c])
      }
      const survivor = next[move.toR][move.toC]
      if (survivor && (!defender || result === 'attacker')) {
        assert.equal(survivor.id, attacker.id)
        assert.equal(survivor.hasMoved, true)
        assert.equal(survivor.revealed, defender ? true : attacker.revealed)
        if (move.fromR !== move.toR && move.fromC !== move.toC) {
          assert.equal(attacker.type, 'engineer')
          assert.equal(isRailway(move.fromR, move.fromC), true)
          assert.equal(survivor.hasTurned, true)
        }
      }
      if (defender && result === 'defender') {
        assert.equal(survivor?.id, defender.id)
        assert.equal(survivor?.revealed, true)
      }
      board = next
      turn = turn === 'red' ? 'blue' : 'red'
    }
  }
})

test('hidden enemy ranks remain unreadable through every AI combat hypothesis and changing only hidden ranks cannot change its decision', () => {
  const originalClock = Object.getOwnPropertyDescriptor(performance, 'now')
  for (const side of ['red', 'blue'] as const) {
    const board = createInitialBoard(random(81))
    // Include publicly inferred movement and revealed material in the same run.
    const enemy: Side = side === 'red' ? 'blue' : 'red'
    const moved = board.flat().find(cell => cell?.side === enemy && cell.type === 'engineer')!
    moved.hasMoved = true
    moved.hasTurned = true
    const revealed = board.flat().find(cell => cell?.side === enemy && cell.type === 'company')!
    revealed.revealed = true
    const before = structuredClone(board)
    const legal = allLegalMoves(board, side)
    const run = () => {
      let tick = 0
      Object.defineProperty(performance, 'now', { configurable: true, value: () => tick += .02 })
      try { return pickAiMoveJunqi(board, side, 0) } finally {
        if (originalClock) Object.defineProperty(performance, 'now', originalClock)
        else Reflect.deleteProperty(performance, 'now')
      }
    }
    const expected = run()
    for (const cell of board.flat()) if (cell?.side === enemy && !cell.revealed) {
      Object.defineProperty(cell, 'type', { configurable: true, get: () => assert.fail('AI read an enemy hidden identity') })
    }
    const actual = run()
    assert.ok(actual)
    assert.ok(legal.some(move => moveKey(move) === moveKey(actual)))
    assert.deepEqual(actual, expected)
    for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) {
      const cell = board[r][c]
      if (cell?.side === enemy && !cell.revealed) Object.defineProperty(cell, 'type', { configurable: true, writable: true, value: before[r][c]!.type })
    }
    assert.deepEqual(board, before)
    // All visible facts stay identical; private identities are permuted.
    const hidden = board.flat().filter(cell => cell?.side === enemy && !cell.revealed) as Piece[]
    const types = hidden.map(cell => cell.type).reverse()
    hidden.forEach((cell, index) => { cell.type = types[index] })
    assert.deepEqual(run(), expected)
  }
})

test('the deployment pool remains exactly one flag and three immobile mines per side', () => {
  const pool = piecePool()
  assert.equal(pool.length, 25)
  assert.equal(pool.filter(type => type === 'flag').length, 1)
  assert.equal(pool.filter(type => type === 'mine').length, 3)
  assert.equal(pool.filter(canMoveType).length, 21)
})
