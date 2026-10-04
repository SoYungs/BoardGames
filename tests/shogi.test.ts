import assert from 'node:assert/strict'
import test from 'node:test'
import { applyShogiMove, createInitialBoard, emptyHand } from '../src/games/shogi/shogiBoard.ts'
import { allLegalMovesChecked, dropMoves, inCheck, legalMovesFrom, legalMovesFromChecked } from '../src/games/shogi/shogiMoves.ts'
import type { Board, Piece, PieceType, Side } from '../src/games/shogi/shogiTypes.ts'

function piece(type: PieceType, side: Side, promoted = false): Piece {
  return { id: `${side}-${type}`, side, type, promoted }
}

function boardWithKings(): Board {
  const board: Board = Array.from({ length: 9 }, () => Array(9).fill(null))
  board[8][8] = piece('k', 'sente')
  board[0][0] = piece('k', 'gote')
  return board
}

function squares(board: Board, r: number, c: number): string[] {
  return legalMovesFrom(board, r, c).map((move) => `${move.toR},${move.toC}`).sort()
}

test('gold generals and promoted minor pieces use exactly the six gold directions for either side', () => {
  for (const side of ['sente', 'gote'] as const) {
    for (const type of ['g', 's', 'n', 'l', 'p'] as const) {
      const board = boardWithKings()
      board[4][4] = piece(type, side, type !== 'g')
      const forward = side === 'sente' ? 3 : 5
      const backward = side === 'sente' ? 5 : 3
      assert.deepEqual(squares(board, 4, 4), [
        `${forward},3`, `${forward},4`, `${forward},5`, '4,3', '4,5', `${backward},4`,
      ].sort())
    }
  }
})

test('a pinned piece cannot expose its king, even if every raw destination is illegal', () => {
  const board = boardWithKings()
  board[8][8] = null
  board[8][4] = piece('k', 'sente')
  board[0][4] = piece('r', 'gote')
  board[7][4] = piece('n', 'sente')
  assert.equal(inCheck(board, 'sente'), false)
  assert.equal(legalMovesFrom(board, 7, 4).length, 2)
  assert.deepEqual(legalMovesFromChecked(board, emptyHand(), 7, 4), [])
  assert.equal(allLegalMovesChecked(board, emptyHand(), 'sente').some((m) => m.fromR === 7 && m.fromC === 4), false)

  board[7][4] = piece('s', 'sente')
  assert.deepEqual(legalMovesFromChecked(board, emptyHand(), 7, 4), [{ fromR: 7, fromC: 4, toR: 6, toC: 4 }])
})

test('entering, moving within, and leaving the promotion zone offer both promotion choices', () => {
  for (const side of ['sente', 'gote'] as const) {
    const mirror = (r: number) => side === 'sente' ? r : 8 - r
    for (const [from, to] of [[3, 2], [2, 1], [2, 3]]) {
      const board = boardWithKings()
      const fromR = mirror(from)
      const toR = mirror(to)
      board[fromR][4] = piece('s', side)
      const choices = legalMovesFromChecked(board, emptyHand(), fromR, 4).filter((m) => m.toR === toR && m.toC === 3)
      assert.deepEqual(choices.map((m) => m.promote), [false, true])
      for (const move of choices) {
        const next = applyShogiMove(board, emptyHand(), move, side)
        assert.equal(next.board[toR][3]?.promoted, move.promote)
        assert.equal(board[fromR][4]?.promoted, false)
      }
    }
  }
})

test('pawns, lances, and knights must promote on ranks where they would have no future move', () => {
  for (const side of ['sente', 'gote'] as const) {
    const mirror = (r: number) => side === 'sente' ? r : 8 - r
    for (const [type, from, to, toC] of [
      ['p', 1, 0, 4], ['l', 1, 0, 4], ['n', 2, 0, 3], ['n', 3, 1, 3],
    ] as const) {
      const board = boardWithKings()
      board[mirror(from)][4] = piece(type, side)
      const moves = legalMovesFromChecked(board, emptyHand(), mirror(from), 4).filter((m) => m.toR === mirror(to) && m.toC === toC)
      assert.equal(moves.length, 1)
      assert.equal(moves[0].promote, true)
      const next = applyShogiMove(board, emptyHand(), { ...moves[0], promote: false }, side)
      assert.equal(next.board[mirror(to)][toC]?.promoted, true)
    }
  }
})

