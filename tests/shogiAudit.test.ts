import assert from 'node:assert/strict'
import test from 'node:test'
import { applyShogiMove, createInitialBoard, emptyHand } from '../src/games/shogi/shogiBoard.ts'
import { allLegalMovesChecked, inCheck, legalDropMoves, legalMovesFrom, legalMovesFromChecked } from '../src/games/shogi/shogiMoves.ts'
import { pickAiMoveShogi } from '../src/games/shogi/shogiAi.ts'
import type { Board, Hand, Move, Piece, PieceType, Side } from '../src/games/shogi/shogiTypes.ts'

// Primary rules: https://www.shogi.or.jp/match/taikyoku_rules/
// Promotion/drop fouls: https://www.shogi.or.jp/knowledge/shogi/05.php
function piece(type: PieceType, side: Side, id = `${side}-${type}`, promoted = false): Piece {
  return { id, type, side, promoted }
}

function kings(): Board {
  const board: Board = Array.from({ length: 9 }, () => Array(9).fill(null))
  board[8][8] = piece('k', 'sente')
  board[0][0] = piece('k', 'gote')
  return board
}

function mirror(board: Board, side: Side): Board {
  if (side === 'sente') return board
  return board.slice().reverse().map(row => row.map(cell => cell ? {
    ...cell, side: cell.side === 'sente' ? 'gote' : 'sente',
  } : null))
}

function moveKey(move: Move): string {
  return [move.fromR, move.fromC, move.toR, move.toC, move.dropType, move.promote].join(':')
}

function random(seed: number): () => number {
  let value = seed
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296)
}

function inventory(board: Board, hand: Hand): Record<PieceType, number> {
  const counts: Record<PieceType, number> = { k: 0, r: 0, b: 0, g: 0, s: 0, n: 0, l: 0, p: 0 }
  for (const cell of board.flat()) if (cell) counts[cell.type]++
  for (const type of [...hand.sente, ...hand.gote]) counts[type]++
  return counts
}

test('promoted major pieces retain their rays, gain only adjacent extra directions, and cannot cross blockers', () => {
  for (const side of ['sente', 'gote'] as const) {
    const original = kings()
    original[4][4] = piece('r', 'sente', 'dragon', true)
    original[4][6] = piece('p', 'sente', 'own-blocker')
    original[4][2] = piece('p', 'gote', 'enemy-blocker')
    let board = mirror(original, side)
    let targets = new Set(legalMovesFrom(board, 4, 4).map(move => `${move.toR},${move.toC}`))
    const row = (r: number) => side === 'sente' ? r : 8 - r
    assert.equal(targets.size, 15)
    for (const [r, c] of [[3, 3], [3, 5], [5, 3], [5, 5], [4, 2], [0, 4], [8, 4]]) assert.ok(targets.has(`${row(r)},${c}`))
    for (const [r, c] of [[4, 6], [4, 7], [4, 1], [2, 2], [6, 6]]) assert.equal(targets.has(`${row(r)},${c}`), false)

    const diagonal = kings()
    diagonal[4][4] = piece('b', 'sente', 'horse', true)
    diagonal[2][2] = piece('p', 'sente', 'own-blocker')
    diagonal[2][6] = piece('p', 'gote', 'enemy-blocker')
    board = mirror(diagonal, side)
    targets = new Set(legalMovesFrom(board, 4, 4).map(move => `${move.toR},${move.toC}`))
    assert.equal(targets.size, 14)
    for (const [r, c] of [[3, 4], [5, 4], [4, 3], [4, 5], [3, 3], [2, 6], [8, 0]]) assert.ok(targets.has(`${row(r)},${c}`))
    for (const [r, c] of [[2, 2], [1, 1], [1, 7], [2, 4], [4, 2]]) assert.equal(targets.has(`${row(r)},${c}`), false)
    assert.equal(legalMovesFrom(board, 4, 4).length, targets.size)
  }
})

