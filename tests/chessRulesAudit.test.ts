import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMove, createInitialBoard, initialMeta } from '../src/games/chess/chessBoard.ts'
import { allLegalMovesChecked, inCheck, legalMovesFromChecked, pickAiMoveChess } from '../src/games/chess/chessMoves.ts'
import type { Board, GameMeta, PieceType, Side } from '../src/games/chess/chessTypes.ts'

type Position = { board: Board; meta: GameMeta; side: Side }
const other = (side: Side): Side => side === 'white' ? 'black' : 'white'

function fromFen(fen: string): Position {
  const [pieces, turn, rights, ep] = fen.split(' ')
  const board: Board = pieces.split('/').map((row, r) => {
    const cells: Board[number] = []
    for (const ch of row) {
      if (/\d/.test(ch)) cells.push(...Array<null>(Number(ch)).fill(null))
      else cells.push({ id: `${r}:${cells.length}`, side: ch === ch.toUpperCase() ? 'white' : 'black', type: ch.toLowerCase() as PieceType })
    }
    assert.equal(cells.length, 8)
    return cells
  })
  const meta: GameMeta = {
    castling: {
      white: { kingside: rights.includes('K'), queenside: rights.includes('Q') },
      black: { kingside: rights.includes('k'), queenside: rights.includes('q') },
    },
    enPassant: ep === '-' ? null : [8 - Number(ep[1]), ep.charCodeAt(0) - 97],
  }
  return { board, meta, side: turn === 'w' ? 'white' : 'black' }
}

function mirror(position: Position): Position {
  return {
    board: position.board.toReversed().map(row => row.map(piece => piece ? { ...piece, side: other(piece.side) } : null)),
    side: other(position.side),
    meta: {
      castling: { white: { ...position.meta.castling.black }, black: { ...position.meta.castling.white } },
      enPassant: position.meta.enPassant ? [7 - position.meta.enPassant[0], position.meta.enPassant[1]] : null,
    },
  }
}

function perft(position: Position, depth: number): number {
  const legal = allLegalMovesChecked(position.board, position.meta, position.side)
  if (depth === 1) return legal.length
  return legal.reduce((count, move) => count + perft({ ...applyMove(position.board, position.meta, move), side: other(position.side) }, depth - 1), 0)
}

