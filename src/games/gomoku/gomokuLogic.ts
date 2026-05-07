export const GOMOKU_SIZE = 15
export type Cell = 0 | 1 | 2 // empty, black, white

export function emptyBoard(): Cell[][] {
  return Array.from({ length: GOMOKU_SIZE }, () =>
    Array.from({ length: GOMOKU_SIZE }, () => 0 as Cell),
  )
}

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
]

export function checkWin(board: Cell[][], r: number, c: number, player: 1 | 2): boolean {
  for (const [dr, dc] of DIRS) {
    let count = 1
    for (const sign of [-1, 1]) {
      let nr = r + dr * sign
      let nc = c + dc * sign
      while (
        nr >= 0 &&
        nr < GOMOKU_SIZE &&
        nc >= 0 &&
        nc < GOMOKU_SIZE &&
        board[nr][nc] === player
      ) {
        count++
        nr += dr * sign
        nc += dc * sign
      }
    }
    if (count >= 5) return true
  }
  return false
}

function lineScore(len: number, openEnds: number): number {
  if (len >= 5) return 100_000
  if (len === 4 && openEnds === 2) return 50_000
  if (len === 4 && openEnds === 1) return 3000
  if (len === 3 && openEnds === 2) return 2000
  if (len === 3 && openEnds === 1) return 200
  if (len === 2 && openEnds === 2) return 50
  if (len === 2 && openEnds === 1) return 10
  return 0
}

function evaluatePoint(board: Cell[][], r: number, c: number, player: 1 | 2): number {
  let score = 0
  for (const [dr, dc] of DIRS) {
    let len = 1
    let openEnds = 0
    for (const sign of [-1, 1]) {
      let nr = r + dr * sign
      let nc = c + dc * sign
      while (
        nr >= 0 &&
        nr < GOMOKU_SIZE &&
        nc >= 0 &&
        nc < GOMOKU_SIZE &&
        board[nr][nc] === player
      ) {
        len++
        nr += dr * sign
        nc += dc * sign
      }
      if (nr >= 0 && nr < GOMOKU_SIZE && nc >= 0 && nc < GOMOKU_SIZE && board[nr][nc] === 0) {
        openEnds++
      } else if (
        nr < 0 ||
        nr >= GOMOKU_SIZE ||
        nc < 0 ||
        nc >= GOMOKU_SIZE ||
        board[nr][nc] !== 0
      ) {
        /* blocked */
      }
    }
    score += lineScore(len, openEnds)
  }
  return score
}

export function evaluateBoard(board: Cell[][], aiPlayer: 1 | 2): number {
  const human = aiPlayer === 1 ? 2 : 1
  let ai = 0
  let hu = 0
  for (let r = 0; r < GOMOKU_SIZE; r++) {
    for (let c = 0; c < GOMOKU_SIZE; c++) {
      if (board[r][c] === 0) {
        ai += evaluatePoint(board, r, c, aiPlayer)
        hu += evaluatePoint(board, r, c, human)
      }
    }
  }
  return ai - hu * 1.06
}

function stoneCount(board: Cell[][]): number {
  let n = 0
  for (let r = 0; r < GOMOKU_SIZE; r++) {
    for (let c = 0; c < GOMOKU_SIZE; c++) {
      if (board[r][c] !== 0) n++
    }
  }
  return n
}

export function getCandidates(board: Cell[][]): [number, number][] {
  const radius = stoneCount(board) > 8 ? 3 : 2
  const used = new Set<string>()
  const out: [number, number][] = []
  for (let r = 0; r < GOMOKU_SIZE; r++) {
    for (let c = 0; c < GOMOKU_SIZE; c++) {
      if (board[r][c] === 0) continue
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nr = r + dr
          const nc = c + dc
          if (nr < 0 || nr >= GOMOKU_SIZE || nc < 0 || nc >= GOMOKU_SIZE) continue
          if (board[nr][nc] !== 0) continue
          const key = `${nr},${nc}`
          if (used.has(key)) continue
          used.add(key)
          out.push([nr, nc])
        }
      }
    }
  }
  if (out.length === 0) return [[7, 7]]
  return out
}

function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map((row) => row.slice()) as Cell[][]
}

/** 落子后，沿四线穿过 (r,c) 的最长连续同色子数（(r,c) 须已为 player） */
function maxConsecutiveThrough(board: Cell[][], r: number, c: number, player: 1 | 2): number {
  let best = 0
  for (const [dr, dc] of DIRS) {
    let len = 1
    for (const sign of [-1, 1]) {
      let nr = r + dr * sign
      let nc = c + dc * sign
      while (
        nr >= 0 &&
        nr < GOMOKU_SIZE &&
        nc >= 0 &&
        nc < GOMOKU_SIZE &&
        board[nr][nc] === player
      ) {
        len++
        nr += dr * sign
        nc += dc * sign
      }
    }
    if (len > best) best = len
  }
  return best
}

