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

test('targeted attack checks preserve blocked rays, jumping knights, pawn diagonals and adjacent kings', () => {
  for (const side of ['white', 'black'] as const) {
    const opponent = side === 'white' ? 'black' : 'white'
    for (const type of ['r', 'b', 'q'] as const) {
      const board = emptyBoard()
      const diagonal = type === 'b'
      place(board, 4, 4, side, 'k')
      place(board, 0, diagonal ? 0 : 4, opponent, type)
      assert.equal(inCheck(board, side), true)
      place(board, 2, diagonal ? 2 : 4, side, 'p')
      assert.equal(inCheck(board, side), false)
      place(board, 2, diagonal ? 2 : 4, opponent, 'p')
      assert.equal(inCheck(board, side), false)
    }
    const knightBoard = emptyBoard()
    place(knightBoard, 4, 4, side, 'k')
    place(knightBoard, 2, 3, opponent, 'n')
    place(knightBoard, 3, 3, side, 'p')
    assert.equal(inCheck(knightBoard, side), true)

    const pawnBoard = emptyBoard()
    place(pawnBoard, 4, 4, side, 'k')
    const pawnRow = side === 'white' ? 3 : 5
    place(pawnBoard, pawnRow, 4, opponent, 'p')
    assert.equal(inCheck(pawnBoard, side), false)
    pawnBoard[pawnRow][4] = null
    place(pawnBoard, pawnRow, 3, opponent, 'p')
    assert.equal(inCheck(pawnBoard, side), true)

    const kings = emptyBoard()
    place(kings, 4, 4, side, 'k')
    place(kings, 3, 3, opponent, 'k')
    assert.equal(inCheck(kings, side), true)
    kings[3][3] = null
    place(kings, 2, 2, opponent, 'k')
    assert.equal(inCheck(kings, side), false)
  }
})

test('castling respects pawn and king attacks on empty transit or destination squares', () => {
  const board = emptyBoard()
  place(board, 7, 4, 'white', 'k')
  place(board, 7, 7, 'white', 'r')
  place(board, 0, 0, 'black', 'k')
  place(board, 6, 4, 'black', 'p')
  assert.equal(inCheck(board, 'white'), false)
  assert.equal(legalMovesFromChecked(board, initialMeta(), 7, 4).some(move => move.castle === 'kingside'), false)
  board[6][4] = board[0][0] = null
  place(board, 6, 7, 'black', 'k')
  assert.equal(inCheck(board, 'white'), false)
  assert.equal(legalMovesFromChecked(board, initialMeta(), 7, 4).some(move => move.castle === 'kingside'), false)
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
