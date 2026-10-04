import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMove, createInitialBoard } from '../src/games/xiangqi/xiangqiBoard.ts'
import { allLegalMovesChecked, flyingGeneral, getXiangqiWinner, inCheck, legalMovesFromChecked, pickAiMoveXiangqi } from '../src/games/xiangqi/xiangqiMoves.ts'
import type { Board, PieceType, Side } from '../src/games/xiangqi/xiangqiTypes.ts'

const other = (side: Side): Side => side === 'red' ? 'black' : 'red'
function fromFen(pieces: string): Board {
  return pieces.split('/').map((row, r) => {
    const cells: Board[number] = []
    for (const ch of row) {
      if (/\d/.test(ch)) cells.push(...Array<null>(Number(ch)).fill(null))
      else {
        const code = ch.toLowerCase()
        cells.push({ id: `${r}:${cells.length}`, side: ch === ch.toUpperCase() ? 'red' : 'black', type: (code === 'h' ? 'n' : code === 'e' ? 'b' : code) as PieceType })
      }
    }
    assert.equal(cells.length, 9)
    return cells
  })
}
function mirror(board: Board): Board {
  return board.toReversed().map(row => row.map(piece => piece ? { ...piece, side: other(piece.side) } : null))
}
function perft(board: Board, side: Side, depth: number): number {
  const legal = allLegalMovesChecked(board, side)
  if (depth === 1) return legal.length
  return legal.reduce((count, move) => count + perft(applyMove(board, move.fromR, move.fromC, move.toR, move.toC), other(side), depth - 1), 0)
}

// Published move-generator benchmarks, supplied by the engine authors:
// https://www.chessprogramming.org/Chinese_Chess_Perft_Results
const benchmarks = [
  { name: 'initial', fen: 'rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR', counts: [44, 1920, 79666] },
  { name: 'middlegame checks', fen: 'r1ea1a3/4kh3/2h1e4/pHp1p1p1p/4c4/6P2/P1P2R2P/1CcC5/9/2EAKAE2', counts: [38, 1128, 43929] },
  { name: 'restricted evasions', fen: '1ceak4/9/h2a5/2p1p3p/5cp2/2h2H3/6PCP/3AE4/2C6/3A1K1H1', counts: [7, 281, 8620] },
  { name: 'palace endgame', fen: '5a3/3k5/3aR4/9/5r3/5h3/9/3A1A3/5K3/2EC2E2', counts: [25, 424, 9850] },
  { name: 'cannon checks', fen: 'CRH1k1e2/3ca4/4ea3/9/2hr5/9/9/4E4/4A4/4KA3', counts: [28, 516, 14808] },
  { name: 'horse and elephant blockers', fen: 'R1H1k1e2/9/3aea3/9/2hr5/2E6/9/4E4/4A4/4KA3', counts: [21, 364, 7626] },
  { name: 'moving cannon platforms', fen: 'C1hHk4/9/9/9/9/9/h1pp5/E3C4/9/3A1K3', counts: [28, 222, 6241] },
  { name: 'uncovering horse attacks', fen: '4ka3/4a4/9/9/4H4/p8/9/4C3c/7h1/2EK5', counts: [23, 345, 8124] },
  { name: 'soldier and horse checks', fen: '2e1ka3/9/e3H4/4h4/9/9/9/4C4/2p6/2EK5', counts: [21, 195, 3883] },
  { name: 'multiple platforms', fen: '1C2ka3/9/C1Hae1h2/p3p3p/6p2/9/P3P3P/3AE4/3p2c2/c1EAK4', counts: [30, 830, 22787] },
  { name: 'compound checks', fen: 'ChH1k1e2/c3a4/4ea3/9/2hr5/9/9/4C4/4A4/4KA3', counts: [19, 583, 11714] },
]
for (const benchmark of benchmarks) test(`xiangqi reference perft: ${benchmark.name}, either colour`, () => {
  const original = fromFen(benchmark.fen)
  for (const [board, side] of [[original, 'red'], [mirror(original), 'black']] as const) {
    const before = structuredClone(board)
    assert.deepEqual(benchmark.counts.map((_, i) => perft(board, side, i + 1)), benchmark.counts)
    assert.deepEqual(board, before)
  }
})

