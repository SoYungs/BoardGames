import assert from 'node:assert/strict'
import test from 'node:test'
import { createInitialBoard, snapshotBoard } from '../src/games/xiangqi/xiangqiBoard.ts'
import { allLegalMovesChecked, getXiangqiWinner, inCheck, pickAiMoveXiangqi } from '../src/games/xiangqi/xiangqiMoves.ts'
import type { Board, PieceType, Side } from '../src/games/xiangqi/xiangqiTypes.ts'

function emptyBoard(): Board {
  return Array.from({ length: 10 }, () => Array(9).fill(null))
}

function place(board: Board, r: number, c: number, side: Side, type: PieceType) {
  board[r][c] = { id: `${side}-${type}-${r}-${c}`, side, type }
}

function stalematePosition(): Board {
  const board = emptyBoard()
  place(board, 0, 4, 'black', 'k')
  place(board, 9, 4, 'red', 'k')
  place(board, 5, 4, 'red', 'p')
  place(board, 1, 3, 'red', 'r')
  place(board, 1, 5, 'red', 'r')
  return board
}

test('xiangqi stalemate is a loss even when the general is not in check', () => {
  const board = stalematePosition()
  assert.equal(inCheck(board, 'black'), false)
  assert.deepEqual(allLegalMovesChecked(board, 'black'), [])
  assert.equal(getXiangqiWinner(board, 'black'), 'red')
  assert.equal(pickAiMoveXiangqi(board, 'black'), null)
})

test('stalemate also loses for red after mirroring the position', () => {
  const board: Board = stalematePosition().reverse().map((row) => row.map((piece) => piece ? {
    ...piece,
    side: piece.side === 'red' ? 'black' : 'red',
  } : null))
  assert.equal(inCheck(board, 'red'), false)
  assert.equal(allLegalMovesChecked(board, 'red').length, 0)
  assert.equal(getXiangqiWinner(board, 'red'), 'black')
})

test('checkmate and a captured general also return the opposing winner', () => {
  const board = stalematePosition()
  place(board, 0, 0, 'red', 'r')
  assert.equal(inCheck(board, 'black'), true)
  assert.equal(getXiangqiWinner(board, 'black'), 'red')
  board[0][4] = null
  assert.equal(getXiangqiWinner(board, 'black'), 'red')
})

test('a normal starting position has no winner for either side', () => {
  const board = createInitialBoard()
  assert.equal(getXiangqiWinner(board, 'red'), null)
  assert.equal(getXiangqiWinner(board, 'black'), null)
})

test('bounded xiangqi search and its immediate fallback return legal moves without changing input', () => {
  const board = createInitialBoard()
  const before = snapshotBoard(board)
  const legal = allLegalMovesChecked(board, 'black')
  for (const row of board) {
    for (const piece of row) if (piece) Object.freeze(piece)
    Object.freeze(row)
  }
  Object.freeze(board)
  for (const budget of [0, 650]) {
    const move = pickAiMoveXiangqi(board, 'black', budget)
    assert.ok(move)
    assert.ok(legal.some((candidate) => JSON.stringify(candidate) === JSON.stringify(move)))
    assert.deepEqual(board, before)
  }
})