/** 是否存在「直线活三」：该方向共三子且两端延伸格均为空（落子后已写入 board） */
function hasOpenStraightThree(board: Cell[][], r: number, c: number, player: 1 | 2): boolean {
  for (const [dr, dc] of DIRS) {
    let len = 1
    let nr = r + dr
    let nc = c + dc
    while (
      nr >= 0 &&
      nr < GOMOKU_SIZE &&
      nc >= 0 &&
      nc < GOMOKU_SIZE &&
      board[nr][nc] === player
    ) {
      len++
      nr += dr
      nc += dc
    }
    const pr = nr
    const pc = nc
    nr = r - dr
    nc = c - dc
    while (
      nr >= 0 &&
      nr < GOMOKU_SIZE &&
      nc >= 0 &&
      nc < GOMOKU_SIZE &&
      board[nr][nc] === player
    ) {
      len++
      nr -= dr
      nc -= dc
    }
    const mr = nr
    const mc = nc
    if (
      len === 3 &&
      pr >= 0 &&
      pr < GOMOKU_SIZE &&
      pc >= 0 &&
      pc < GOMOKU_SIZE &&
      board[pr][pc] === 0 &&
      mr >= 0 &&
      mr < GOMOKU_SIZE &&
      mc >= 0 &&
      mc < GOMOKU_SIZE &&
      board[mr][mc] === 0
    ) {
      return true
    }
  }
  return false
}

/**
 * 沿 (dr,dc) 从 (r,c) 向一侧延伸，同色子中间至多「跳空一格」再接同色（用于跳三、跳四）。
 */
function armCountOneGap(
  board: Cell[][],
  r: number,
  c: number,
  player: 1 | 2,
  dr: number,
  dc: number,
  sign: number,
): number {
  let added = 0
  let gapUsed = false
  let br = r + dr * sign
  let bc = c + dc * sign
  while (br >= 0 && br < GOMOKU_SIZE && bc >= 0 && bc < GOMOKU_SIZE) {
    if (board[br][bc] === player) {
      added++
      br += dr * sign
      bc += dc * sign
    } else if (board[br][bc] === 0 && !gapUsed) {
      const br2 = br + dr * sign
      const bc2 = bc + dc * sign
      if (
        br2 >= 0 &&
        br2 < GOMOKU_SIZE &&
        bc2 >= 0 &&
        bc2 < GOMOKU_SIZE &&
        board[br2][bc2] === player
      ) {
        gapUsed = true
        added++
        br = br2 + dr * sign
        bc = bc2 + dc * sign
      } else {
        break
      }
    } else {
      break
    }
  }
  return added
}

/** 穿过 (r,c) 的该线「含一空跳」连子数（(r,c) 须已为 player） */
function lineCountAllowOneGap(
  board: Cell[][],
  r: number,
  c: number,
  player: 1 | 2,
  dr: number,
  dc: number,
): number {
  return (
    1 +
    armCountOneGap(board, r, c, player, dr, dc, 1) +
    armCountOneGap(board, r, c, player, dr, dc, -1)
  )
}

function maxLineAllowOneGap(board: Cell[][], r: number, c: number, player: 1 | 2): number {
  let m = 0
  for (const [dr, dc] of DIRS) {
    const v = lineCountAllowOneGap(board, r, c, player, dr, dc)
    if (v > m) m = v
  }
  return m
}

const WIN_SCORE = 9_000_000

/** 仅看落子点周围，供排序用（禁止调用 evaluateBoard，否则排序会卡死主线程） */
function moveOrderHint(board: Cell[][], r: number, c: number, cur: 1 | 2): number {
  const b = cloneBoard(board)
  b[r][c] = cur
  if (checkWin(b, r, c, cur)) return WIN_SCORE
  const opp = cur === 1 ? 2 : 1
  return evaluatePoint(b, r, c, cur) * 2.2 - evaluatePoint(b, r, c, opp) * 2.2
}

function negamax(
  board: Cell[][],
  depth: number,
  alpha: number,
  beta: number,
  cur: 1 | 2,
  ai: 1 | 2,
): number {
  if (depth === 0) return evaluateBoard(board, ai)

  const cands = getCandidates(board)
  const moves: [number, number][] = []
  for (const [r, c] of cands) {
    if (board[r][c] !== 0) continue
    moves.push([r, c])
  }
  if (moves.length === 0) return evaluateBoard(board, ai)

  moves.sort((a, b) => moveOrderHint(board, b[0], b[1], cur) - moveOrderHint(board, a[0], a[1], cur))

  const limit = depth >= 2 ? 10 : depth >= 1 ? 14 : 16
  let best = -Infinity
  let any = false
  for (let i = 0; i < Math.min(limit, moves.length); i++) {
    const [r, c] = moves[i]!
    const next = cloneBoard(board)
    next[r][c] = cur
    if (checkWin(next, r, c, cur)) {
      return WIN_SCORE - depth
    }
    const child = cur === 1 ? 2 : 1
    const v = -negamax(next, depth - 1, -beta, -alpha, child, ai)
    if (v > best) best = v
    if (v > alpha) alpha = v
    if (alpha >= beta) break
    any = true
  }
  return any ? best : evaluateBoard(board, ai)
}

