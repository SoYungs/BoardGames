import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMove, createInitialBoard } from '../src/games/xiangqi/xiangqiBoard.ts'
import { allLegalMovesChecked, inCheck } from '../src/games/xiangqi/xiangqiMoves.ts'
import { XiangqiSearchPosition } from '../src/games/xiangqi/xiangqiSearchPosition.ts'
import type { Board, Move, PieceType, Side } from '../src/games/xiangqi/xiangqiTypes.ts'

const other = (side: Side): Side => side === 'red' ? 'black' : 'red'
const moveKey = (move: Move): string => `${move.fromR},${move.fromC},${move.toR},${move.toC}`

function fromFen(fen: string): Board {
  return fen.split('/').map((row, r) => {
    const cells: Board[number] = []
    for (const ch of row) {
      if (/\d/.test(ch)) cells.push(...Array<null>(Number(ch)).fill(null))
      else {
        const code = ch.toLowerCase()
        cells.push({
          id: `${r}:${cells.length}`,
          side: ch === ch.toUpperCase() ? 'red' : 'black',
          type: (code === 'h' ? 'n' : code === 'e' ? 'b' : code) as PieceType,
        })
      }
    }
    assert.equal(cells.length, 9)
    return cells
  })
}

function mirror(board: Board): Board {
  return board.toReversed().map(row => row.map(piece => piece ? { ...piece, side: other(piece.side) } : null))
}

function freeze(board: Board): Board {
  for (const row of board) {
    for (const piece of row) if (piece) Object.freeze(piece)
    Object.freeze(row)
  }
  Object.freeze(board)
  return board
}

function snapshot(position: XiangqiSearchPosition) {
  return {
    board: structuredClone(position.board),
    hash: position.hash,
    lock: position.lock,
    score: position.score,
  }
}

function compareFresh(position: XiangqiSearchPosition, context: string) {
  const fresh = new XiangqiSearchPosition(position.board)
  assert.equal(position.hash, fresh.hash, `${context}: incremental hash`)
  assert.equal(position.lock, fresh.lock, `${context}: incremental verification hash`)
  assert.equal(position.score, fresh.score, `${context}: incremental evaluation`)
  for (const side of ['red', 'black'] as const) {
    assert.equal(position.inCheck(side), fresh.inCheck(side), `${context}: cached general, ${side}`)
  }
}

function compareRules(position: XiangqiSearchPosition, context: string): Record<Side, Move[]> {
  const before = snapshot(position)
  const legal = { red: [] as Move[], black: [] as Move[] }
  for (const side of ['red', 'black'] as const) {
    assert.equal(position.inCheck(side), inCheck(position.board, side), `${context}: ${side} check`)
    legal[side] = position.legalMoves(side)
    const keys = legal[side].map(moveKey)
    assert.equal(new Set(keys).size, keys.length, `${context}: duplicate ${side} moves`)
    assert.deepEqual(keys.sort(), allLegalMovesChecked(position.board, side).map(moveKey).sort(), `${context}: ${side} legal moves`)
  }
  assert.deepEqual(snapshot(position), before, `${context}: move generation changed the position`)
  return legal
}

function perft(position: XiangqiSearchPosition, side: Side, depth: number, context: string): number {
  const legal = compareRules(position, context)[side]
  if (depth === 1) return legal.length
  let nodes = 0
  for (const move of legal) {
    const before = snapshot(position)
    const target = position.board[move.toR][move.toC]
    const captured = position.make(move)
    assert.equal(captured, target, `${context}: returned capture`)
    assert.deepEqual(position.board, applyMove(before.board, move.fromR, move.fromC, move.toR, move.toC), `${context}: applied move`)
    compareFresh(position, `${context}, ${moveKey(move)}`)
    nodes += perft(position, other(side), depth - 1, `${context}, ${moveKey(move)}`)
    position.unmake(move, captured)
    assert.deepEqual(snapshot(position), before, `${context}: unmake ${moveKey(move)}`)
  }
  return nodes
}

