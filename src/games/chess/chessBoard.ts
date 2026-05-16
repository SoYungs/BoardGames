import type { Board, CastlingRights, GameMeta, Move, Piece, PieceType, Side } from './chessTypes'
import { COLS, ROWS } from './chessTypes'

function p(id: string, side: Side, type: PieceType): Piece {
  return { id, side, type }
}

export function createInitialBoard(): Board {
  const b: Board = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null))
  const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
  for (let c = 0; c < COLS; c++) {
    b[0][c] = p(`b-${back[c]}-0-${c}`, 'black', back[c]!)
    b[7][c] = p(`w-${back[c]}-7-${c}`, 'white', back[c]!)
    b[1][c] = p(`b-p-1-${c}`, 'black', 'p')
    b[6][c] = p(`w-p-6-${c}`, 'white', 'p')
  }
  return b
}

export function initialMeta(): GameMeta {
  return {
    castling: {
      white: { kingside: true, queenside: true },
      black: { kingside: true, queenside: true },
    },
    enPassant: null,
  }
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice())
}

export function snapshotBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)))
}

export function snapshotMeta(meta: GameMeta): GameMeta {
  return {
    castling: {
      white: { ...meta.castling.white },
      black: { ...meta.castling.black },
    },
    enPassant: meta.enPassant ? [...meta.enPassant] as [number, number] : null,
  }
}

function clearCastlingForSide(rights: CastlingRights, side: Side) {
  rights[side].kingside = false
  rights[side].queenside = false
}

export function applyMove(board: Board, meta: GameMeta, move: Move): { board: Board; meta: GameMeta } {
  const next = cloneBoard(board)
  const nextMeta = snapshotMeta(meta)
  const piece = next[move.fromR][move.fromC]!
  const cap = next[move.toR][move.toC]

  if (move.castle === 'kingside') {
    const row = piece.side === 'white' ? 7 : 0
    next[row][6] = next[row][4]
    next[row][4] = null
    next[row][6]!.id = `${piece.side}-k-castle`
    next[row][5] = next[row][7]
    next[row][7] = null
    next[row][5]!.id = `${piece.side}-r-castle`
    clearCastlingForSide(nextMeta.castling, piece.side)
    nextMeta.enPassant = null
    return { board: next, meta: nextMeta }
  }

  if (move.castle === 'queenside') {
    const row = piece.side === 'white' ? 7 : 0
    next[row][2] = next[row][4]
    next[row][4] = null
    next[row][2]!.id = `${piece.side}-k-castle-q`
    next[row][3] = next[row][0]
    next[row][0] = null
    next[row][3]!.id = `${piece.side}-r-castle-q`
    clearCastlingForSide(nextMeta.castling, piece.side)
    nextMeta.enPassant = null
    return { board: next, meta: nextMeta }
  }

  if (piece.type === 'p' && meta.enPassant && move.toR === meta.enPassant[0] && move.toC === meta.enPassant[1]) {
    const capRow = piece.side === 'white' ? move.toR + 1 : move.toR - 1
    next[capRow][move.toC] = null
  }

  next[move.toR][move.toC] = piece
  next[move.fromR][move.fromC] = null

  if (move.promotion) {
    next[move.toR][move.toC] = { ...piece, type: move.promotion, id: `${piece.id}-promo` }
  }

  nextMeta.enPassant = null
  if (piece.type === 'p' && Math.abs(move.toR - move.fromR) === 2) {
    nextMeta.enPassant = [(move.fromR + move.toR) / 2, move.fromC]
  }

  if (piece.type === 'k') clearCastlingForSide(nextMeta.castling, piece.side)
  if (piece.type === 'r') {
    if (move.fromC === 0) nextMeta.castling[piece.side].queenside = false
    if (move.fromC === 7) nextMeta.castling[piece.side].kingside = false
  }
  if (cap?.type === 'r') {
    if (move.toC === 0) nextMeta.castling[cap.side].queenside = false
    if (move.toC === 7) nextMeta.castling[cap.side].kingside = false
  }

  return { board: next, meta: nextMeta }
}
