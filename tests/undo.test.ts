import assert from 'node:assert/strict'
import test from 'node:test'
import { isDeepStrictEqual } from 'node:util'
import { getUndoIndex } from '../src/games/undo.ts'
import { applyMove as applyChessMove, initialMeta, snapshotBoard as snapshotChessBoard, snapshotMeta } from '../src/games/chess/chessBoard.ts'
import { allLegalMovesChecked as legalChessMoves } from '../src/games/chess/chessMoves.ts'
import type { Board as ChessBoard, GameMeta, Move as ChessMove, Side as ChessSide } from '../src/games/chess/chessTypes.ts'
import { createGoPosition, playGoMove } from '../src/games/go/goLogic.ts'
import type { GoMove, GoPosition } from '../src/games/go/goTypes.ts'
import { applyShogiMove, emptyHand, snapshotBoard as snapshotShogiBoard, snapshotHand } from '../src/games/shogi/shogiBoard.ts'
import { allLegalMovesChecked as legalShogiMoves } from '../src/games/shogi/shogiMoves.ts'
import type { Board as ShogiBoard, Hand, Move as ShogiMove, Side as ShogiSide } from '../src/games/shogi/shogiTypes.ts'
import { applyMove as applyJunqiMove, snapshotBoard as snapshotJunqiBoard } from '../src/games/junqi/junqiBoard.ts'
import { resolveCombat } from '../src/games/junqi/junqiCombat.ts'
import { legalMovesFrom as legalJunqiMoves } from '../src/games/junqi/junqiMoves.ts'
import type { Board as JunqiBoard, Move as JunqiMove, PieceType as JunqiType, Side as JunqiSide } from '../src/games/junqi/junqiTypes.ts'

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

// Exercise the public snapshot contract used by every game, without a search or UI timer.
function restore<P extends { turn: unknown }>(history: readonly P[], mode: 'local' | 'ai', humanSide: P['turn']) {
  const index = getUndoIndex(history, mode, humanSide)
  return index < 0 ? null : { position: history[index], history: history.slice(0, index) }
}

test('practice undo works for every side representation, with no move-count quota', () => {
  const pairs = [[1, 2], ['red', 'black'], ['white', 'black'], ['sente', 'gote'], ['red', 'blue']] as const
  for (const pair of pairs) {
    for (const humanSide of pair) {
      const aiSide = pair.find((side) => side !== humanSide)!
      const history = Array.from({ length: 160 }, (_, ply) => ({ turn: ply % 2 === 0 ? humanSide : aiSide, ply }))
      const original = structuredClone(history)
      freeze(history)
      let remaining = history
      for (let expectedPly = 158; expectedPly >= 0; expectedPly -= 2) {
        const undone = restore(remaining, 'ai', humanSide)
        assert.ok(undone)
        assert.equal(undone.position.ply, expectedPly)
        assert.equal(undone.position.turn, humanSide)
        remaining = undone.history
      }
      assert.equal(restore(remaining, 'ai', humanSide), null)
      assert.deepEqual(history, original)

      remaining = history
      for (let expectedPly = 159; expectedPly >= 0; expectedPly--) {
        const undone = restore(remaining, 'local', humanSide)
        assert.ok(undone)
        assert.equal(undone.position.ply, expectedPly)
        remaining = undone.history
      }
      assert.equal(restore(remaining, 'local', humanSide), null)
    }
  }
})

test('empty history and an AI opening without a human decision cannot be undone in practice mode', () => {
  assert.equal(getUndoIndex([], 'ai', 'white'), -1)
  assert.equal(getUndoIndex([], 'local', 'white'), -1)
  const aiOnly = freeze([{ turn: 'black' }, { turn: 'black' }])
  assert.equal(getUndoIndex(aiOnly, 'ai', 'white'), -1)
  assert.equal(getUndoIndex(aiOnly, 'local', 'white'), 1)
})

test('an unfinished or failed AI reply removes only the pending human move', () => {
  const previousRound = [{ turn: 'white', ply: 0 }, { turn: 'black', ply: 1 }]
  const waiting = freeze([...previousRound, { turn: 'white', ply: 2 }])
  // A failed calculation adds no move: its history is identical to a pending reply.
  for (const aiError of [false, true]) {
    const current = { turn: 'black', ply: 3, aiError }
    const undone = restore(waiting, 'ai', 'white')
    assert.ok(undone)
    assert.equal(undone.position.ply, 2)
    assert.deepEqual(undone.history, previousRound)
    assert.equal(current.ply, 3)
  }
})

test('a winning move does not need to advance the current turn for practice undo to find the decision', () => {
  const beforeHumanWin = freeze([{ turn: 1, winner: null }])
  const beforeAiWin = freeze([{ turn: 1, winner: null }, { turn: 2, winner: null }])
  for (const history of [beforeHumanWin, beforeAiWin]) {
    const undone = restore(history, 'ai', 1)
    assert.ok(undone)
    assert.equal(undone.position.turn, 1)
    assert.equal(undone.position.winner, null)
    assert.deepEqual(undone.history, [])
  }
})