// The published counts are independent of both move generators under test.
// https://www.chessprogramming.org/Chinese_Chess_Perft_Results
const benchmarks = [
  { name: 'initial', fen: 'rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR', counts: [44, 1920] },
  { name: 'middlegame checks', fen: 'r1ea1a3/4kh3/2h1e4/pHp1p1p1p/4c4/6P2/P1P2R2P/1CcC5/9/2EAKAE2', counts: [38, 1128] },
  { name: 'restricted evasions', fen: '1ceak4/9/h2a5/2p1p3p/5cp2/2h2H3/6PCP/3AE4/2C6/3A1K1H1', counts: [7, 281] },
  { name: 'palace endgame', fen: '5a3/3k5/3aR4/9/5r3/5h3/9/3A1A3/5K3/2EC2E2', counts: [25, 424] },
  { name: 'cannon checks', fen: 'CRH1k1e2/3ca4/4ea3/9/2hr5/9/9/4E4/4A4/4KA3', counts: [28, 516] },
  { name: 'horse and elephant blockers', fen: 'R1H1k1e2/9/3aea3/9/2hr5/2E6/9/4E4/4A4/4KA3', counts: [21, 364] },
  { name: 'moving cannon platforms', fen: 'C1hHk4/9/9/9/9/9/h1pp5/E3C4/9/3A1K3', counts: [28, 222] },
  { name: 'uncovering horse attacks', fen: '4ka3/4a4/9/9/4H4/p8/9/4C3c/7h1/2EK5', counts: [23, 345] },
  { name: 'soldier and horse checks', fen: '2e1ka3/9/e3H4/4h4/9/9/9/4C4/2p6/2EK5', counts: [21, 195] },
  { name: 'multiple platforms', fen: '1C2ka3/9/C1Hae1h2/p3p3p/6p2/9/P3P3P/3AE4/3p2c2/c1EAK4', counts: [30, 830] },
  { name: 'compound checks', fen: 'ChH1k1e2/c3a4/4ea3/9/2hr5/9/9/4C4/4A4/4KA3', counts: [19, 583] },
]

for (const benchmark of benchmarks) test(`fast xiangqi position matches reference perft and checks: ${benchmark.name}, both colours`, () => {
  const original = fromFen(benchmark.fen)
  for (const [board, side] of [[original, 'red'], [mirror(original), 'black']] as const) {
    const before = structuredClone(board)
    freeze(board)
    const position = new XiangqiSearchPosition(board)
    assert.notEqual(position.board, board)
    for (let r = 0; r < 10; r++) assert.notEqual(position.board[r], board[r])
    assert.deepEqual(benchmark.counts.map((_, index) => perft(position, side, index + 1, `${benchmark.name}, ${side}`)), benchmark.counts)
    assert.deepEqual(board, before, `${benchmark.name}: frozen input changed`)
  }
})

test('fast check detection handles zero, one and two cannon platforms of either allegiance', () => {
  for (const screenSide of ['red', 'black'] as const) for (const side of ['red', 'black'] as const) {
    for (let screens = 0; screens <= 2; screens++) {
      const original = fromFen('3k5/9/4c4/9/9/9/9/9/9/4K4')
      if (screens) original[5][4] = { id: 'first-platform', side: screenSide, type: 'p' }
      if (screens === 2) original[7][4] = { id: 'second-platform', side: other(screenSide), type: 'p' }
      const board = side === 'red' ? original : mirror(original)
      const position = new XiangqiSearchPosition(freeze(board))
      assert.equal(position.inCheck(side), screens === 1, `${side}, ${screens} platforms, first ${screenSide}`)
      compareRules(position, `${side}, ${screens} cannon platforms`)
    }
  }
})

test('fast checks use the attacking horse leg and still allow a non-general double-check evasion', () => {
  for (const side of ['red', 'black'] as const) {
    const original = fromFen('3kc4/9/9/9/9/9/9/3n5/4A4/4K4')
    const board = side === 'red' ? original : mirror(original)
    const position = new XiangqiSearchPosition(freeze(board))
    const fromR = side === 'red' ? 8 : 1
    const toR = side === 'red' ? 7 : 2
    assert.equal(position.inCheck(side), true)
    const defense = compareRules(position, `${side} cannon and horse double check`)[side].find(move => move.fromR === fromR && move.fromC === 4 && move.toR === toR && move.toC === 3)
    assert.ok(defense, 'the advisor can remove the cannon platform while capturing the horse')
    const before = snapshot(position)
    const captured = position.make(defense)
    assert.equal(captured?.type, 'n')
    assert.equal(position.inCheck(side), false)
    compareRules(position, `${side} after advisor evasion`)
    compareFresh(position, `${side} after advisor evasion`)
    position.unmake(defense, captured)
    assert.deepEqual(snapshot(position), before)

    const blocked = structuredClone(board)
    blocked[side === 'red' ? 8 : 1][3] = { id: 'horse-leg', side, type: 'p' }
    blocked[side === 'red' ? 0 : 9][4] = null
    const blockedPosition = new XiangqiSearchPosition(freeze(blocked))
    assert.equal(blockedPosition.inCheck(side), false)
    compareRules(blockedPosition, `${side} blocked horse leg`)
  }
})