test('unpromoted knights jump only forward and lances cannot cross either friendly or enemy pieces', () => {
  for (const side of ['sente', 'gote'] as const) {
    const original = kings()
    original[4][4] = piece('n', 'sente')
    for (const c of [3, 4, 5]) original[3][c] = piece('p', 'sente', `blocker-${c}`)
    const board = mirror(original, side)
    const row = (r: number) => side === 'sente' ? r : 8 - r
    assert.deepEqual(legalMovesFrom(board, 4, 4).map(move => [move.toR, move.toC]).sort(), [[row(2), 3], [row(2), 5]].sort())
    original[4][4] = piece('l', 'sente')
    original[3][4] = null
    original[1][4] = piece('p', 'gote')
    assert.deepEqual(legalMovesFrom(mirror(original, side), 4, 4).map(move => move.toR).sort(), [row(3), row(2), row(1)].sort())
    original[1][4] = piece('p', 'sente')
    assert.deepEqual(legalMovesFrom(mirror(original, side), 4, 4).map(move => move.toR).sort(), [row(3), row(2)].sort())
  }
})

test('a held piece may interpose on a sliding check but cannot interpose on a knight check', () => {
  for (const side of ['sente', 'gote'] as const) {
    const original = kings()
    original[8][8] = null
    original[8][4] = piece('k', 'sente')
    original[2][4] = piece('r', 'gote')
    const hand: Hand = { sente: [], gote: [] }
    hand[side] = ['g']
    const row = (r: number) => side === 'sente' ? r : 8 - r
    const board = mirror(original, side)
    assert.equal(inCheck(board, side), true)
    assert.deepEqual([...legalDropMoves(board, hand, side)].map(move => [move.toR, move.toC]).sort(), [3, 4, 5, 6, 7].map(r => [row(r), 4]).sort())
    original[2][4] = null
    original[6][3] = piece('n', 'gote')
    assert.equal(inCheck(mirror(original, side), side), true)
    assert.deepEqual([...legalDropMoves(mirror(original, side), hand, side)], [])
  }
})

test('a pinned defender cannot make an otherwise mating pawn drop legal', () => {
  const board = kings()
  board[0][0] = null
  board[0][4] = piece('k', 'gote')
  board[0][3] = piece('l', 'gote', 'left')
  board[0][5] = piece('l', 'gote', 'right')
  board[1][3] = piece('p', 'gote', 'left-pawn')
  board[1][5] = piece('g', 'gote')
  board[2][4] = piece('g', 'sente')
  board[2][6] = piece('b', 'sente')
  const hand: Hand = { sente: ['p'], gote: [] }
  // The gold can capture 1,4 geometrically, but moving it uncovers the bishop.
  const dropped = applyShogiMove(board, hand, { toR: 1, toC: 4, dropType: 'p' }, 'sente')
  assert.equal(legalMovesFrom(dropped.board, 1, 5).some(move => move.toR === 1 && move.toC === 4), true)
  assert.equal(legalMovesFromChecked(dropped.board, dropped.hand, 1, 5).some(move => move.toR === 1 && move.toC === 4), false)
  assert.equal([...legalDropMoves(board, hand, 'sente')].some(move => move.toR === 1 && move.toC === 4), false)
})

test('a captured promoted piece can be dropped unpromoted in the enemy zone without changing the old board or hands', () => {
  for (const side of ['sente', 'gote'] as const) {
    const original = kings()
    original[4][4] = piece('r', 'sente')
    original[4][5] = piece('s', 'gote', 'promoted-silver', true)
    const board = mirror(original, side), hand = emptyHand()
    const before = structuredClone({ board, hand })
    const captured = applyShogiMove(board, hand, { fromR: 4, fromC: 4, toR: 4, toC: 5 }, side)
    const toR = side === 'sente' ? 1 : 7
    const move = [...legalDropMoves(captured.board, captured.hand, side)].find(move => move.toR === toR && move.toC === 6)
    assert.ok(move)
    const dropped = applyShogiMove(captured.board, captured.hand, move, side)
    assert.equal(dropped.board[toR][6]?.type, 's')
    assert.equal(dropped.board[toR][6]?.promoted, false)
    assert.deepEqual(dropped.hand[side], [])
    assert.deepEqual({ board, hand }, before)
    assert.deepEqual(captured.hand[side], ['s'])
  }
})

