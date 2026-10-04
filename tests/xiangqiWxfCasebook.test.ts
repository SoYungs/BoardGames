import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { applyMove } from '../src/games/xiangqi/xiangqiBoard.ts'
import { allLegalMovesChecked } from '../src/games/xiangqi/xiangqiMoves.ts'
import { getWxfRepetitionResult, getWxfRepetitionWarning, type WxfPositionRecord, type WxfRepetitionResult } from '../src/games/xiangqi/xiangqiWxfRepetition.ts'
import type { Board, Move, PieceType, Side } from '../src/games/xiangqi/xiangqiTypes.ts'

// Independent playback of chess-position facts, without copying source-engine
// algorithms or test functions. Rules: WXF 2018, and their explanation at
// https://arxiv.org/html/2412.17334v1. Fixture provenance includes both URLs.
// The source examples adjudicate an early warning; the final assertions extend
// their actual closed cycle to the four occurrences needed for an ordinary draw.
interface CaseFact {
  id: string
  sourceLine: number
  diagram: number | null
  diagramGroup?: number[]
  fen: string
  moves: string[]
  expected: 'win' | 'loss' | 'draw'
}

const facts = (JSON.parse(readFileSync(new URL('./fixtures/xiangqi-wxf-cases.json', import.meta.url), 'utf8')) as { cases: CaseFact[] }).cases
const other = (side: Side): Side => side === 'red' ? 'black' : 'red'

function readPosition(text: string): WxfPositionRecord {
  const [placement, side] = text.split(/\s+/)
  assert.ok(side === 'w' || side === 'b', `invalid FEN side: ${text}`)
  const board: Board = placement.split('/').map((row, rowIndex) => {
    const cells: Board[number] = []
    for (const character of row) {
      if (/^[1-9]$/.test(character)) cells.push(...Array<null>(Number(character)).fill(null))
      else {
        const letter = character.toLowerCase().replace('h', 'n').replace('e', 'b')
        assert.match(letter, /^[kabnrcp]$/)
        cells.push({ id: `case-${rowIndex}-${cells.length}`, type: letter as PieceType, side: character === character.toUpperCase() ? 'red' : 'black' })
      }
    }
    assert.equal(cells.length, 9, `invalid FEN row: ${text}`)
    return cells
  })
  assert.equal(board.length, 10, `invalid FEN height: ${text}`)
  return { board, turn: side === 'w' ? 'red' : 'black' }
}

function readMove(text: string): Move {
  assert.match(text, /^[a-i][0-9][a-i][0-9]$/)
  return { fromR: 9 - Number(text[1]), fromC: text.charCodeAt(0) - 97, toR: 9 - Number(text[3]), toC: text.charCodeAt(2) - 97 }
}

function positionKey(state: WxfPositionRecord): string {
  return state.turn + ':' + state.board.map(row => row.map(piece => piece ? `${piece.side[0]}${piece.type}` : '.').join('')).join('/')
}

function playMoves(states: WxfPositionRecord[], moves: readonly string[], label: string): void {
  for (const text of moves) {
    const before = states.at(-1)!, move = readMove(text)
    const legal = allLegalMovesChecked(before.board, before.turn)
    assert.ok(legal.some(candidate => candidate.fromR === move.fromR && candidate.fromC === move.fromC && candidate.toR === move.toR && candidate.toC === move.toC), `${label}: illegal ${before.turn} move ${text} at ply ${states.length}`)
    states.push({ board: applyMove(before.board, move.fromR, move.fromC, move.toR, move.toC), turn: other(before.turn) })
  }
}

function perspective(result: WxfRepetitionResult | null, turn: Side): 'win' | 'loss' | 'draw' | 'undecided' {
  if (!result) return 'undecided'
  if (result.kind === 'repetition-draw') return 'draw'
  return result.winner === turn ? 'win' : 'loss'
}

test('the independently extracted source casebook retains all 171 nonempty adjudication facts', () => {
  assert.equal(facts.length, 171)
  assert.equal(new Set(facts.map(fact => fact.id)).size, facts.length)
  assert.ok(facts.every(fact => fact.moves.length > 0))
})

for (const fact of facts) test(`WXF ${fact.diagram ? `diagram ${fact.diagram} ` : ''}${fact.id}: ${fact.expected}`, context => {
  const label = `${fact.id} (${fact.fen})`, states = [readPosition(fact.fen)]
  playMoves(states, fact.moves, label)
  const current = states.at(-1)!, currentKey = positionKey(current)
  const warning = getWxfRepetitionWarning(states.slice(0, -1), current.board, current.turn)
  assert.equal(perspective(warning, current.turn), fact.expected, `${label}: early warning`)

  // A setup prefix is not replayed: only the closed cycle ending at the factual
  // final position can safely be repeated. Stable piece identities survive moves.
  // Choose the earliest matching state, retaining the full recorded activity.
  // Diagram 80 visits the same board between alternate upper/lower attacks:
  // replaying its nearest four-ply match would invent a one-victim chase.
  const cycleStart = states.findIndex((state, index) => index < states.length - 1 && positionKey(state) === currentKey)
  if (cycleStart < 0) {
    assert.equal(fact.id, 'source-574', 'only diagram 81 lacks a closed final-position cycle in this source casebook')
    assert.equal(getWxfRepetitionResult(states.slice(0, -1), current.board, current.turn), null, 'a chase-pattern warning without repeated final position must not end the game')
    context.diagnostic('The factual final position has no earlier exact board/turn match; no final-game continuation is invented.')
    return
  }
  const cycle = fact.moves.slice(cycleStart)
  assert.ok(cycle.length > 0)
  while (states.filter(state => positionKey(state) === currentKey).length < 4) playMoves(states, cycle, label)
  const final = states.at(-1)!
  assert.equal(positionKey(final), currentKey, `${label}: repeated cycle did not close`)
  const result = getWxfRepetitionResult(states.slice(0, -1), final.board, final.turn)
  assert.equal(perspective(result, final.turn), fact.expected, `${label}: final adjudication after four occurrences`)
})
