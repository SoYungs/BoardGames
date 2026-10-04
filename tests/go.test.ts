import assert from 'node:assert/strict'
import test from 'node:test'
import { pickAiMoveGo } from '../src/games/go/goAi.ts'
import { createGoPosition, emptyGoBoard, getGoGroup, getGoGroups, legalGoMoves, playGoMove, scoreGoBoard } from '../src/games/go/goLogic.ts'
import type { GoBoard, GoMove, GoPosition, GoSide } from '../src/games/go/goTypes.ts'

function setup(black: [number, number][], white: [number, number][], turn: GoSide = 1): GoPosition {
  const position = createGoPosition()
  for (const [r, c] of black) position.board[r][c] = 1
  for (const [r, c] of white) position.board[r][c] = 2
  position.turn = turn
  return position
}

function play(position: GoPosition, move: GoMove): GoPosition {
  const result = playGoMove(position, move)
  assert.ok(result.ok, `${JSON.stringify(move)} should be legal`)
  return result.position
}

function koPosition(): GoPosition {
  return setup([[2, 3], [3, 2], [4, 3]], [[3, 3], [2, 4], [4, 4], [3, 5]])
}

test('groups connect orthogonally and count each liberty once, including board edges', () => {
  const position = setup([[0, 0], [0, 1], [1, 0]], [[2, 2]])
  const group = getGoGroup(position.board, 0, 0)!
  assert.equal(group.stones.length, 3)
  assert.deepEqual(group.liberties.map((p) => `${p.r},${p.c}`).sort(), ['0,2', '1,1', '2,0'])
  assert.equal(getGoGroups(position.board).length, 2)
  assert.equal(getGoGroup(position.board, 8, 8), null)
})

test('a move captures all adjacent enemy groups and does not mutate earlier positions', () => {
  const position = setup([[2, 4], [3, 3], [3, 5], [4, 2], [5, 3]], [[3, 4], [4, 3]])
  const original = structuredClone(position)
  const result = playGoMove(position, { type: 'place', r: 4, c: 4 })
  assert.ok(result.ok)
  assert.equal(result.captured.length, 2)
  assert.equal(result.position.board[3][4], 0)
  assert.equal(result.position.board[4][3], 0)
  assert.equal(result.position.captures.black, 2)
  assert.equal(result.position.turn, 2)
  assert.equal(result.position.moveNumber, 1)
  assert.deepEqual(position, original)
})

test('touching the same captured group twice does not count its stones twice', () => {
  const position = setup([[2, 4], [3, 5], [2, 3], [3, 2], [4, 2], [5, 3]], [[3, 4], [3, 3], [4, 3]])
  const result = playGoMove(position, { type: 'place', r: 4, c: 4 })
  assert.ok(result.ok)
  assert.equal(result.captured.length, 3)
  assert.equal(result.position.captures.black, 3)
})

test('suicide is forbidden for both isolated stones and an entire connected own group', () => {
  const isolated = setup([], [[3, 4], [5, 4], [4, 3], [4, 5]])
  const connected = setup([[4, 3]], [[3, 3], [5, 3], [4, 2], [3, 4], [5, 4], [4, 5]])
  for (const position of [isolated, connected]) {
    const original = structuredClone(position)
    assert.deepEqual(playGoMove(position, { type: 'place', r: 4, c: 4 }), { ok: false, reason: 'suicide' })
    assert.deepEqual(position, original)
  }
})

test('capturing happens before suicide is checked, so a surrounded capture is legal', () => {
  const position = setup([[1, 2], [2, 1], [2, 3]], [[2, 2], [3, 1], [3, 3], [4, 2]])
  const result = playGoMove(position, { type: 'place', r: 3, c: 2 })
  assert.ok(result.ok)
  assert.deepEqual(result.captured, [{ r: 2, c: 2 }])
  assert.equal(getGoGroup(result.position.board, 3, 2)?.liberties.length, 1)
})

