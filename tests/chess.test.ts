import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMove, createInitialBoard, initialMeta, snapshotBoard, snapshotMeta } from '../src/games/chess/chessBoard.ts'
import { allLegalMovesChecked, inCheck, legalMovesFromChecked, pickAiMoveChess } from '../src/games/chess/chessMoves.ts'
import type { Board, GameMeta, PieceType, Side } from '../src/games/chess/chessTypes.ts'

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array(8).fill(null))
}

function place(board: Board, r: number, c: number, side: Side, type: PieceType) {
  board[r][c] = { id: `${side}-${type}-${r}-${c}`, side, type }
}

function freezePosition(board: Board, meta: GameMeta) {
  for (const row of board) {
    for (const piece of row) if (piece) Object.freeze(piece)
    Object.freeze(row)
  }
  Object.freeze(board)
  Object.freeze(meta.castling.white)
  Object.freeze(meta.castling.black)
  Object.freeze(meta.castling)
  if (meta.enPassant) Object.freeze(meta.enPassant)
  Object.freeze(meta)
}

test('the initial chess position has 20 legal moves', () => {
  assert.equal(allLegalMovesChecked(createInitialBoard(), initialMeta(), 'white').length, 20)
})

test('bounded chess search and its immediate fallback return legal moves without changing input', () => {
  const board = createInitialBoard()
  const meta = initialMeta()
  const beforeBoard = snapshotBoard(board)
  const beforeMeta = snapshotMeta(meta)
  const legal = allLegalMovesChecked(board, meta, 'black')
  freezePosition(board, meta)
  for (const budget of [0, 650]) {
    const move = pickAiMoveChess(board, meta, 'black', budget)
    assert.ok(move)
    assert.ok(legal.some((candidate) => JSON.stringify(candidate) === JSON.stringify(move)))
    assert.deepEqual(board, beforeBoard)
    assert.deepEqual(meta, beforeMeta)
  }
})

test('both castling directions preserve the input and piece identities for either side', () => {
  for (const side of ['white', 'black'] as const) {
    for (const castle of ['kingside', 'queenside'] as const) {
      const board = emptyBoard()
      const row = side === 'white' ? 7 : 0
      const rookCol = castle === 'kingside' ? 7 : 0
      const kingTo = castle === 'kingside' ? 6 : 2
      const rookTo = castle === 'kingside' ? 5 : 3
      place(board, row, 4, side, 'k')
      place(board, row, rookCol, side, 'r')
      const meta = initialMeta()
      const beforeBoard = snapshotBoard(board)
      const beforeMeta = snapshotMeta(meta)
      freezePosition(board, meta)

      const next = applyMove(board, meta, { fromR: row, fromC: 4, toR: row, toC: kingTo, castle })
      assert.deepEqual(board, beforeBoard)
      assert.deepEqual(meta, beforeMeta)
      assert.equal(next.board[row][kingTo]?.id, board[row][4]?.id)
      assert.equal(next.board[row][rookTo]?.id, board[row][rookCol]?.id)
      assert.equal(next.board[row][4], null)
      assert.equal(next.board[row][rookCol], null)
      assert.deepEqual(next.meta.castling[side], { kingside: false, queenside: false })
    }
  }
})

test('a king cannot castle from, through, or into an attacked square', () => {
  for (const attackedCol of [4, 5, 6]) {
    const board = emptyBoard()
    place(board, 7, 4, 'white', 'k')
    place(board, 7, 7, 'white', 'r')
    place(board, 0, 0, 'black', 'k')
    place(board, 0, attackedCol, 'black', 'r')
    const meta = initialMeta()
    freezePosition(board, meta)
    assert.equal(legalMovesFromChecked(board, meta, 7, 4).some((m) => m.castle === 'kingside'), false)
  }
})

test('both sides can promote to queen, rook, bishop, or knight on a quiet move or capture', () => {
  for (const side of ['white', 'black'] as const) {
    const board = emptyBoard()
    const fromR = side === 'white' ? 1 : 6
    const toR = side === 'white' ? 0 : 7
    const opponent = side === 'white' ? 'black' : 'white'
    place(board, side === 'white' ? 7 : 0, 4, side, 'k')
    place(board, toR, 7, opponent, 'k')
    place(board, fromR, 2, side, 'p')
    place(board, toR, 3, opponent, 'r')
    const meta = initialMeta()
    const before = snapshotBoard(board)
    freezePosition(board, meta)

    const legal = legalMovesFromChecked(board, meta, fromR, 2)
    for (const toC of [2, 3]) {
      const promotions = legal.filter((m) => m.toR === toR && m.toC === toC)
      assert.deepEqual(promotions.map((m) => m.promotion).sort(), ['b', 'n', 'q', 'r'])
      for (const move of promotions) {
        const next = applyMove(board, meta, move)
        assert.equal(next.board[toR][toC]?.type, move.promotion)
        assert.equal(next.board[toR][toC]?.id, board[fromR][2]?.id)
        assert.equal(next.board[fromR][2], null)
      }
    }
    assert.deepEqual(board, before)
  }
})

test('en passant removes the passed pawn and cannot expose the moving king', () => {
  const board = emptyBoard()
  place(board, 7, 4, 'white', 'k')
  place(board, 0, 4, 'black', 'k')
  place(board, 3, 4, 'white', 'p')
  place(board, 3, 5, 'black', 'p')
  const meta = initialMeta()
  meta.enPassant = [2, 5]
  const capture = legalMovesFromChecked(board, meta, 3, 4).find((m) => m.toR === 2 && m.toC === 5)
  assert.ok(capture)
  const next = applyMove(board, meta, capture)
  assert.equal(next.board[3][5], null)
  assert.equal(next.board[2][5]?.side, 'white')
  assert.equal(next.meta.enPassant, null)

  board[7][4] = null
  place(board, 3, 0, 'white', 'k')
  place(board, 3, 7, 'black', 'r')
  assert.equal(inCheck(board, 'white'), false)
  assert.equal(legalMovesFromChecked(board, meta, 3, 4).some((m) => m.toR === 2 && m.toC === 5), false)
})
