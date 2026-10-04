import { boundedAiBudget, MATE_SCORE, searchBestMove } from '../ai/search'
import { immediateCaptureGain, type CaptureAdapter } from '../ai/tactics'
import { applyMove } from './chessBoard'
import { inCheck, legalMovesFrom } from './chessMoves'
import { PIECE_VALUE, type Board, type GameMeta, type Move, type Piece, type Side } from './chessTypes'

type Position = { board: Board; meta: GameMeta }
const value = (piece: Piece) => PIECE_VALUE[piece.type] * 10
const other = (side: Side): Side => side === 'white' ? 'black' : 'white'

// A private root shortcut, distinct from a mate score and the deadline signal.
class SafePromotionConversion {
  readonly move: Move
  constructor(move: Move) { this.move = move }
}

function isPromotionEndgame({ board }: Position, side: Side, check: () => void): boolean {
  let ownKings = 0, pawns = 0, enemyKings = 0
  for (let r = 0; r < 8; r++) {
    check()
    for (const piece of board[r]) {
      if (!piece) continue
      if (piece.side === side) {
        if (piece.type === 'k') ownKings++
        else if (piece.type === 'p' && r === (side === 'white' ? 1 : 6)) pawns++
        else return false
      } else if (piece.type === 'k') enemyKings++
      else return false
    }
  }
  return ownKings === 1 && pawns === 1 && enemyKings === 1
}

function* movesFrom(position: Position, side: Side, r: number, c: number, check: () => void): Generator<Move> {
  check()
  for (const move of legalMovesFrom(position.board, position.meta, r, c)) {
    if (position.board[move.toR][move.toC]?.type === 'k') continue
    check()
    if (!inCheck(applyMove(position.board, position.meta, move).board, side)) yield move
  }
}

function* moves(position: Position, side: Side, check: () => void): Generator<Move> {
  const promotionRow = side === 'white' ? 1 : 6
  // Both colours must reach their immediate promotion choices before quiet
  // king moves can consume the short-budget safety pass. All four choices and
  // the ordinary legality filter remain available; this is source ordering.
  for (let c = 0; c < 8; c++) {
    const piece = position.board[promotionRow][c]
    if (piece?.side === side && piece.type === 'p') yield* movesFrom(position, side, promotionRow, c, check)
  }
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const piece = position.board[r][c]
    if (piece?.side !== side || (r === promotionRow && piece.type === 'p')) continue
    yield* movesFrom(position, side, r, c, check)
  }
}

function canMateInOne(position: Position, attacker: Side, check: () => void): boolean {
  check()
  // A lone king cannot legally give check to the other king. Avoid scanning
  // every king move when assessing promotion endgames; stalemate has already
  // been checked by the fallback's legal-reply query.
  if (!position.board.some(row => row.some(piece => piece?.side === attacker && piece.type !== 'k'))) return false
  const defender = other(attacker)
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (position.board[r][c]?.side !== attacker) continue
    check()
    for (const move of legalMovesFrom(position.board, position.meta, r, c)) {
      if (position.board[move.toR][move.toC]?.type === 'k') continue
      check()
      const next = applyMove(position.board, position.meta, move)
      if (!inCheck(next.board, defender) || inCheck(next.board, attacker)) continue
      if (moves(next, defender, check).next().done) return true
    }
  }
  return false
}

const exchanges: CaptureAdapter<Position, Move, Side> = {
  *captures(position, side, check, target) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const piece = position.board[r][c]
      if (piece?.side !== side) continue
      check()
      for (const move of legalMovesFrom(position.board, position.meta, r, c)) {
        if (target && (move.toR !== target[0] || move.toC !== target[1])) continue
        const victim = position.board[move.toR][move.toC]
        const ep = piece.type === 'p' && position.meta.enPassant?.[0] === move.toR && position.meta.enPassant[1] === move.toC
        if ((!victim && !ep) || victim?.type === 'k') continue
        check()
        if (!inCheck(applyMove(position.board, position.meta, move).board, side)) yield move
      }
    }
  },
  apply: (position, move) => applyMove(position.board, position.meta, move),
  other,
  target: move => [move.toR, move.toC],
  attackerValue: (position, move) => value(position.board[move.fromR][move.fromC]!),
  gain: (position, move) => {
    const victim = position.board[move.toR][move.toC]
    return (victim ? value(victim) : 100) + (move.promotion ? PIECE_VALUE[move.promotion] * 10 - 100 : 0)
  },
}

function placement(piece: Piece, r: number, c: number, endgame: boolean): number {
  const advance = piece.side === 'white' ? 7 - r : r
  const center = 7 - Math.abs(3.5 - c) - Math.abs(3.5 - r)
  switch (piece.type) {
    case 'p': return advance * 6 + (3.5 - Math.abs(3.5 - c)) * 5
    case 'n': return center * 9 - (r === 0 || r === 7 || c === 0 || c === 7 ? 18 : 0)
    case 'b': return center * 5 + advance * 2
    case 'r': return advance * 2 + (advance === 6 ? 20 : 0)
    case 'q': return center * 3 - (!endgame && advance > 2 ? 8 : 0)
    case 'k': return endgame ? center * 8 : -advance * 13 + (c === 2 || c === 6 ? 26 : 0)
  }
}

