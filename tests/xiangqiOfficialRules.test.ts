import assert from 'node:assert/strict'
import test from 'node:test'
import { createInitialBoard } from '../src/games/xiangqi/xiangqiBoard.ts'
import { allLegalMoves, allLegalMovesChecked, getXiangqiWinner, inCheck, legalMovesFrom, legalMovesFromChecked, pseudoLegalMovesFrom } from '../src/games/xiangqi/xiangqiMoves.ts'
import { XiangqiSearchPosition } from '../src/games/xiangqi/xiangqiSearchPosition.ts'
import type { Board, Move, PieceType, Side } from '../src/games/xiangqi/xiangqiTypes.ts'

// Independent specification oracle: enumerate every destination and test its
// geometry, instead of using rays, offset move tables or production helpers.
// Movement/safety/outcomes: WXF 2018, articles 2.1–2.11 and 3.1.A.I–II.
// https://www.wxf-xiangqi.org/images/wxf-rules/2018_World_XiangQi_Rules_English2018.pdf
const other = (side: Side): Side => side === 'red' ? 'black' : 'red'
const key = (move: Move) => `${move.fromR},${move.fromC},${move.toR},${move.toC}`
const keys = (moves: Move[]) => moves.map(key).sort()
const empty = (): Board => Array.from({ length: 10 }, () => Array(9).fill(null))
const palace = (r: number, c: number, side: Side) => c >= 3 && c <= 5 && (side === 'black' ? r >= 0 && r <= 2 : r >= 7 && r <= 9)
const copy = (board: Board, move: Move): Board => board.map((row, r) => row.map((piece, c) => r === move.toR && c === move.toC ? board[move.fromR][move.fromC] : r === move.fromR && c === move.fromC ? null : piece))

function place(board: Board, r: number, c: number, side: Side, type: PieceType) {
  board[r][c] = { id: `${side}-${type}-${r}-${c}`, side, type }
}
function bare(): Board {
  const board = empty()
  place(board, 0, 3, 'black', 'k')
  place(board, 9, 5, 'red', 'k')
  return board
}
function mirror(board: Board): Board {
  return board.toReversed().map(row => row.map(piece => piece ? { ...piece, side: other(piece.side) } : null))
}
function between(board: Board, move: Move): number {
  if (move.fromR === move.toR) return board[move.fromR].slice(Math.min(move.fromC, move.toC) + 1, Math.max(move.fromC, move.toC)).filter(Boolean).length
  if (move.fromC === move.toC) return board.slice(Math.min(move.fromR, move.toR) + 1, Math.max(move.fromR, move.toR)).filter(row => row[move.fromC]).length
  return Infinity
}
function reaches(board: Board, move: Move): boolean {
  const piece = board[move.fromR][move.fromC]
  if (!piece || board[move.toR][move.toC]?.side === piece.side) return false
  const dr = move.toR - move.fromR, dc = move.toC - move.fromC
  const distance = Math.abs(dr) + Math.abs(dc)
  if (!distance) return false
  switch (piece.type) {
    case 'r': return between(board, move) === 0
    case 'c': return between(board, move) === (board[move.toR][move.toC] ? 1 : 0)
    case 'n': return dr * dr + dc * dc === 5 && !board[move.fromR + Math.trunc(dr / 2)][move.fromC + Math.trunc(dc / 2)]
    case 'b': return Math.abs(dr) === 2 && Math.abs(dc) === 2 && (piece.side === 'black' ? move.toR <= 4 : move.toR >= 5) && !board[(move.fromR + move.toR) / 2][(move.fromC + move.toC) / 2]
    case 'a': return Math.abs(dr) === 1 && Math.abs(dc) === 1 && palace(move.toR, move.toC, piece.side) && Math.abs(move.toR - (piece.side === 'black' ? 1 : 8)) === Math.abs(move.toC - 4)
    case 'k': return distance === 1 && palace(move.toR, move.toC, piece.side)
    case 'p': return dr === (piece.side === 'red' ? -1 : 1) && dc === 0 || dr === 0 && Math.abs(dc) === 1 && (piece.side === 'red' ? move.fromR <= 4 : move.fromR >= 5)
  }
}
function checked(board: Board, side: Side): boolean {
  const kingIndex = board.flat().findIndex(piece => piece?.side === side && piece.type === 'k')
  if (kingIndex < 0) return true
  const toR = Math.floor(kingIndex / 9), toC = kingIndex % 9
  const enemyKingIndex = board.flat().findIndex(piece => piece?.side === other(side) && piece.type === 'k')
  if (enemyKingIndex >= 0 && enemyKingIndex % 9 === toC && between(board, { fromR: Math.floor(enemyKingIndex / 9), fromC: toC, toR, toC }) === 0) return true
  return board.some((row, fromR) => row.some((piece, fromC) => piece?.side === other(side) && reaches(board, { fromR, fromC, toR, toC })))
}
function specifiedMoves(board: Board, side: Side, safety = true): Move[] {
  const moves: Move[] = []
  board.forEach((row, fromR) => row.forEach((piece, fromC) => {
    if (piece?.side !== side) return
    for (let index = 0; index < 90; index++) {
      const move = { fromR, fromC, toR: Math.floor(index / 9), toC: index % 9 }
      if (board[move.toR][move.toC]?.type !== 'k' && reaches(board, move) && (!safety || !checked(copy(board, move), side))) moves.push(move)
    }
  }))
  return moves
}
function compare(board: Board, side: Side, context: string) {
  const before = structuredClone(board)
  const expected = specifiedMoves(board, side)
  const position = new XiangqiSearchPosition(board)
  for (const owner of ['red', 'black'] as const) {
    assert.equal(inCheck(board, owner), checked(board, owner), `${context}: public ${owner} check`)
    assert.equal(position.inCheck(owner), checked(board, owner), `${context}: search ${owner} check`)
  }
  assert.deepEqual(keys(allLegalMovesChecked(board, side)), keys(expected), `${context}: checked API`)
  assert.deepEqual(keys(allLegalMoves(board, side)), keys(expected), `${context}: public legal API`)
  assert.deepEqual(keys(position.legalMoves(side)), keys(expected), `${context}: search legal moves`)
  assert.equal(position.hasLegalMove(side), expected.length > 0, `${context}: search terminal`)
  assert.equal(getXiangqiWinner(board, side), expected.length ? null : other(side), `${context}: result`)
  assert.deepEqual(board, before, `${context}: input changed`)
  assert.deepEqual(position.board, before, `${context}: temporary move not restored`)
  return expected
}