test('a simulated general removal restores royal-safety caches but is never offered as a legal move', () => {
  for (const side of ['red', 'black'] as const) {
    const original = fromFen('4k4/4R4/9/9/9/9/9/9/9/4K4')
    const position = new XiangqiSearchPosition(freeze(side === 'red' ? original : mirror(original)))
    const before = snapshot(position)
    const fromR = side === 'red' ? 1 : 8, toR = side === 'red' ? 0 : 9
    const move = { fromR, fromC: 4, toR, toC: 4 }
    assert.ok(!compareRules(position, `${side} before simulated general removal`)[side].some(candidate => moveKey(candidate) === moveKey(move)))
    const captured = position.make(move)
    assert.equal(captured?.type, 'k')
    assert.equal(position.inCheck(other(side)), true)
    assert.deepEqual(position.legalMoves(other(side)), [])
    compareRules(position, `${side} after capturing general`)
    compareFresh(position, `${side} after capturing general`)
    position.unmake(move, captured)
    assert.deepEqual(snapshot(position), before)
    compareRules(position, `${side} restored captured general`)
  }
})

test('cancelling legal generation never leaves a partially made move behind', () => {
  for (const side of ['red', 'black'] as const) for (const stopAt of [2, 12, 30]) {
    const position = new XiangqiSearchPosition(freeze(createInitialBoard()))
    const before = snapshot(position)
    const cancelled = new Error('controlled deadline')
    let checks = 0
    assert.throws(() => position.legalMoves(side, () => {
      if (++checks === stopAt) throw cancelled
    }), error => error === cancelled)
    assert.deepEqual(snapshot(position), before, `${side}, check ${stopAt}: cancelled generation`)
    compareRules(position, `${side} after cancelled generation`)
  }
})

test('make/unmake restores cached generals, captures, verification hashes and evaluation through complete legal playouts', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const original = freeze(createInitialBoard())
    const position = new XiangqiSearchPosition(original)
    const start = snapshot(position)
    let publicBoard = structuredClone(original), side: Side = 'red', random = seed
    const played: { move: Move; captured: ReturnType<XiangqiSearchPosition['make']>; before: ReturnType<typeof snapshot> }[] = []
    for (let ply = 0; ply < 120; ply++) {
      assert.deepEqual(position.board, publicBoard, `seed ${seed}, ply ${ply}: public position`)
      const legal = compareRules(position, `seed ${seed}, ply ${ply}`)[side]
      if (!legal.length) break
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0
      const move = legal[random % legal.length]
      const before = snapshot(position)
      const captured = position.make(move)
      compareFresh(position, `seed ${seed}, ply ${ply}: made move`)
      position.unmake(move, captured)
      assert.deepEqual(snapshot(position), before, `seed ${seed}, ply ${ply}: immediate unmake`)
      const recaptured = position.make(move)
      assert.equal(recaptured, captured)
      played.push({ move, captured: recaptured, before })
      publicBoard = applyMove(publicBoard, move.fromR, move.fromC, move.toR, move.toC)
      side = other(side)
    }
    while (played.length) {
      const undo = played.pop()!
      position.unmake(undo.move, undo.captured)
      assert.deepEqual(snapshot(position), undo.before, `seed ${seed}: reverse entire playout`)
      compareFresh(position, `seed ${seed}: reversed move`)
    }
    assert.deepEqual(snapshot(position), start)
    assert.deepEqual(original, start.board, `seed ${seed}: frozen caller input`)
  }
})