test('xiangqi matches the independent Fairy-Stockfish four-ply endgame benchmark', () => {
  // https://github.com/fairy-stockfish/Fairy-Stockfish/blob/master/tests/perft.sh
  const board = fromFen('4kcP1N/8n/3rb4/9/9/9/9/3p1A3/4K4/5CB2')
  assert.equal(perft(board, 'red', 4), 92741)
})

test('a non-king move can answer cannon and horse double check by removing both threats', () => {
  const board = fromFen('3kc4/9/9/9/9/9/9/3n5/4A4/4K4')
  const withoutCannon = structuredClone(board), withoutHorse = structuredClone(board)
  withoutCannon[0][4] = null
  withoutHorse[7][3] = null
  assert.equal(inCheck(withoutCannon, 'red'), true)
  assert.equal(inCheck(withoutHorse, 'red'), true)
  const defense = legalMovesFromChecked(board, 8, 4).find(move => move.toR === 7 && move.toC === 3)
  assert.ok(defense)
  const next = applyMove(board, defense.fromR, defense.fromC, defense.toR, defense.toC)
  assert.equal(next[7][3]?.type, 'a')
  assert.equal(next[8][4], null)
  assert.equal(inCheck(next, 'red'), false)
})

test('a cannon cannot capture its platform, jump quietly, or capture past the first target', () => {
  const board = fromFen('3k5/9/9/9/9/C1P2r1p1/9/9/9/4K4')
  const legal = legalMovesFromChecked(board, 5, 0)
  assert.ok(legal.some(move => move.toR === 5 && move.toC === 1))
  assert.ok(legal.some(move => move.toR === 5 && move.toC === 5))
  for (const c of [2, 3, 4, 6, 7, 8]) assert.equal(legal.some(move => move.toR === 5 && move.toC === c), false)
})

test('elephants respect both the eye and river, and soldiers change movement after crossing', () => {
  const original = fromFen('3k5/9/9/9/2b6/9/9/9/9/5K3')
  for (const [board, side] of [[original, 'black'], [mirror(original), 'red']] as const) {
    const r = side === 'black' ? 4 : 5
    const toR = side === 'black' ? 2 : 7
    assert.deepEqual(legalMovesFromChecked(board, r, 2).map(move => [move.toR, move.toC]).sort(), [[toR, 0], [toR, 4]])
    board[(r + toR) / 2][1] = { id: 'eye-blocker', side: other(side), type: 'p' }
    assert.deepEqual(legalMovesFromChecked(board, r, 2).map(move => [move.toR, move.toC]), [[toR, 4]])
  }
  for (const side of ['red', 'black'] as const) for (const crossed of [false, true]) {
    const board = fromFen('3k5/9/9/9/9/9/9/9/9/5K3')
    const r = side === 'red' ? crossed ? 4 : 5 : crossed ? 5 : 4
    board[r][0] = { id: 'soldier', side, type: 'p' }
    const legal = legalMovesFromChecked(board, r, 0)
    assert.equal(legal.length, crossed ? 2 : 1)
    assert.equal(legal.some(move => move.toR === r && move.toC === 1), crossed)
    assert.ok(legal.some(move => move.toR === r + (side === 'red' ? -1 : 1) && move.toC === 0))
  }
})