export function pickAiMove(board: Cell[][], aiPlayer: 1 | 2): [number, number] {
  const candidates = getCandidates(board)
  const human = aiPlayer === 1 ? 2 : 1

  for (const [r, c] of candidates) {
    if (board[r][c] !== 0) continue
    const t = cloneBoard(board)
    t[r][c] = aiPlayer
    if (checkWin(t, r, c, aiPlayer)) return [r, c]
  }

  for (const [r, c] of candidates) {
    if (board[r][c] !== 0) continue
    const t = cloneBoard(board)
    t[r][c] = human
    if (checkWin(t, r, c, human)) return [r, c]
  }

  /** 全盘扫描：对手若下在此点会形成连四及以上（冲四、活四），必须堵 */
  let blockFour: [number, number] | null = null
  let blockFourRun = 0
  for (let r = 0; r < GOMOKU_SIZE; r++) {
    for (let c = 0; c < GOMOKU_SIZE; c++) {
      if (board[r][c] !== 0) continue
      const t = cloneBoard(board)
      t[r][c] = human
      const run = maxConsecutiveThrough(t, r, c, human)
      if (run >= 4 && run > blockFourRun) {
        blockFourRun = run
        blockFour = [r, c]
      }
    }
  }
  if (blockFour) return blockFour

  /** 活三：对手下此点即成直线活三，优先堵威胁最大的一点 */
  let blockOpen3: [number, number] | null = null
  let blockOpen3Score = -1
  for (let r = 0; r < GOMOKU_SIZE; r++) {
    for (let c = 0; c < GOMOKU_SIZE; c++) {
      if (board[r][c] !== 0) continue
      const t = cloneBoard(board)
      t[r][c] = human
      if (!hasOpenStraightThree(t, r, c, human)) continue
      const sc = evaluatePoint(t, r, c, human)
      if (sc > blockOpen3Score) {
        blockOpen3Score = sc
        blockOpen3 = [r, c]
      }
    }
  }
  if (blockOpen3) return blockOpen3

  /** 跳四 / 夹四：无严连四，但「一空跳」后该线同色数 ≥4 */
  let blockJump4: [number, number] | null = null
  let blockJump4N = 0
  for (let r = 0; r < GOMOKU_SIZE; r++) {
    for (let c = 0; c < GOMOKU_SIZE; c++) {
      if (board[r][c] !== 0) continue
      const t = cloneBoard(board)
      t[r][c] = human
      const run = maxConsecutiveThrough(t, r, c, human)
      if (run >= 4) continue
      const mj = maxLineAllowOneGap(t, r, c, human)
      if (mj >= 4 && mj > blockJump4N) {
        blockJump4N = mj
        blockJump4 = [r, c]
      }
    }
  }
  if (blockJump4) return blockJump4

  /** 跳三：未成直线活三，但一跳后该线 ≥3 子且棋形分较高 */
  let blockJump3: [number, number] | null = null
  let blockJump3Score = -1
  for (let r = 0; r < GOMOKU_SIZE; r++) {
    for (let c = 0; c < GOMOKU_SIZE; c++) {
      if (board[r][c] !== 0) continue
      const t = cloneBoard(board)
      t[r][c] = human
      if (hasOpenStraightThree(t, r, c, human)) continue
      const mj = maxLineAllowOneGap(t, r, c, human)
      if (mj < 3) continue
      const sc = evaluatePoint(t, r, c, human)
      if (sc > blockJump3Score) {
        blockJump3Score = sc
        blockJump3 = [r, c]
      }
    }
  }
  if (blockJump3 && blockJump3Score >= 180) return blockJump3

  const rootMoves: [number, number][] = []
  for (const [r, c] of candidates) {
    if (board[r][c] === 0) rootMoves.push([r, c])
  }
  rootMoves.sort(
    (a, b) => moveOrderHint(board, b[0], b[1], aiPlayer) - moveOrderHint(board, a[0], a[1], aiPlayer),
  )

  let best: [number, number] = rootMoves[0] ?? [7, 7]
  let bestScore = -Infinity
  const rootLimit = Math.min(16, rootMoves.length)
  /** 总层数（含根后对手层），保持流畅；排序已改为 O(1) 启发 */
  const searchDepth = 3

  for (let i = 0; i < rootLimit; i++) {
    const [r, c] = rootMoves[i]!
    const next = cloneBoard(board)
    next[r][c] = aiPlayer
    if (checkWin(next, r, c, aiPlayer)) return [r, c]
    const reply = human
    const score = negamax(next, searchDepth - 1, -Infinity, Infinity, reply, aiPlayer)
    if (score > bestScore) {
      bestScore = score
      best = [r, c]
    }
  }

  return best
}