function pawnMatePosition(): Board {
  const board = boardWithKings()
  board[0][0] = null
  board[0][4] = piece('k', 'gote')
  board[0][3] = piece('l', 'gote')
  board[0][5] = piece('l', 'gote')
  board[1][3] = piece('p', 'gote')
  board[1][5] = piece('p', 'gote')
  board[2][4] = piece('g', 'sente')
  return board
}

test('a pawn drop that gives immediate mate is forbidden for either side', () => {
  const board = pawnMatePosition()
  const hand = { sente: ['p' as const], gote: ['g' as const] }
  assert.equal(dropMoves(board, hand, 'sente').some((m) => m.toR === 1 && m.toC === 4), true)
  assert.equal(allLegalMovesChecked(board, hand, 'sente').some((m) => m.dropType === 'p' && m.toR === 1 && m.toC === 4), false)
  const mirrored = board.map((row) => row.map((p) => p ? { ...p, side: p.side === 'sente' ? 'gote' as const : 'sente' as const } : null)).reverse()
  assert.equal(allLegalMovesChecked(mirrored, { sente: [], gote: ['p'] }, 'gote').some((m) => m.dropType === 'p' && m.toR === 7 && m.toC === 4), false)
})

test('checking pawn drops remain legal if the king can escape or a defender can capture the pawn', () => {
  const board = pawnMatePosition()
  const hand = { sente: ['p' as const], gote: [] }
  board[0][3] = null
  assert.equal(allLegalMovesChecked(board, hand, 'sente').some((m) => m.dropType === 'p' && m.toR === 1 && m.toC === 4), true)

  board[0][3] = piece('l', 'gote')
  board[2][3] = piece('s', 'gote')
  assert.equal(allLegalMovesChecked(board, hand, 'sente').some((m) => m.dropType === 'p' && m.toR === 1 && m.toC === 4), true)
})

test('moving an existing pawn to give mate is legal', () => {
  const board = pawnMatePosition()
  board[2][4] = piece('p', 'sente')
  board[2][3] = piece('g', 'sente')
  const move = legalMovesFromChecked(board, emptyHand(), 2, 4).find((m) => m.toR === 1 && m.toC === 4 && m.promote === false)
  assert.ok(move)
  const next = applyShogiMove(board, emptyHand(), move, 'sente')
  assert.equal(inCheck(next.board, 'gote'), true)
  assert.deepEqual(allLegalMovesChecked(next.board, next.hand, 'gote'), [])
})

test('drops enforce nifu and dead-rank restrictions, while a promoted pawn does not cause nifu', () => {
  const board = boardWithKings()
  board[4][4] = piece('p', 'sente')
  const hand = { sente: ['p', 'l', 'n'] as PieceType[], gote: [] }
  let drops = dropMoves(board, hand, 'sente')
  assert.equal(drops.some((m) => m.dropType === 'p' && m.toC === 4), false)
  assert.equal(drops.some((m) => (m.dropType === 'p' || m.dropType === 'l') && m.toR === 0), false)
  assert.equal(drops.some((m) => m.dropType === 'n' && m.toR < 2), false)
  board[4][4] = piece('p', 'sente', true)
  drops = dropMoves(board, hand, 'sente')
  assert.equal(drops.some((m) => m.dropType === 'p' && m.toR === 3 && m.toC === 4), true)
})

test('captures return the original unpromoted type to the hand without mutating the source board', () => {
  const board = boardWithKings()
  board[4][4] = piece('r', 'sente')
  board[4][5] = piece('p', 'gote', true)
  const hand = emptyHand()
  const next = applyShogiMove(board, hand, { fromR: 4, fromC: 4, toR: 4, toC: 5 }, 'sente')
  assert.deepEqual(next.hand.sente, ['p'])
  assert.equal(next.board[4][5]?.promoted, false)
  assert.equal(board[4][5]?.promoted, true)
  assert.deepEqual(hand.sente, [])
})

test('initial position is legal and king capture is never a playable move', () => {
  const initial = createInitialBoard()
  assert.equal(inCheck(initial, 'sente'), false)
  assert.equal(inCheck(initial, 'gote'), false)
  assert.ok(allLegalMovesChecked(initial, emptyHand(), 'sente').length > 0)

  const board = boardWithKings()
  board[1][0] = piece('r', 'sente')
  assert.equal(legalMovesFromChecked(board, emptyHand(), 1, 0).some((m) => m.toR === 0 && m.toC === 0), false)
})