test('simple ko forbids immediate recapture and permits recapture after intervening play', () => {
  const original = koPosition()
  const captured = play(original, { type: 'place', r: 3, c: 4 })
  assert.deepEqual(playGoMove(captured, { type: 'place', r: 3, c: 3 }), { ok: false, reason: 'ko' })
  assert.equal(legalGoMoves(captured).some((m) => m.type === 'place' && m.r === 3 && m.c === 3), false)
  const threat = play(captured, { type: 'place', r: 8, c: 8 })
  const response = play(threat, { type: 'place', r: 8, c: 7 })
  const recaptured = play(response, { type: 'place', r: 3, c: 3 })
  assert.equal(recaptured.board[3][4], 0)
  assert.equal(recaptured.board[3][3], 2)
})

test('passing updates the simple-ko board and an intervening turn releases the ban', () => {
  const captured = play(koPosition(), { type: 'place', r: 3, c: 4 })
  const passed = play(captured, { type: 'pass' })
  assert.equal(passed.consecutivePasses, 1)
  assert.deepEqual(passed.koBoard, captured.board)
  const next = play(passed, { type: 'place', r: 8, c: 8 })
  assert.equal(next.consecutivePasses, 0)
  assert.ok(playGoMove(next, { type: 'place', r: 3, c: 3 }).ok)
})

test('snapback is legal: immediately recapturing several stones does not recreate the old board', () => {
  const position = setup(
    [[2, 3], [2, 4], [3, 2], [4, 3]],
    [[3, 3], [1, 3], [1, 4], [2, 2], [2, 5], [3, 5], [4, 4]],
  )
  const captured = playGoMove(position, { type: 'place', r: 3, c: 4 })
  assert.ok(captured.ok)
  assert.equal(captured.captured.length, 1)
  const snapback = playGoMove(captured.position, { type: 'place', r: 3, c: 3 })
  assert.ok(snapback.ok)
  assert.equal(snapback.captured.length, 3)
  assert.equal(snapback.position.captures.white, 3)
})

test('two consecutive passes end the game with area scoring and 6.5 white komi', () => {
  const first = play(createGoPosition(), { type: 'pass' })
  assert.equal(first.result, null)
  const ended = play(first, { type: 'pass' })
  assert.equal(ended.result?.reason, 'score')
  assert.equal(ended.result?.winner, 2)
  assert.equal(ended.result?.margin, 6.5)
  assert.equal(ended.result?.score?.neutral, 81)
  assert.deepEqual(playGoMove(ended, { type: 'place', r: 4, c: 4 }), { ok: false, reason: 'finished' })
  assert.deepEqual(legalGoMoves(ended), [])

  const resumed = play(first, { type: 'place', r: 4, c: 4 })
  assert.equal(resumed.consecutivePasses, 0)
  assert.equal(play(resumed, { type: 'pass' }).result, null)
})

test('area scoring counts enclosed edge and corner empties, while mixed borders are neutral', () => {
  const position = setup([[0, 1], [1, 0], [0, 2], [0, 4], [1, 3]], [[8, 7], [7, 8]])
  const score = scoreGoBoard(position.board)
  assert.equal(score.ownership[0][0], 1)
  assert.equal(score.ownership[0][3], 1)
  assert.equal(score.ownership[8][8], 2)
  assert.equal(score.ownership[4][4], 0)
  assert.equal(score.black.stones, 5)
  assert.equal(score.black.territory, 2)
  assert.equal(score.black.total, 7)
  assert.equal(score.white.stones, 2)
  assert.equal(score.white.territory, 1)
  assert.equal(score.white.total, 9.5)
  assert.equal(score.neutral, 71)
  assert.equal(score.black.total + score.white.total - score.white.komi + score.neutral, 81)

  const mixed = scoreGoBoard(setup([[0, 1]], [[1, 0]]).board)
  assert.equal(mixed.ownership[0][0], 0)
})

