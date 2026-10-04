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

test('an empty, opposing or invalid origin cannot supply a fifth stone', () => {
  for (const side of [1, 2] as const) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const board = emptyBoard()
      for (const n of [-2, -1, 1, 2]) board[7 + dr*n][7 + dc*n] = side
      assert.equal(checkWin(board, 7, 7, side), false)
      board[7][7] = side === 1 ? 2 : 1
      assert.equal(checkWin(board, 7, 7, side), false)
      board[7][7] = side
      assert.equal(checkWin(board, 7, 7, side), true)
    }
  }
  const board = emptyBoard()
  for (let c = 0; c < 4; c++) board[0][c] = 1
  for (const [r, c] of [[0, -1], [0, 15], [-1, 0], [15, 0], [.5, 0], [NaN, 0]]) {
    assert.equal(checkWin(board, r, c, 1), false)
  }
})

test('free-style overlines win for either colour at board edges', () => {
  for (const side of [1, 2] as const) {
    for (const [r, c, dr, dc] of [[0, 0, 0, 1], [0, 14, 1, 0], [0, 0, 1, 1], [0, 14, 1, -1]]) {
      const board = emptyBoard()
      for (let n = 0; n < 6; n++) board[r + dr*n][c + dc*n] = side
      for (let n = 0; n < 6; n++) assert.equal(checkWin(board, r + dr*n, c + dc*n, side), true)
    }
  }
})

test('winning origins match an independent enumeration of five-cell windows', () => {
  let seed = 0x5eed
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed }
  for (let sample = 0; sample < 40; sample++) {
    const board = emptyBoard().map(row => row.map(() => random() % 3 as 0 | 1 | 2))
    for (const side of [1, 2] as const) {
      const winning = new Set<string>()
      for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) {
        for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
          const points = Array.from({ length: 5 }, (_, n) => [r + dr*n, c + dc*n])
          if (points.every(([row, col]) => board[row]?.[col] === side)) {
            points.forEach(([row, col]) => winning.add(`${row},${col}`))
          }
        }
      }
      for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) {
        assert.equal(checkWin(board, r, c, side), winning.has(`${r},${c}`), `sample ${sample}, side ${side}, ${r},${c}`)
      }
    }
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