// The benchmark positions are also used by upstream Stockfish's perft suite:
// https://github.com/official-stockfish/Stockfish/blob/master/tests/perft.sh
// Published shallow counts: https://www.chessprogramming.org/Perft_Results
const benchmarks = [
  { name: 'initial', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', counts: [20, 400, 8902] },
  { name: 'Kiwipete castling and pins', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -', counts: [48, 2039, 97862] },
  { name: 'en-passant endgame', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -', counts: [14, 191, 2812] },
  { name: 'check evasions and underpromotions', fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq -', counts: [6, 264, 9467] },
  { name: 'promotion checks', fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ -', counts: [44, 1486, 62379] },
  { name: 'middlegame legality', fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - -', counts: [46, 2079, 89890] },
]

for (const benchmark of benchmarks) test(`chess reference perft: ${benchmark.name}, either colour`, () => {
  const original = fromFen(benchmark.fen)
  for (const position of [original, mirror(original)]) {
    const before = structuredClone(position)
    assert.deepEqual(benchmark.counts.map((_, i) => perft(position, i + 1)), benchmark.counts)
    assert.deepEqual(position, before)
  }
})

test('en passant can remove a checking pawn, and expires after a different reply', () => {
  for (const position of [fromFen('4k3/3p4/8/4P3/4K3/8/8/8 b - -'), mirror(fromFen('4k3/3p4/8/4P3/4K3/8/8/8 b - -'))]) {
    const pawnSide = other(position.side)
    const source = position.side === 'black' ? 1 : 6
    const next = applyMove(position.board, position.meta, { fromR: source, fromC: 3, toR: source + (position.side === 'black' ? 2 : -2), toC: 3 })
    assert.equal(inCheck(next.board, pawnSide), true)
    const pawnRow = pawnSide === 'white' ? 3 : 4
    const capture = legalMovesFromChecked(next.board, next.meta, pawnRow, 4).find(move => move.toC === 3)
    assert.ok(capture)
    const escaped = applyMove(next.board, next.meta, capture)
    assert.equal(inCheck(escaped.board, pawnSide), false)
    assert.equal(escaped.board[pawnRow][3], null)

    const king = next.board.flatMap((row, r) => row.flatMap((piece, c) => piece?.type === 'k' && piece.side === pawnSide ? [[r, c]] : []))[0]
    const quiet = legalMovesFromChecked(next.board, next.meta, king[0], king[1]).find(move => !next.board[move.toR][move.toC])
    assert.ok(quiet)
    const expired = applyMove(next.board, next.meta, quiet)
    assert.equal(expired.meta.enPassant, null)
    assert.equal(legalMovesFromChecked(expired.board, expired.meta, pawnRow, 4).some(move => move.toC === 3), false)
  }
})

test('a pinned enemy knight still attacks a king destination', () => {
  // FIDE 3.1.3 / 3.9.1: pinned pieces still attack squares.
  // https://handbook.fide.com/chapter/E012023
  const position = fromFen('4k3/8/8/8/8/8/4n1K1/4R3 w - -')
  assert.deepEqual(legalMovesFromChecked(position.board, position.meta, 6, 4), [])
  assert.equal(inCheck(position.board, 'white'), false)
  assert.equal(legalMovesFromChecked(position.board, position.meta, 6, 6).some(move => move.toR === 7 && move.toC === 6), false)
})

test('checkmate and stalemate both have no legal AI move but differ in check status', () => {
  const mate = fromFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq -')
  const stale = fromFen('k7/2Q5/2K5/8/8/8/8/8 b - -')
  for (const [original, checked] of [[mate, true], [stale, false]] as const) for (const position of [original, mirror(original)]) {
    assert.equal(inCheck(position.board, position.side), checked)
    assert.deepEqual(allLegalMovesChecked(position.board, position.meta, position.side), [])
    assert.equal(pickAiMoveChess(position.board, position.meta, position.side, 0), null)
  }
})

test('seeded legal chess playouts preserve identities, material, rights and AI legality', () => {
  const originalClock = Object.getOwnPropertyDescriptor(performance, 'now')
  for (let seed = 1; seed <= 4; seed++) {
    let position: Position = { board: createInitialBoard(), meta: initialMeta(), side: 'white' }
    let random = seed
    for (let ply = 0; ply < 80; ply++) {
      const legal = allLegalMovesChecked(position.board, position.meta, position.side)
      if (!legal.length) break
      assert.equal(new Set(legal.map(move => JSON.stringify(move))).size, legal.length)
      const before = structuredClone(position)
      if (ply % 20 === 0) {
        let clock = 0, selected
        Object.defineProperty(performance, 'now', { configurable: true, value: () => clock += .5 })
        try { selected = pickAiMoveChess(position.board, position.meta, position.side, 0) }
        finally {
          if (originalClock) Object.defineProperty(performance, 'now', originalClock)
          else Reflect.deleteProperty(performance, 'now')
        }
        assert.ok(selected)
        assert.ok(legal.some(move => JSON.stringify(move) === JSON.stringify(selected)))
        assert.ok(clock < 28)
      }
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0
      const move = legal[random % legal.length]
      const piece = position.board[move.fromR][move.fromC]!
      const captured = !!position.board[move.toR][move.toC] || (piece.type === 'p' && move.fromC !== move.toC)
      const next = applyMove(position.board, position.meta, move)
      assert.deepEqual(position, before)
      assert.equal(inCheck(next.board, position.side), false)
      assert.equal(next.board[move.toR][move.toC]?.id, piece.id)
      assert.equal(next.board.flat().filter(Boolean).length, position.board.flat().filter(Boolean).length - Number(captured))
      const ids = next.board.flat().flatMap(cell => cell ? [cell.id] : [])
      assert.equal(new Set(ids).size, ids.length)
      const priorIds = new Set(position.board.flat().flatMap(cell => cell ? [cell.id] : []))
      assert.ok(ids.every(id => priorIds.has(id)))
      for (const side of ['white', 'black'] as const) {
        assert.equal(next.board.flat().filter(cell => cell?.type === 'k' && cell.side === side).length, 1)
        for (const wing of ['kingside', 'queenside'] as const) assert.ok(position.meta.castling[side][wing] || !next.meta.castling[side][wing])
      }
      if (next.meta.enPassant) {
        assert.equal(piece.type, 'p')
        assert.equal(Math.abs(move.toR - move.fromR), 2)
        assert.equal(next.board[next.meta.enPassant[0]][next.meta.enPassant[1]], null)
      }
      position = { ...next, side: other(position.side) }
    }
  }
})