function goPlay(position: GoPosition, history: GoPosition[], move: GoMove): GoPosition {
  const next = playGoMove(position, move)
  assert.ok(next.ok, `illegal Go fixture: ${JSON.stringify(move)}`)
  history.push(structuredClone(position))
  return next.position
}

test('Go practice undo restores captures, simple-ko history and scored endings together', () => {
  const initial = createGoPosition()
  for (const [r, c] of [[2, 3], [3, 2], [4, 3]]) initial.board[r][c] = 1
  for (const [r, c] of [[3, 3], [2, 4], [4, 4], [3, 5]]) initial.board[r][c] = 2
  const original = structuredClone(initial)
  const history: GoPosition[] = []
  let position = goPlay(initial, history, { type: 'place', r: 3, c: 4 })
  assert.deepEqual(playGoMove(position, { type: 'place', r: 3, c: 3 }), { ok: false, reason: 'ko' })
  position = goPlay(position, history, { type: 'place', r: 8, c: 8 })
  const beforePasses = structuredClone(position)
  position = goPlay(position, history, { type: 'pass' })
  position = goPlay(position, history, { type: 'pass' })
  assert.equal(position.result?.reason, 'score')
  assert.equal(position.consecutivePasses, 2)

  const first = restore(freeze(history), 'ai', 1)
  assert.ok(first)
  assert.deepEqual(first.position, beforePasses)
  assert.equal(first.position.result, null)
  assert.equal(first.position.captures.black, 1)
  assert.equal(first.position.consecutivePasses, 0)
  assert.equal(first.position.moveNumber, 2)
  assert.ok(playGoMove(first.position, { type: 'place', r: 7, c: 7 }).ok)
  const second = restore(first.history, 'ai', 1)
  assert.ok(second)
  assert.deepEqual(second.position, original)
  const recaptured = playGoMove(second.position, { type: 'place', r: 3, c: 4 })
  assert.ok(recaptured.ok)
  assert.deepEqual(playGoMove(recaptured.position, { type: 'place', r: 3, c: 3 }), { ok: false, reason: 'ko' })
  assert.equal(restore(second.history, 'ai', 1), null)
})

test('Go local undo preserves the preceding pass and allows a scored game to continue', () => {
  const history: GoPosition[] = []
  let position = goPlay(createGoPosition(), history, { type: 'pass' })
  const passed = structuredClone(position)
  position = goPlay(position, history, { type: 'pass' })
  assert.equal(position.result?.winner, 2)
  const undone = restore(freeze(history), 'local', 1)
  assert.ok(undone)
  assert.deepEqual(undone.position, passed)
  const continued = playGoMove(undone.position, { type: 'place', r: 4, c: 4 })
  assert.ok(continued.ok)
  assert.equal(continued.position.result, null)
  assert.equal(continued.position.consecutivePasses, 0)
})

type ChessPosition = { board: ChessBoard; meta: GameMeta; turn: ChessSide; lastMove: ChessMove | null }

function chessPosition(): ChessPosition {
  const board: ChessBoard = Array.from({ length: 8 }, () => Array(8).fill(null))
  board[7][4] = { id: 'white-king', side: 'white', type: 'k' }
  board[0][7] = { id: 'black-king', side: 'black', type: 'k' }
  return { board, meta: initialMeta(), turn: 'white', lastMove: null }
}

function chessPlay(position: ChessPosition, history: ChessPosition[], move: ChessMove): ChessPosition {
  assert.ok(legalChessMoves(position.board, position.meta, position.turn).some((candidate) => isDeepStrictEqual(candidate, move)), `illegal Chess fixture: ${JSON.stringify(move)}`)
  history.push({ ...position, board: snapshotChessBoard(position.board), meta: snapshotMeta(position.meta) })
  return { ...applyChessMove(position.board, position.meta, move), turn: position.turn === 'white' ? 'black' : 'white', lastMove: move }
}

test('Chess practice undo restores both castling pieces and their rights after the computer reply', () => {
  const initial = chessPosition()
  initial.board[7][7] = { id: 'white-rook', side: 'white', type: 'r' }
  const original = structuredClone(initial)
  const history: ChessPosition[] = []
  let position = chessPlay(initial, history, { fromR: 7, fromC: 4, toR: 7, toC: 6, castle: 'kingside' })
  position = chessPlay(position, history, { fromR: 0, fromC: 7, toR: 0, toC: 6 })
  assert.equal(position.meta.castling.white.kingside, false)
  const undone = restore(freeze(history), 'ai', 'white')
  assert.ok(undone)
  assert.deepEqual(undone.position, original)
  assert.ok(legalChessMoves(undone.position.board, undone.position.meta, 'white').some((move) => move.castle === 'kingside'))
})