test('seeded legal xiangqi playouts preserve royal safety, piece rules, identities and AI legality', () => {
  const originalClock = Object.getOwnPropertyDescriptor(performance, 'now')
  for (let seed = 1; seed <= 4; seed++) {
    let board = createInitialBoard(), side: Side = 'red', random = seed
    const identities = new Map(board.flat().flatMap(piece => piece ? [[piece.id, { ...piece }]] as const : []))
    for (let ply = 0; ply < 80; ply++) {
      const legal = allLegalMovesChecked(board, side)
      if (!legal.length) { assert.equal(getXiangqiWinner(board, side), other(side)); break }
      assert.equal(getXiangqiWinner(board, side), null)
      assert.equal(new Set(legal.map(move => JSON.stringify(move))).size, legal.length)
      const before = structuredClone(board)
      if (ply % 20 === 0) {
        let clock = 0, selected
        Object.defineProperty(performance, 'now', { configurable: true, value: () => clock += .5 })
        try { selected = pickAiMoveXiangqi(board, side, 0) }
        finally {
          if (originalClock) Object.defineProperty(performance, 'now', originalClock)
          else Reflect.deleteProperty(performance, 'now')
        }
        assert.ok(selected)
        assert.ok(legal.some(move => JSON.stringify(move) === JSON.stringify(selected)))
        assert.ok(clock < 28)
      }
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0
      const move = legal[random % legal.length], piece = board[move.fromR][move.fromC]!
      const captured = !!board[move.toR][move.toC]
      const dr = move.toR - move.fromR, dc = move.toC - move.fromC
      if (piece.type === 'r' || piece.type === 'c') {
        assert.ok((dr === 0) !== (dc === 0))
        let blockers = 0
        for (let r = move.fromR + Math.sign(dr), c = move.fromC + Math.sign(dc); r !== move.toR || c !== move.toC; r += Math.sign(dr), c += Math.sign(dc)) if (board[r][c]) blockers++
        assert.equal(blockers, piece.type === 'c' && captured ? 1 : 0)
      } else if (piece.type === 'n') {
        assert.equal(Math.abs(dr) * Math.abs(dc), 2)
        assert.equal(board[move.fromR + (Math.abs(dr) === 2 ? Math.sign(dr) : 0)][move.fromC + (Math.abs(dc) === 2 ? Math.sign(dc) : 0)], null)
      } else if (piece.type === 'b') {
        assert.equal(Math.abs(dr), 2); assert.equal(Math.abs(dc), 2)
        assert.equal(board[move.fromR + dr / 2][move.fromC + dc / 2], null)
      } else if (piece.type === 'a') {
        assert.equal(Math.abs(dr), 1); assert.equal(Math.abs(dc), 1)
      } else if (piece.type === 'k') assert.equal(Math.abs(dr) + Math.abs(dc), 1)
      else {
        assert.equal(Math.abs(dr) + Math.abs(dc), 1)
        if (dc) assert.ok(side === 'red' ? move.fromR <= 4 : move.fromR >= 5)
        else assert.equal(dr, side === 'red' ? -1 : 1)
      }
      const next = applyMove(board, move.fromR, move.fromC, move.toR, move.toC)
      assert.deepEqual(board, before)
      assert.equal(inCheck(next, side), false)
      assert.equal(flyingGeneral(next), false)
      assert.equal(next.flat().filter(Boolean).length, board.flat().filter(Boolean).length - Number(captured))
      const ids = next.flat().flatMap(cell => cell ? [cell.id] : [])
      assert.equal(new Set(ids).size, ids.length)
      for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
        const cell = next[r][c]
        if (!cell) continue
        assert.deepEqual(cell, identities.get(cell.id))
        if (cell.type === 'k' || cell.type === 'a') {
          assert.ok(c >= 3 && c <= 5)
          assert.ok(cell.side === 'red' ? r >= 7 : r <= 2)
        } else if (cell.type === 'b') assert.ok(cell.side === 'red' ? r >= 5 : r <= 4)
      }
      for (const owner of ['red', 'black'] as const) assert.equal(next.flat().filter(cell => cell?.type === 'k' && cell.side === owner).length, 1)
      board = next
      side = other(side)
    }
  }
})
