import type { Board, Hand, Move, Piece, PieceType, Side } from './shogiTypes'
import { COLS, ROWS } from './shogiTypes'

function p(id: string, side: Side, type: PieceType, promoted = false): Piece {
  return { id, side, type, promoted }
}

export function createInitialBoard(): Board {
  const b: Board = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null))
  const back: PieceType[] = ['l', 'n', 's', 'g', 'k', 'g', 's', 'n', 'l']
  for (let c = 0; c < COLS; c++) {
    b[0][c] = p(`g-${back[c]}-0-${c}`, 'gote', back[c]!)
    b[8][c] = p(`s-${back[c]}-8-${c}`, 'sente', back[c]!)
    b[2][c] = p(`g-p-2-${c}`, 'gote', 'p')
    b[6][c] = p(`s-p-6-${c}`, 'sente', 'p')
  }
  b[1][1] = p('g-b-1-1', 'gote', 'b')
  b[1][7] = p('g-r-1-7', 'gote', 'r')
  b[7][7] = p('s-b-7-7', 'sente', 'b')
  b[7][1] = p('s-r-7-1', 'sente', 'r')
  return b
}

export function emptyHand(): Hand {
  return { sente: [], gote: [] }
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice())
}

export function snapshotBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)))
}

export function snapshotHand(hand: Hand): Hand {
  return { sente: [...hand.sente], gote: [...hand.gote] }
}

function mustPromote(piece: Piece, toR: number, side: Side): boolean {
  if (piece.type === 'p') return side === 'sente' ? toR === 0 : toR === 8
  if (piece.type === 'l') return side === 'sente' ? toR === 0 : toR === 8
  if (piece.type === 'n') return side === 'sente' ? toR <= 1 : toR >= 7
  return false
}

function inPromoZone(r: number, side: Side): boolean {
  return side === 'sente' ? r <= 2 : r >= 6
}

export function applyShogiMove(
  board: Board,
  hand: Hand,
  move: Move,
  side: Side,
): { board: Board; hand: Hand } {
  const next = cloneBoard(board)
  const nextHand = snapshotHand(hand)

  if (move.dropType) {
    const idx = nextHand[side].indexOf(move.dropType)
    if (idx < 0) return { board: next, hand: nextHand }
    nextHand[side].splice(idx, 1)
    next[move.toR][move.toC] = {
      id: `${side}-drop-${move.dropType}-${move.toR}-${move.toC}`,
      side,
      type: move.dropType,
      promoted: false,
    }
    return { board: next, hand: nextHand }
  }

  const piece = next[move.fromR!][move.fromC!]!
  const cap = next[move.toR][move.toC]
  const forced = mustPromote(piece, move.toR, side)
  const canPromo = !piece.promoted && piece.type !== 'k' && piece.type !== 'g' && inPromoZone(move.toR, side)
  const promoted = piece.promoted || forced || (canPromo && move.promote !== false)

  next[move.toR][move.toC] = { ...piece, promoted }
  next[move.fromR!][move.fromC!] = null

  if (cap) {
    const captured: PieceType = cap.type
    nextHand[side].push(captured)
  }

  return { board: next, hand: nextHand }
}
