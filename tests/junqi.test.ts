import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMove, createInitialBoard, deployCells, isCamp, isHeadquarters } from '../src/games/junqi/junqiBoard.ts'
import { resolveCombat } from '../src/games/junqi/junqiCombat.ts'
import { allLegalMoves, getWinnerJunqi, legalMovesFrom, pickAiMoveJunqi } from '../src/games/junqi/junqiMoves.ts'
import { COLS, ROWS, piecePool } from '../src/games/junqi/junqiTypes.ts'
import type { Board, Piece, PieceType, Side } from '../src/games/junqi/junqiTypes.ts'

function seededRandom(seed: number): () => number {
  let value = seed
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 4294967296
  }
}

function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null))
}

function piece(side: Side, type: PieceType = 'engineer', id = `${side}-${type}`): Piece {
  return { id, side, type, revealed: false }
}

function destinations(board: Board, r: number, c: number, side: Side): Set<string> {
  return new Set(legalMovesFrom(board, r, c, side).map((move) => `${move.toR},${move.toC}`))
}

test('random deployment preserves all 25 pieces and protects flags from camp placement across 300 seeds', () => {
  const flagColumns = new Set<number>()
  for (let seed = 1; seed <= 300; seed++) {
    const board = createInitialBoard(seededRandom(seed))
    assert.equal(new Set(board.flat().filter(Boolean).map((p) => p!.id)).size, 50)
    for (const side of ['red', 'blue'] as const) {
      const army = board.flat().filter((p) => p?.side === side)
      assert.equal(army.length, 25)
      assert.deepEqual(army.map((p) => p!.type).sort(), piecePool().sort())
      assert.equal(deployCells(side).length, 25)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const current = board[r][c]
          if (isCamp(r, c)) assert.equal(current, null)
          if (current?.side !== side) continue
          assert.equal(r < 3 ? 'blue' : 'red', side)
          if (current.type === 'flag') {
            assert.equal(isHeadquarters(r, c), true)
            assert.equal(r, side === 'blue' ? 0 : 5)
            flagColumns.add(c)
          }
          if (current.type === 'mine') assert.equal(r, side === 'blue' ? 0 : 5)
        }
      }
      assert.ok(allLegalMoves(board, side).length > 0)
      assert.equal(getWinnerJunqi(board, side), null)
    }
  }
  assert.deepEqual([...flagColumns].sort(), [5, 6])
})

test('railway pieces keep adjacent road moves and ordinary pieces only slide in a straight line', () => {
  const board = emptyBoard()
  board[1][1] = piece('red', 'commander')
  const targets = destinations(board, 1, 1, 'red')
  assert.equal(targets.has('1,0'), true, 'road off the railway remains available')
  assert.equal(targets.has('1,10'), true)
  assert.equal(targets.has('4,1'), true)
  assert.equal(targets.has('4,6'), false, 'ordinary pieces cannot turn a railway corner')
  assert.equal(targets.size, legalMovesFrom(board, 1, 1, 'red').length, 'moves are deduplicated')
})

test('engineers turn along connected railways but cannot jump a blocker or attack occupied camps', () => {
  const board = emptyBoard()
  board[1][1] = piece('red')
  assert.equal(destinations(board, 1, 1, 'red').has('4,6'), true)
  board[1][2] = piece('blue', 'commander')
  board[2][1] = piece('red', 'mine')
  const blocked = destinations(board, 1, 1, 'red')
  assert.equal(blocked.has('1,2'), false, 'an occupied camp is safe from capture')
  assert.equal(blocked.has('1,3'), false)
  assert.equal(blocked.has('4,6'), false)
})

test('a railway capture stops at its defender instead of passing through it', () => {
  const board = emptyBoard()
  board[1][5] = piece('red', 'commander')
  board[3][5] = piece('blue', 'company')
  const targets = destinations(board, 1, 5, 'red')
  assert.equal(targets.has('3,5'), true)
  assert.equal(targets.has('4,5'), false)
})

test('headquarters can be entered and attacked, but its occupants cannot move', () => {
  const board = emptyBoard()
  board[1][5] = piece('red', 'commander')
  board[0][5] = piece('blue', 'flag')
  assert.equal(destinations(board, 1, 5, 'red').has('0,5'), true)
  board[5][6] = piece('red')
  assert.deepEqual(legalMovesFrom(board, 5, 6, 'red'), [])
  board[3][3] = piece('red', 'mine')
  board[3][4] = piece('red', 'flag')
  assert.deepEqual(legalMovesFrom(board, 3, 3, 'red'), [])
  assert.deepEqual(legalMovesFrom(board, 3, 4, 'red'), [])
})

test('applyMove never mutates an earlier board and only combat reveals surviving pieces', () => {
  const move = { fromR: 2, fromC: 5, toR: 3, toC: 5 }
  for (const outcome of ['none', 'attacker', 'defender', 'both'] as const) {
    const board = emptyBoard()
    board[2][5] = piece('red', 'company')
    if (outcome !== 'none') board[3][5] = piece('blue', 'platoon')
    const original = structuredClone(board)
    for (const row of board) {
      for (const current of row) if (current) Object.freeze(current)
      Object.freeze(row)
    }
    Object.freeze(board)
    const next = applyMove(board, move, outcome)
    assert.deepEqual(board, original)
    assert.equal(next[2][5], null)
    if (outcome === 'both') assert.equal(next[3][5], null)
    else {
      assert.equal(next[3][5]?.revealed, outcome !== 'none')
      assert.equal(next[3][5]?.side, outcome === 'defender' ? 'blue' : 'red')
      assert.notEqual(next[3][5], outcome === 'defender' ? board[3][5] : board[2][5])
    }
  }
})

test('flag capture and inability to move award a win symmetrically for both sides', () => {
  for (const side of ['red', 'blue'] as const) {
    const opponent = side === 'red' ? 'blue' : 'red'
    const board = emptyBoard()
    board[5][5] = piece('red', 'flag')
    board[0][5] = piece('blue', 'flag')
    const fromR = side === 'red' ? 1 : 4
    const toR = side === 'red' ? 0 : 5
    board[fromR][5] = piece(side, 'company')
    assert.equal(getWinnerJunqi(board, side), null)
    assert.equal(getWinnerJunqi(board, opponent), side)
    assert.equal(pickAiMoveJunqi(board, opponent), null)

    const move = { fromR, fromC: 5, toR, toC: 5 }
    const outcome = resolveCombat(board[fromR][5]!, board[toR][5]!)
    assert.equal(outcome, 'attacker')
    assert.equal(getWinnerJunqi(applyMove(board, move, outcome), opponent), side)
  }
})

test('engineers defeat mines and bombs trade with pieces', () => {
  assert.equal(resolveCombat(piece('red'), piece('blue', 'mine')), 'attacker')
  assert.equal(resolveCombat(piece('red', 'company'), piece('blue', 'mine')), 'defender')
  assert.equal(resolveCombat(piece('red', 'bomb'), piece('blue', 'mine')), 'both')
  assert.equal(resolveCombat(piece('red', 'commander'), piece('blue', 'bomb')), 'both')
})
