import type { Board, GameMeta, Move, Piece, Side } from './chessTypes'
import { COLS, PROMOTION_PIECES, ROWS } from './chessTypes'
import { applyMove } from './chessBoard'

function pushIfEmptyOrEnemy(
  board: Board,
  r: number,
  c: number,
  side: Side,
  out: Move[],
  fr: number,
  fc: number,
) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return
  const t = board[r][c]
  if (!t || t.side !== side) out.push({ fromR: fr, fromC: fc, toR: r, toC: c })
}

function ray(board: Board, r: number, c: number, side: Side, dr: number, dc: number, out: Move[]) {
  let nr = r + dr
  let nc = c + dc
  while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
    const t = board[nr][nc]
    if (!t) {
      out.push({ fromR: r, fromC: c, toR: nr, toC: nc })
    } else {
      if (t.side !== side) out.push({ fromR: r, fromC: c, toR: nr, toC: nc })
      break
    }
    nr += dr
    nc += dc
  }
}

function knightMoves(board: Board, r: number, c: number, side: Side, out: Move[]) {
  for (const [dr, dc] of [
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
  ]) {
    pushIfEmptyOrEnemy(board, r + dr, c + dc, side, out, r, c)
  }
}

function kingSteps(board: Board, r: number, c: number, side: Side, out: Move[]) {
  for (const [dr, dc] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    pushIfEmptyOrEnemy(board, r + dr, c + dc, side, out, r, c)
  }
}

function pawnMoves(board: Board, meta: GameMeta, r: number, c: number, side: Side, out: Move[]) {
  const dir = side === 'white' ? -1 : 1
  const startRow = side === 'white' ? 6 : 1
  const promoRow = side === 'white' ? 0 : 7
  const nr = r + dir
  if (nr < 0 || nr >= ROWS) return
  const addPawnMove = (toC: number) => {
    const move = { fromR: r, fromC: c, toR: nr, toC }
    if (nr === promoRow) {
      for (const promotion of PROMOTION_PIECES) out.push({ ...move, promotion })
    } else {
      out.push(move)
    }
  }
  if (!board[nr][c]) {
    addPawnMove(c)
    if (r === startRow) {
      const nr2 = r + 2 * dir
      if (!board[nr2][c]) out.push({ fromR: r, fromC: c, toR: nr2, toC: c })
    }
  }
  for (const dc of [-1, 1]) {
    const nc = c + dc
    if (nc < 0 || nc >= COLS) continue
    const target = board[nr][nc]
    if (target && target.side !== side) {
      addPawnMove(nc)
    }
    if (
      meta.enPassant &&
      meta.enPassant[0] === nr &&
      meta.enPassant[1] === nc &&
      !target
    ) {
      out.push({ fromR: r, fromC: c, toR: nr, toC: nc })
    }
  }
}

function castlingMoves(board: Board, meta: GameMeta, side: Side, out: Move[]) {
  const row = side === 'white' ? 7 : 0
  const rights = meta.castling[side]
  const king = board[row][4]
  if (!king || king.type !== 'k' || king.side !== side) return

  if (rights.kingside) {
    const r1 = board[row][5]
    const r2 = board[row][6]
    const rook = board[row][7]
    if (!r1 && !r2 && rook?.type === 'r' && rook.side === side) {
      if (!squareAttacked(board, row, 4, side) && !squareAttacked(board, row, 5, side) && !squareAttacked(board, row, 6, side)) {
        out.push({ fromR: row, fromC: 4, toR: row, toC: 6, castle: 'kingside' })
      }
    }
  }
  if (rights.queenside) {
    const r1 = board[row][1]
    const r2 = board[row][2]
    const r3 = board[row][3]
    const rook = board[row][0]
    if (!r1 && !r2 && !r3 && rook?.type === 'r' && rook.side === side) {
      if (!squareAttacked(board, row, 4, side) && !squareAttacked(board, row, 3, side) && !squareAttacked(board, row, 2, side)) {
        out.push({ fromR: row, fromC: 4, toR: row, toC: 2, castle: 'queenside' })
      }
    }
  }
}

function movesForPiece(board: Board, meta: GameMeta, r: number, c: number, piece: Piece, out: Move[]) {
  const { side, type } = piece
  switch (type) {
    case 'r':
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        ray(board, r, c, side, dr, dc, out)
      }
      break
    case 'b':
      for (const [dr, dc] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        ray(board, r, c, side, dr, dc, out)
      }
      break
    case 'q':
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        ray(board, r, c, side, dr, dc, out)
      }
      break
    case 'n':
      knightMoves(board, r, c, side, out)
      break
    case 'k':
      kingSteps(board, r, c, side, out)
      break
    case 'p':
      pawnMoves(board, meta, r, c, side, out)
      break
    default:
      break
  }
}

export function findKing(board: Board, side: Side): [number, number] | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c]
      if (p?.type === 'k' && p.side === side) return [r, c]
    }
  }
  return null
}

const ATTACK_RAYS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const
const KNIGHT_ATTACKS = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]] as const

function squareAttacked(board: Board, r: number, c: number, defender: Side): boolean {
  const attacker: Side = defender === 'white' ? 'black' : 'white'
  const pawnRow = r + (attacker === 'white' ? 1 : -1)
  for (const dc of [-1, 1]) {
    const pawn = board[pawnRow]?.[c + dc]
    if (pawn?.side === attacker && pawn.type === 'p') return true
  }
  for (const [dr, dc] of KNIGHT_ATTACKS) {
    const knight = board[r + dr]?.[c + dc]
    if (knight?.side === attacker && knight.type === 'n') return true
  }
  // Looking outward from the queried square avoids generating every enemy's
  // complete move list for each legality and one-move-mate check.
  for (const [dr, dc] of ATTACK_RAYS) {
    let rr = r + dr, cc = c + dc
    while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
      const piece = board[rr][cc]
      if (piece) {
        if (piece.side === attacker) {
          if (piece.type === 'k' && Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1) return true
          if (piece.type === 'q' || piece.type === (dr && dc ? 'b' : 'r')) return true
        }
        break
      }
      rr += dr
      cc += dc
    }
  }
  return false
}

export function inCheck(board: Board, side: Side): boolean {
  const k = findKing(board, side)
  if (!k) return true
  return squareAttacked(board, k[0], k[1], side)
}

export function legalMovesFrom(board: Board, meta: GameMeta, r: number, c: number): Move[] {
  const piece = board[r][c]
  if (!piece) return []
  const raw: Move[] = []
  movesForPiece(board, meta, r, c, piece, raw)
  if (piece.type === 'k') castlingMoves(board, meta, piece.side, raw)
  return raw
}

export function legalMovesFromChecked(board: Board, meta: GameMeta, r: number, c: number): Move[] {
  const piece = board[r][c]
  if (!piece) return []
  return legalMovesFrom(board, meta, r, c).filter((m) => {
    if (board[m.toR][m.toC]?.type === 'k') return false
    const { board: next } = applyMove(board, meta, m)
    return !inCheck(next, piece.side)
  })
}

export function allLegalMovesChecked(board: Board, meta: GameMeta, side: Side): Move[] {
  const out: Move[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c]
      if (p?.side === side) out.push(...legalMovesFromChecked(board, meta, r, c))
    }
  }
  return out
}

export { pickAiMoveChess } from './chessAi'