test('Chess practice undo restores the en-passant opportunity and the pawn captured off the destination', () => {
  const initial = chessPosition()
  initial.turn = 'black'
  initial.board[3][4] = { id: 'white-pawn', side: 'white', type: 'p' }
  initial.board[1][5] = { id: 'black-pawn', side: 'black', type: 'p' }
  const history: ChessPosition[] = []
  let position = chessPlay(initial, history, { fromR: 1, fromC: 5, toR: 3, toC: 5 })
  const beforeCapture = structuredClone(position)
  position = chessPlay(position, history, { fromR: 3, fromC: 4, toR: 2, toC: 5 })
  position = chessPlay(position, history, { fromR: 0, fromC: 7, toR: 1, toC: 7 })
  assert.equal(position.board[3][5], null)
  assert.equal(position.meta.enPassant, null)
  const undone = restore(freeze(history), 'ai', 'white')
  assert.ok(undone)
  assert.deepEqual(undone.position, beforeCapture)
  assert.deepEqual(undone.position.meta.enPassant, [2, 5])
  assert.equal(undone.position.board[3][5]?.id, 'black-pawn')
  const replayed = chessPlay(undone.position, [], { fromR: 3, fromC: 4, toR: 2, toC: 5 })
  assert.equal(replayed.board[3][5], null)
  assert.equal(replayed.board[2][5]?.id, 'white-pawn')
})

test('Chess practice undo turns a promoted capture back into a pawn and restores its victim', () => {
  const initial = chessPosition()
  initial.board[1][2] = { id: 'white-pawn', side: 'white', type: 'p' }
  initial.board[0][3] = { id: 'black-rook', side: 'black', type: 'r' }
  const original = structuredClone(initial)
  const history: ChessPosition[] = []
  let position = chessPlay(initial, history, { fromR: 1, fromC: 2, toR: 0, toC: 3, promotion: 'n' })
  position = chessPlay(position, history, { fromR: 0, fromC: 7, toR: 1, toC: 7 })
  assert.equal(position.board[0][3]?.type, 'n')
  const undone = restore(freeze(history), 'ai', 'white')
  assert.ok(undone)
  assert.deepEqual(undone.position, original)
  const choices = legalChessMoves(undone.position.board, undone.position.meta, 'white').filter((move) => move.toR === 0 && move.toC === 3)
  assert.deepEqual(choices.map((move) => move.promotion).sort(), ['b', 'n', 'q', 'r'])
})

type ShogiPosition = { board: ShogiBoard; hand: Hand; turn: ShogiSide; lastMove: ShogiMove | null }

function shogiPlay(position: ShogiPosition, history: ShogiPosition[], move: ShogiMove): ShogiPosition {
  assert.ok(legalShogiMoves(position.board, position.hand, position.turn).some((candidate) => isDeepStrictEqual(candidate, move)), `illegal Shogi fixture: ${JSON.stringify(move)}`)
  history.push({ ...position, board: snapshotShogiBoard(position.board), hand: snapshotHand(position.hand) })
  return { ...applyShogiMove(position.board, position.hand, move, position.turn), turn: position.turn === 'sente' ? 'gote' : 'sente', lastMove: move }
}

test('Shogi practice undo restores drop inventories, captured promoted pieces and promotion choices', () => {
  const board: ShogiBoard = Array.from({ length: 9 }, () => Array(9).fill(null))
  board[8][8] = { id: 'sente-king', side: 'sente', type: 'k', promoted: false }
  board[0][0] = { id: 'gote-king', side: 'gote', type: 'k', promoted: false }
  board[3][4] = { id: 'sente-silver', side: 'sente', type: 's', promoted: false }
  board[2][5] = { id: 'gote-tokin', side: 'gote', type: 'p', promoted: true }
  const initial: ShogiPosition = { board, hand: emptyHand(), turn: 'sente', lastMove: null }
  const original = structuredClone(initial)
  const history: ShogiPosition[] = []
  let position = shogiPlay(initial, history, { fromR: 3, fromC: 4, toR: 2, toC: 5, promote: true })
  position = shogiPlay(position, history, { fromR: 0, fromC: 0, toR: 0, toC: 1 })
  assert.deepEqual(position.hand.sente, ['p'])
  assert.equal(position.board[2][5]?.promoted, true)
  const beforeDrop = structuredClone(position)
  position = shogiPlay(position, history, { dropType: 'p', toR: 4, toC: 4 })
  position = shogiPlay(position, history, { fromR: 0, fromC: 1, toR: 0, toC: 0 })
  assert.deepEqual(position.hand.sente, [])
  assert.equal(position.board[4][4]?.promoted, false)

  const first = restore(freeze(history), 'ai', 'sente')
  assert.ok(first)
  assert.deepEqual(first.position, beforeDrop)
  assert.deepEqual(first.position.hand.sente, ['p'])
  assert.equal(first.position.board[4][4], null)
  const redrop = shogiPlay(first.position, [], { dropType: 'p', toR: 4, toC: 4 })
  assert.deepEqual(redrop.hand.sente, [])
  const second = restore(first.history, 'ai', 'sente')
  assert.ok(second)
  assert.deepEqual(second.position, original)
  assert.equal(second.position.board[2][5]?.id, 'gote-tokin')
  assert.equal(second.position.board[2][5]?.promoted, true)
  assert.deepEqual(second.position.hand.sente, [])
})