test('seeded legal shogi sequences conserve all physical piece types, king safety, nifu and immutable history', () => {
  const expected = inventory(createInitialBoard(), emptyHand())
  for (const seed of [7, 29, 83, 127]) {
    let board = createInitialBoard(), hand = emptyHand(), turn: Side = 'sente'
    const choose = random(seed)
    for (let ply = 0; ply < 80; ply++) {
      const before = structuredClone({ board, hand })
      const legal = allLegalMovesChecked(board, hand, turn)
      assert.equal(new Set(legal.map(moveKey)).size, legal.length)
      if (!legal.length) break
      const move = legal[Math.floor(choose() * legal.length)]
      const next = applyShogiMove(board, hand, move, turn)
      assert.deepEqual({ board, hand }, before)
      assert.equal(inCheck(next.board, turn), false, `seed ${seed}, ply ${ply}`)
      assert.deepEqual(inventory(next.board, next.hand), expected)
      assert.equal(new Set(next.board.flat().filter(Boolean).map(cell => cell!.id)).size, next.board.flat().filter(Boolean).length)
      for (const side of ['sente', 'gote'] as const) {
        assert.equal(next.board.flat().filter(cell => cell?.side === side && cell.type === 'k').length, 1)
        for (let c = 0; c < 9; c++) assert.ok(next.board.filter(row => row[c]?.side === side && row[c]?.type === 'p' && !row[c]?.promoted).length <= 1)
      }
      for (let r = 0; r < 9; r++) for (const cell of next.board[r]) {
        if (!cell) continue
        assert.equal(cell.promoted && (cell.type === 'k' || cell.type === 'g'), false)
        if (!cell.promoted && (cell.type === 'p' || cell.type === 'l')) assert.notEqual(r, cell.side === 'sente' ? 0 : 8)
        if (!cell.promoted && cell.type === 'n') assert.ok(cell.side === 'sente' ? r >= 2 : r <= 6)
      }
      board = next.board
      hand = next.hand
      turn = turn === 'sente' ? 'gote' : 'sente'
    }
  }
})

test('a shogi AI timeout returns a legal check evasion or null for a mate without mutating its inputs', () => {
  const originalClock = Object.getOwnPropertyDescriptor(performance, 'now')
  for (const side of ['sente', 'gote'] as const) {
    const original = kings()
    original[8][8] = null
    original[8][4] = piece('k', 'sente')
    original[2][4] = piece('r', 'gote')
    const board = mirror(original, side), hand = emptyHand()
    hand[side] = ['g']
    const before = structuredClone({ board, hand })
    const legal = allLegalMovesChecked(board, hand, side)
    let tick = 0
    Object.defineProperty(performance, 'now', { configurable: true, value: () => tick += 30 })
    let move: Move | null
    try { move = pickAiMoveShogi(board, hand, side, 0) } finally {
      if (originalClock) Object.defineProperty(performance, 'now', originalClock)
      else Reflect.deleteProperty(performance, 'now')
    }
    assert.ok(move)
    assert.ok(legal.some(candidate => moveKey(candidate) === moveKey(move!)))
    assert.equal(inCheck(applyShogiMove(board, hand, move, side).board, side), false)
    assert.deepEqual({ board, hand }, before)
  }
  // Adjacent protected rook mate: the king cannot take it or escape sideways.
  const board = kings()
  board[0][0] = null
  board[0][4] = piece('k', 'gote')
  board[1][4] = piece('r', 'sente')
  board[2][4] = piece('g', 'sente')
  board[0][3] = piece('l', 'gote', 'left')
  board[0][5] = piece('l', 'gote', 'right')
  assert.equal(inCheck(board, 'gote'), true)
  assert.deepEqual(allLegalMovesChecked(board, emptyHand(), 'gote'), [])
  assert.equal(pickAiMoveShogi(board, emptyHand(), 'gote', 0), null)
})