test('score counts stones still on the board and never removes presumed dead groups or adds prisoners', () => {
  const position = setup([[3, 4], [5, 4], [4, 3], [3, 5], [5, 5], [4, 6]], [[4, 4]])
  position.captures.black = 20
  const score = scoreGoBoard(position.board)
  assert.equal(score.white.stones, 1)
  const ended = play(play(position, { type: 'pass' }), { type: 'pass' })
  assert.deepEqual(ended.result?.score, score)
  assert.equal(ended.board[4][4], 2)
})

test('either colour can resign, regardless of whose turn it is, and snapshots preserve ko and pass state', () => {
  for (const side of [1, 2] as const) {
    const position = play(createGoPosition(), { type: 'place', r: 4, c: 4 })
    const ended = play(position, { type: 'resign', side })
    assert.equal(ended.result?.winner, side === 1 ? 2 : 1)
    assert.equal(ended.result?.reason, 'resign')
    assert.equal(position.result, null)
    assert.equal(position.moveNumber, 1)
    assert.deepEqual(position.koBoard, emptyGoBoard())
  }
})

test('invalid or occupied points cannot advance the turn or change the board', () => {
  const position = setup([[4, 4]], [])
  assert.deepEqual(playGoMove(position, { type: 'place', r: 4, c: 4 }), { ok: false, reason: 'occupied' })
  for (const [r, c] of [[-1, 0], [9, 0], [0, 9], [.5, 0], [NaN, 0]]) {
    assert.deepEqual(playGoMove(position, { type: 'place', r, c }), { ok: false, reason: 'outside' })
  }
  assert.equal(position.moveNumber, 0)
  assert.equal(position.turn, 1)
})

function exchangeColours(board: GoBoard): GoBoard {
  return board.map((row) => row.map((cell) => cell === 1 ? 2 : cell === 2 ? 1 : 0))
}

test('AI takes an immediate capture for either colour without mutating the position', () => {
  for (const side of [1, 2] as const) {
    const position = setup([[3, 4], [5, 4], [4, 3]], [[4, 4]], side)
    if (side === 2) position.board = exchangeColours(position.board)
    const original = structuredClone(position)
    assert.deepEqual(pickAiMoveGo(position, side, 100), { type: 'place', r: 4, c: 5 })
    assert.deepEqual(position, original)
  }
})

test('AI rescues its own group in atari instead of ignoring an immediate capture threat', () => {
  const position = setup([[4, 4]], [[3, 4], [5, 4], [4, 3]])
  assert.deepEqual(pickAiMoveGo(position, 1, 150), { type: 'place', r: 4, c: 5 })
})

test('AI connects its groups while cutting the opposing groups', () => {
  const position = setup([[3, 4], [5, 4]], [[4, 3], [4, 5]])
  assert.deepEqual(pickAiMoveGo(position, 1, 150), { type: 'place', r: 4, c: 4 })
})

test('AI honours suicide and ko, and passes instead of filling its secure eyes', () => {
  const ko = play(koPosition(), { type: 'place', r: 3, c: 4 })
  const chosen = pickAiMoveGo(ko, 2, 35)
  assert.ok(chosen)
  assert.ok(playGoMove(ko, chosen).ok)
  assert.notDeepEqual(chosen, { type: 'place', r: 3, c: 3 })

  const eyes = createGoPosition()
  eyes.board = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 1 as const))
  eyes.board[4][3] = 0
  eyes.board[4][5] = 0
  assert.deepEqual(pickAiMoveGo(eyes, 1, 35), { type: 'pass' })
  const ended = play(play(eyes, { type: 'pass' }), { type: 'pass' })
  assert.equal(pickAiMoveGo(ended, ended.turn, 35), null)
})

test('AI respects its bounded budget and always supplies a legal move on an open board', () => {
  const position = createGoPosition()
  const started = performance.now()
  const chosen = pickAiMoveGo(position, 1, 40)
  assert.ok(chosen)
  assert.ok(playGoMove(position, chosen).ok)
  assert.ok(performance.now() - started < 500, 'a 40 ms search should finish promptly, with generous CI headroom')
})
