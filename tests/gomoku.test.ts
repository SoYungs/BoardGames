import test from 'node:test'
import assert from 'node:assert/strict'
import { checkWin, emptyBoard, getCandidates, isBoardFull, pickAiMove } from '../src/games/gomoku/gomokuLogic.ts'

test('five stones win in each direction, four stones do not', () => {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const board = emptyBoard()
    for (let n = 0; n < 4; n++) board[5 + dr*n][7 + dc*n] = 1
    assert.equal(checkWin(board, 5, 7, 1), false)
    board[5 + dr*4][7 + dc*4] = 1
    assert.equal(checkWin(board, 5, 7, 1), true)
  }
})

test('AI takes an immediate win before defending', () => {
  const board = emptyBoard()
  for (let c = 3; c <= 6; c++) { board[7][c] = 2; board[9][c] = 1 }
  const move = pickAiMove(board, 2)
  assert.ok(move)
  board[move[0]][move[1]] = 2
  assert.equal(checkWin(board, ...move, 2), true)
})

test('AI blocks the only open end of an opposing four', () => {
  const board = emptyBoard()
  board[7][2] = 2
  for (let c = 3; c <= 6; c++) board[7][c] = 1
  assert.deepEqual(pickAiMove(board, 2), [7, 7])
})

test('a full board has no candidate or AI move', () => {
  const board = emptyBoard().map(row => row.map(() => 1 as const))
  assert.equal(isBoardFull(board), true)
  assert.deepEqual(getCandidates(board), [])
  assert.equal(pickAiMove(board, 2), null)
})

test('AI search returns a free point without changing the board', () => {
  const board = emptyBoard()
  board[7][7] = 1
  const before = JSON.stringify(board)
  const move = pickAiMove(board, 2)
  assert.ok(move)
  assert.equal(board[move[0]][move[1]], 0)
  assert.equal(JSON.stringify(board), before)
})