type JunqiPosition = { board: JunqiBoard; turn: JunqiSide; lastMove: JunqiMove | null }

function junqiPosition(attackerType: JunqiType = 'engineer', defenderType: JunqiType = 'mine'): JunqiPosition {
  const board: JunqiBoard = Array.from({ length: 6 }, () => Array(12).fill(null))
  board[5][5] = { id: 'red-flag', side: 'red', type: 'flag', revealed: false }
  board[0][5] = { id: 'blue-flag', side: 'blue', type: 'flag', revealed: false }
  board[2][5] = { id: 'red-attacker', side: 'red', type: attackerType, revealed: false, hasMoved: false, hasTurned: false }
  board[3][5] = { id: 'blue-defender', side: 'blue', type: defenderType, revealed: false }
  board[2][10] = { id: 'blue-reply', side: 'blue', type: 'company', revealed: false }
  return { board, turn: 'red', lastMove: null }
}

function junqiPlay(position: JunqiPosition, history: JunqiPosition[], move: JunqiMove): JunqiPosition {
  assert.ok(legalJunqiMoves(position.board, move.fromR, move.fromC, position.turn).some((candidate) => isDeepStrictEqual(candidate, move)), `illegal Junqi fixture: ${JSON.stringify(move)}`)
  history.push({ ...position, board: snapshotJunqiBoard(position.board) })
  const attacker = position.board[move.fromR][move.fromC]!
  const defender = position.board[move.toR][move.toC]
  const outcome = defender ? resolveCombat(attacker, defender) : 'none'
  return { board: applyJunqiMove(position.board, move, outcome), turn: position.turn === 'red' ? 'blue' : 'red', lastMove: move }
}

test('Junqi practice undo conceals combat revelations and restores eliminated pieces for every outcome', () => {
  for (const attacker of ['engineer', 'company', 'bomb'] as const) {
    const initial = junqiPosition(attacker)
    const original = structuredClone(initial)
    const history: JunqiPosition[] = []
    let position = junqiPlay(initial, history, { fromR: 2, fromC: 5, toR: 3, toC: 5 })
    if (attacker === 'bomb') assert.equal(position.board[3][5], null)
    else assert.equal(position.board[3][5]?.revealed, true)
    position = junqiPlay(position, history, { fromR: 2, fromC: 10, toR: 1, toC: 10 })
    assert.equal(position.turn, 'red')
    assert.equal(position.board[1][10]?.hasMoved, true)
    const undone = restore(freeze(history), 'ai', 'red')
    assert.ok(undone)
    assert.deepEqual(undone.position, original)
    assert.equal(undone.position.board[2][5]?.revealed, false)
    assert.equal(undone.position.board[3][5]?.revealed, false)
    assert.equal(undone.position.board[2][5]?.hasMoved, false)
    assert.equal(undone.position.board[2][10]?.hasMoved, undefined)
  }
})

test('Junqi practice undo removes public movement and railway-turn facts acquired after the decision', () => {
  const initial = junqiPosition()
  initial.board[2][5] = initial.board[3][5] = null
  initial.board[4][1] = { id: 'red-engineer', side: 'red', type: 'engineer', revealed: false }
  const original = structuredClone(initial)
  const history: JunqiPosition[] = []
  let position = junqiPlay(initial, history, { fromR: 4, fromC: 1, toR: 1, toC: 6 })
  assert.equal(position.board[1][6]?.hasMoved, true)
  assert.equal(position.board[1][6]?.hasTurned, true)
  assert.equal(position.board[1][6]?.revealed, false)
  position = junqiPlay(position, history, { fromR: 2, fromC: 10, toR: 1, toC: 10 })
  assert.equal(position.turn, 'red')
  assert.equal(position.board[1][10]?.hasMoved, true)
  const undone = restore(freeze(history), 'ai', 'red')
  assert.ok(undone)
  assert.deepEqual(undone.position, original)
  assert.equal(undone.position.board[4][1]?.hasMoved, undefined)
  assert.equal(undone.position.board[4][1]?.hasTurned, undefined)
})