test('both public legal APIs must answer a check instead of allowing an unrelated rook move', () => {
  const board = bare()
  place(board, 9, 5, 'red', 'r')
  place(board, 9, 4, 'red', 'k')
  place(board, 7, 4, 'black', 'r')
  const ignoredCheck = { fromR: 9, fromC: 5, toR: 8, toC: 5 }
  assert.equal(inCheck(board, 'red'), true)
  assert.ok(!keys(legalMovesFrom(board, 9, 5)).includes(key(ignoredCheck)))
  assert.deepEqual(keys(legalMovesFrom(board, 9, 5)), keys(legalMovesFromChecked(board, 9, 5)))
  compare(board, 'red', 'unrelated rook under check')
})

test('WXF generals remain on the board: threats are checks, never capture destinations', () => {
  for (const side of ['red', 'black'] as const) {
    const board = empty()
    place(board, 0, 4, 'black', 'k')
    place(board, 1, 4, 'red', 'r')
    place(board, 9, 4, 'red', 'k')
    const actual = side === 'red' ? board : mirror(board)
    const sourceR = side === 'red' ? 1 : 8, targetR = side === 'red' ? 0 : 9
    assert.equal(inCheck(actual, other(side)), true)
    assert.ok(!pseudoLegalMovesFrom(actual, sourceR, 4).some(move => move.toR === targetR && move.toC === 4))
    compare(actual, side, `${side} general capture excluded`)
  }
})

test('WXF advisors follow only the five marked diagonal intersections of either palace', () => {
  for (const side of ['red', 'black'] as const) {
    const board = bare()
    const r = side === 'black' ? 1 : 8
    board[side === 'black' ? 0 : 9][side === 'black' ? 3 : 5] = null
    place(board, side === 'black' ? 0 : 9, 4, side, 'k')
    place(board, r, 4, side, 'a')
    assert.deepEqual(pseudoLegalMovesFrom(board, r, 4).map(move => [move.toR, move.toC]).sort(), [[r - 1, 3], [r - 1, 5], [r + 1, 3], [r + 1, 5]].sort())
    const offDiagonal = bare()
    place(offDiagonal, side === 'black' ? 0 : 9, 4, side, 'a')
    assert.deepEqual(pseudoLegalMovesFrom(offDiagonal, side === 'black' ? 0 : 9, 4), [])
  }
})

test('WXF flying-general rule forbids removing the only screen, while moving it along the file is legal', () => {
  const board = empty()
  place(board, 0, 4, 'black', 'k')
  place(board, 9, 4, 'red', 'k')
  place(board, 5, 4, 'red', 'r')
  const legal = compare(board, 'red', 'sole royal screen').filter(move => move.fromR === 5)
  assert.ok(legal.length > 0)
  assert.ok(legal.every(move => move.toC === 4))
  board[5][4] = null
  assert.equal(inCheck(board, 'red'), true)
  assert.equal(inCheck(board, 'black'), true)
  compare(board, 'red', 'generals facing')
})