function evaluate({ board }: Position, side: Side): number {
  const pawnFiles = { white: Array<number>(8).fill(0), black: Array<number>(8).fill(0) }
  let material = 0
  for (const row of board) for (let c = 0; c < 8; c++) {
    const piece = row[c]
    if (!piece) continue
    if (piece.type === 'p') pawnFiles[piece.side][c]++
    else if (piece.type !== 'k') material += value(piece)
  }
  const endgame = material < 2600
  let score = 0
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const piece = board[r][c]
    if (!piece) continue
    const opponent = piece.side === 'white' ? 'black' : 'white'
    let bonus = placement(piece, r, c, endgame)
    if (piece.type === 'p') {
      if (pawnFiles[piece.side][c] > 1) bonus -= 14
      if (!pawnFiles[piece.side][c - 1] && !pawnFiles[piece.side][c + 1]) bonus -= 10
      let passed = true
      for (let rr = r + (piece.side === 'white' ? -1 : 1); rr >= 0 && rr < 8; rr += piece.side === 'white' ? -1 : 1) {
        for (const cc of [c - 1, c, c + 1]) {
          if (board[rr]?.[cc]?.type === 'p' && board[rr][cc]?.side === opponent) passed = false
        }
      }
      if (passed) bonus += (piece.side === 'white' ? 6 - r : r - 1) * 8
    }
    if (piece.type === 'r' && !pawnFiles[piece.side][c]) bonus += pawnFiles[opponent][c] ? 10 : 22
    if (piece.type === 'k' && !endgame) {
      const front = r + (piece.side === 'white' ? -1 : 1)
      for (const cc of [c - 1, c, c + 1]) if (board[front]?.[cc]?.side === piece.side && board[front][cc]?.type === 'p') bonus += 12
    }
    score += (piece.side === side ? 1 : -1) * (value(piece) + bonus)
  }
  return score
}

function order({ board, meta }: Position, move: Move): number {
  const piece = board[move.fromR][move.fromC]!
  const captured = board[move.toR][move.toC]
  const enPassant = piece.type === 'p' && meta.enPassant?.[0] === move.toR && meta.enPassant[1] === move.toC
  return (captured ? value(captured) * 16 - (piece.type === 'k' ? 0 : value(piece)) : enPassant ? 1500 : 0)
    + (move.promotion ? PIECE_VALUE[move.promotion] * 10 + 400 : 0)
    + (move.castle ? 80 : 0)
    + placement(piece, move.toR, move.toC, false) - placement(piece, move.fromR, move.fromC, false)
}

export function pickAiMoveChess(board: Board, meta: GameMeta, side: Side, budgetMs = 800): Move | null {
  let promotionEndgame: boolean | undefined
  try {
    return searchBestMove({ board, meta }, side, {
      moves,
      apply: (position, move) => applyMove(position.board, position.meta, move),
      other,
      evaluate, order,
      fallback: (position, move, turn, check) => {
        const next = applyMove(position.board, position.meta, move)
        const opponent = other(turn)
        const replies = moves(next, opponent, check)
        const firstReply = replies.next()
        if (firstReply.done) return inCheck(next.board, opponent) ? MATE_SCORE - 1 : 0
        if (move.promotion === 'q' || move.promotion === 'r') {
          promotionEndgame ??= isPromotionEndgame(position, turn, check)
          if (promotionEndgame) {
            let reply: IteratorResult<Move> = firstReply
            while (!reply.done) {
              check()
              if (reply.value.toR === move.toR && reply.value.toC === move.toC) break
              reply = replies.next()
            }
            // A safe KQ/KR versus K converts to known winning material now. This
            // avoids a shallow horizon preferring to delay promotion. It is not
            // immediate mate; no score or game-result state is fabricated.
            // Q is generated before R; a stalemating Q was rejected above.
            if (reply.done) throw new SafePromotionConversion(move)
          }
        }
        // Finish the mating-reply screen before accepting a material gain. If it
        // times out, the shared search keeps an earlier fully screened fallback.
        if (canMateInOne(next, opponent, check)) return -MATE_SCORE + 2
        return evaluate(next, turn) - immediateCaptureGain(next, opponent, exchanges, check)
      },
      tactical: (position, move) => !!position.board[move.toR][move.toC] || !!move.promotion
        || (position.board[move.fromR][move.fromC]?.type === 'p' && position.meta.enPassant?.[0] === move.toR && position.meta.enPassant[1] === move.toC),
      inCheck: (position, turn) => inCheck(position.board, turn),
      terminal: (position, turn, ply) => inCheck(position.board, turn) ? -MATE_SCORE + ply : 0,
      moveKey: move => `${move.fromR},${move.fromC},${move.toR},${move.toC},${move.promotion ?? ''},${move.castle ?? ''}`,
      key: (position, turn) => `${turn}|${position.board.map(row => row.map(piece => piece ? piece.side === 'white' ? piece.type.toUpperCase() : piece.type : '.').join('')).join('')}|${JSON.stringify(position.meta)}`,
    }, { budgetMs: boundedAiBudget(budgetMs, 25), maxDepth: 6, quiescenceDepth: 3 })
  } catch (error) {
    if (error instanceof SafePromotionConversion) return error.move
    throw error
  }
}