test('all eight horse attacks use the attacker leg, and either colour can block it', () => {
  for (const [dr, dc] of [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]]) {
    const board = bare()
    board[9][5] = null
    place(board, 7, 4, 'red', 'k')
    place(board, 7 + dr, 4 + dc, 'black', 'n')
    for (const side of ['red', 'black'] as const) {
      const actual = side === 'red' ? board : mirror(board)
      assert.equal(inCheck(actual, side), true)
      compare(actual, side, `${side} horse ${dr},${dc}`)
      for (const screenSide of ['red', 'black'] as const) {
        const blocked = structuredClone(board)
        place(blocked, 7 + dr - Math.trunc(dr / 2), 4 + dc - Math.trunc(dc / 2), screenSide, 'n')
        const mirrored = side === 'red' ? blocked : mirror(blocked)
        assert.equal(inCheck(mirrored, side), false)
        compare(mirrored, side, `${side} horse leg blocked by ${screenSide}, ${dr},${dc}`)
      }
    }
  }
})

test('elephant eyes stop every diagonal for friendly and enemy blockers', () => {
  for (const side of ['red', 'black'] as const) for (const screenSide of ['red', 'black'] as const) {
    const row = side === 'black' ? 2 : 7
    for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) {
      const board = bare()
      place(board, row, 4, side, 'b')
      place(board, row + dr / 2, 4 + dc / 2, screenSide, 'n')
      const actual = pseudoLegalMovesFrom(board, row, 4)
      assert.equal(actual.length, 3)
      assert.ok(!actual.some(move => move.toR === row + dr && move.toC === 4 + dc))
      assert.deepEqual(keys(actual), keys(specifiedMoves(board, side, false).filter(move => move.fromR === row && move.fromC === 4)))
    }
  }
})

test('cannons require exactly one mount of either colour, cannot take the mount or jump quietly', () => {
  for (const screenSide of ['red', 'black'] as const) for (let screens = 0; screens <= 3; screens++) {
    const board = bare()
    place(board, 4, 0, 'black', 'c')
    place(board, 4, 8, 'red', 'r')
    for (let index = 0; index < screens; index++) place(board, 4, 2 + index * 2, index % 2 ? other(screenSide) : screenSide, 'p')
    const actual = pseudoLegalMovesFrom(board, 4, 0)
    assert.equal(actual.some(move => move.toR === 4 && move.toC === 8), screens === 1)
    if (screens) {
      assert.equal(actual.some(move => move.toR === 4 && move.toC === 2), false)
      assert.equal(actual.some(move => move.toR === 4 && move.toC === 3), false)
    }
    assert.deepEqual(keys(actual), keys(specifiedMoves(board, 'black', false).filter(move => move.fromR === 4 && move.fromC === 0)))
    compare(board, 'black', `${screens} cannon mounts, first ${screenSide}`)
  }
})

test('WXF cannon checks may be answered by moving the mount, adding a second mount or taking the cannon', () => {
  const board = bare()
  board[9][5] = null
  place(board, 9, 4, 'red', 'k')
  place(board, 0, 4, 'black', 'c')
  place(board, 6, 4, 'red', 'r')
  place(board, 9, 5, 'red', 'a')
  assert.equal(inCheck(board, 'red'), true)
  const legal = keys(compare(board, 'red', 'cannon check evasions'))
  for (const move of [
    { fromR: 6, fromC: 4, toR: 6, toC: 5 },
    { fromR: 9, fromC: 5, toR: 8, toC: 4 },
    { fromR: 6, fromC: 4, toR: 0, toC: 4 },
  ]) assert.ok(legal.includes(key(move)), `legal cannon evasion ${key(move)}`)
})

test('a pinned rook still attacks the opposing general, but cannot leave its own royal screen', () => {
  // Same attacked-square convention as Fairy-Stockfish Position::legal():
  // https://github.com/fairy-stockfish/Fairy-Stockfish/blob/master/src/position.cpp
  const board = empty()
  place(board, 0, 4, 'black', 'k')
  place(board, 7, 4, 'black', 'r')
  place(board, 7, 3, 'red', 'k')
  place(board, 9, 4, 'red', 'r')
  for (const side of ['red', 'black'] as const) {
    const actual = side === 'red' ? board : mirror(board)
    assert.equal(inCheck(actual, side), true)
    compare(actual, side, `${side} checked by pinned rook`)
    compare(actual, other(side), `${other(side)} pinned checking rook`)
    assert.ok(allLegalMovesChecked(actual, other(side)).filter(move => actual[move.fromR][move.fromC]?.type === 'r').every(move => move.toC === 4))
  }
})

test('pawns never retreat or promote, cross the river once and can only traverse on the last rank', () => {
  for (const side of ['red', 'black'] as const) for (const row of side === 'black' ? [4, 5, 9] : [5, 4, 0]) {
    const board = bare(), column = side === 'black' ? 0 : 8
    place(board, row, column, side, 'p')
    const actual = pseudoLegalMovesFrom(board, row, column)
    const expected = specifiedMoves(board, side, false).filter(move => move.fromR === row && move.fromC === column)
    assert.deepEqual(keys(actual), keys(expected))
    assert.equal(actual.length, row === 5 || row === 4 ? (side === 'black' ? row >= 5 : row <= 4) ? 2 : 1 : 1)
    for (const move of actual) assert.equal(copy(board, move)[move.toR][move.toC]?.type, 'p')
    compare(board, side, `${side} pawn at edge rank ${row}`)
  }
})

test('WXF checkmate and un-checked stalemate both lose, without taking either general', () => {
  for (const mate of [false, true]) {
    const board = empty()
    place(board, 0, 4, 'black', 'k')
    place(board, 9, 4, 'red', 'k')
    place(board, 1, 3, 'red', 'r')
    place(board, 1, 5, 'red', 'r')
    place(board, mate ? 1 : 5, 4, 'red', 'p')
    for (const side of ['red', 'black'] as const) {
      const actual = side === 'black' ? board : mirror(board)
      assert.equal(inCheck(actual, side), mate)
      assert.deepEqual(compare(actual, side, `${side} ${mate ? 'checkmate' : 'stalemate'}`), [])
      assert.equal(actual.flat().filter(piece => piece?.type === 'k').length, 2)
      assert.equal(getXiangqiWinner(actual, side), other(side))
    }
  }
})

test('off-board and fractional source coordinates produce no proposed or legal moves', () => {
  const board = createInitialBoard()
  for (const [r, c] of [[-1, 4], [10, 4], [4, -1], [4, 9], [0.5, 4], [4, 0.5]]) {
    assert.deepEqual(pseudoLegalMovesFrom(board, r, c), [])
    assert.deepEqual(legalMovesFromChecked(board, r, c), [])
    assert.deepEqual(legalMovesFrom(board, r, c), [])
  }
})

test('600 independent-oracle legal positions agree with public and search rules, including reflected games', () => {
  let compared = 0
  for (let seed = 1; seed <= 6; seed++) {
    let board = createInitialBoard(), side: Side = 'red', random = seed
    for (let ply = 0; ply < 100; ply++) {
      const legal = compare(board, side, `oracle game ${seed}, ply ${ply}`)
      compared++
      if (!legal.length) break
      if (ply % 20 === 0) {
        const reflected = compare(mirror(board), other(side), `reflected oracle game ${seed}, ply ${ply}`)
        assert.deepEqual(keys(reflected), keys(legal.map(move => ({ ...move, fromR: 9 - move.fromR, toR: 9 - move.toR }))))
      }
      random ^= random << 13; random ^= random >>> 17; random ^= random << 5
      board = copy(board, legal[(random >>> 0) % legal.length])
      side = other(side)
    }
  }
  assert.ok(compared >= 500, `${compared} independently generated positions`)
})

test('initial four-ply move count matches the Fairy-Stockfish authors primary benchmark', () => {
  // https://github.com/fairy-stockfish/Fairy-Stockfish/blob/master/tests/perft.sh
  // xiangqi startpos depth 4: 3290240. No search/evaluation is involved.
  const position = new XiangqiSearchPosition(createInitialBoard())
  const count = (side: Side, depth: number): number => {
    const moves = position.legalMoves(side)
    if (depth === 1) return moves.length
    let nodes = 0
    for (const move of moves) {
      const captured = position.make(move)
      try { nodes += count(other(side), depth - 1) } finally { position.unmake(move, captured) }
    }
    return nodes
  }
  assert.equal(count('red', 4), 3_290_240)
  assert.deepEqual(position.board, createInitialBoard())
  const publicCount = (board: Board, side: Side, depth: number): number => {
    const moves = allLegalMoves(board, side)
    if (depth === 1) return moves.length
    return moves.reduce((nodes, move) => nodes + publicCount(copy(board, move), other(side), depth - 1), 0)
  }
  const board = createInitialBoard(), before = structuredClone(board)
  assert.equal(publicCount(board, 'red', 4), 3_290_240)
  assert.deepEqual(board, before)
})
