import { GameResult } from '../../components/GameResult'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ResponsiveBoard } from '../../components/ResponsiveBoard'
import { scheduleAiMove } from '../../workers/scheduleAiMove'
import {
  applyMove,
  createInitialBoard,
  isCamp,
  isFrontline,
  isHeadquarters,
  isRailway,
  snapshotBoard,
} from './junqiBoard'
import { resolveCombat } from './junqiCombat'
import type { Board, Move, Side } from './junqiTypes'
import { COLS, ROWS, pieceLabel, pieceName } from './junqiTypes'
import { getWinnerJunqi, legalMovesFrom } from './junqiMoves'

type Mode = 'local' | 'ai'

const CELL_W = 44
const CELL_H = 40
const PAD = 16

type JunqiSnap = {
  board: Board
  turn: Side
  lastMove: Move | null
  winner: Side | null
  selected: [number, number] | null
}

export function JunqiGame({ mode }: { mode: Mode }) {
  const [board, setBoard] = useState<Board>(() => createInitialBoard())
  const [turn, setTurn] = useState<Side>('red')
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [winner, setWinner] = useState<Side | null>(null)
  const [lastMove, setLastMove] = useState<Move | null>(null)
  const [history, setHistory] = useState<JunqiSnap[]>([])
  const [aiError, setAiError] = useState(false)

  const reduceMotion = useReducedMotion()

  const humanSide: Side = 'red'
  const aiSide: Side = 'blue'

  const targets = useMemo(() => {
    if (!selected) return [] as Move[]
    const [r, c] = selected
    return legalMovesFrom(board, r, c, turn)
  }, [board, selected, turn])

  const status = useMemo(() => {
    if (aiError) return '电脑计算遇到问题，请重新开始'
    if (winner) return `${winner === 'red' ? '红方' : '蓝方'} 胜`
    if (mode === 'ai' && turn === aiSide) return '电脑思考中…'
    if (selected && targets.length === 0) return '该棋子不可移动 · 换一枚棋子'
    return `${turn === 'red' ? '红方' : '蓝方'}行棋 · ${selected ? '选择落点' : '选择棋子'}`
  }, [winner, mode, turn, aiSide, selected, targets.length, aiError])

  const reset = useCallback(() => {
    setBoard(createInitialBoard())
    setTurn('red')
    setSelected(null)
    setWinner(null)
    setLastMove(null)
    setHistory([])
    setAiError(false)
  }, [])

  const undo = useCallback(() => {
    if (mode !== 'local' || history.length === 0) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setBoard(snapshotBoard(prev.board))
    setTurn(prev.turn)
    setLastMove(prev.lastMove)
    setWinner(prev.winner)
    setSelected(prev.selected)
  }, [mode, history])

  const tryMove = useCallback(
    (m: Move) => {
      if (mode === 'local') {
        setHistory((h) => [...h, { board: snapshotBoard(board), turn, lastMove, winner, selected }])
      }
      const attacker = board[m.fromR][m.fromC]!
      const defender = board[m.toR][m.toC]
      let result: import('./junqiCombat').CombatResult = 'none'
      if (defender) result = resolveCombat(attacker, defender)
      const next = applyMove(board, m, result)
      setLastMove(m)
      setBoard(next)
      setSelected(null)

      const nextTurn = turn === 'red' ? 'blue' : 'red'
      setWinner(getWinnerJunqi(next, nextTurn))
      setTurn(nextTurn)
    },
    [board, turn, mode, lastMove, winner, selected],
  )

  useEffect(() => {
    if (winner || aiError || mode !== 'ai' || turn !== aiSide) return
    return scheduleAiMove('junqi', { board, side: aiSide }, (m) => {
      if (!m) {
        setWinner(humanSide)
        return
      }
      tryMove(m)
    }, 140, () => setAiError(true))
  }, [winner, aiError, mode, turn, board, aiSide, humanSide, tryMove])

  const onCellClick = (r: number, c: number) => {
    if (winner) return
    if (mode === 'ai' && turn === aiSide) return
    const piece = board[r][c]
    if (selected) {
      const hit = targets.find((m) => m.toR === r && m.toC === c)
      if (hit) {
        tryMove(hit)
        return
      }
      if (piece?.side === turn) {
        setSelected([r, c])
        return
      }
      setSelected(null)
      return
    }
    if (piece?.side === turn) setSelected([r, c])
  }

  /** 人机：己方全可见，对方仅翻明后可见。本地双人：双方暗棋，仅选中己方子时显示番号。 */
  const displayLabel = (piece: import('./junqiTypes').Piece, r: number, c: number) => {
    if (piece.revealed) return pieceLabel(piece)
    if (mode === 'ai') {
      return piece.side === humanSide ? pieceLabel(piece) : '?'
    }
    if (piece.side === turn && selected?.[0] === r && selected?.[1] === c) {
      return pieceLabel(piece)
    }
    return '?'
  }

  const w = PAD * 2 + CELL_W * COLS
  const h = PAD * 2 + CELL_H * ROWS

  return (
    <div className="junqi-wrap">
      <JunqiToolbar status={status} mode={mode} undo={undo} historyLen={history.length} reset={reset} />
      <GameResult result={winner ? status : null} onRestart={reset} />
      <p className="junqi-hint">
        {mode === 'ai'
          ? '你执红方 · 对手暗子在交战后亮明'
          : '轮到你时，选中己方暗子可查看番号'}
      </p>
      <p className="junqi-hint">6×12 简化军棋 · 行营安全，本营不可移动；夺旗或困住对手获胜。</p>
      <ResponsiveBoard width={w + 22} height={h + 22}>
        <div
          className="junqi-board-outer"
          style={{ ['--jq-w' as string]: `${w}px`, ['--jq-h' as string]: `${h}px` } as CSSProperties}
        >
          <div className="junqi-board-surface" style={{ width: w, height: h }}>
            <svg className="junqi-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
              <rect x={0} y={0} width={w} height={h} className="junqi-bg" rx={10} />
              {Array.from({ length: ROWS + 1 }, (_, j) => (
                <line
                  key={`h${j}`}
                  x1={PAD}
                  y1={PAD + j * CELL_H}
                  x2={PAD + COLS * CELL_W}
                  y2={PAD + j * CELL_H}
                  className="junqi-line"
                />
              ))}
              {Array.from({ length: COLS + 1 }, (_, i) => (
                <line
                  key={`v${i}`}
                  x1={PAD + i * CELL_W}
                  y1={PAD}
                  x2={PAD + i * CELL_W}
                  y2={PAD + ROWS * CELL_H}
                  className="junqi-line"
                />
              ))}
              <line
                x1={PAD}
                y1={PAD + 2.5 * CELL_H}
                x2={PAD + COLS * CELL_W}
                y2={PAD + 2.5 * CELL_H}
                className="junqi-frontline"
              />
              {Array.from({ length: ROWS }, (_, r) =>
                Array.from({ length: COLS }, (_, c) =>
                  isRailway(r, c) ? (
                    <rect
                      key={`rail-${r}-${c}`}
                      x={PAD + c * CELL_W + 2}
                      y={PAD + r * CELL_H + 2}
                      width={CELL_W - 4}
                      height={CELL_H - 4}
                      className="junqi-rail"
                      rx={4}
                    />
                  ) : null,
                ),
              )}
              {Array.from({ length: ROWS }, (_, r) =>
                Array.from({ length: COLS }, (_, c) =>
                  isCamp(r, c) ? (
                    <circle
                      key={`camp-${r}-${c}`}
                      cx={PAD + c * CELL_W + CELL_W / 2}
                      cy={PAD + r * CELL_H + CELL_H / 2}
                      r={12}
                      className="junqi-camp-mark"
                    />
                  ) : null,
                ),
              )}
            </svg>
            <div className="junqi-grid" style={{ width: w, height: h }}>
              <AnimatePresence initial={false}>
                {board.flatMap((row, r) =>
                  row.flatMap((piece, c) =>
                    piece ? (
                      <motion.div
                        key={piece.id}
                        className={`junqi-piece ${piece.side} ${piece.revealed ? 'revealed' : 'hidden'}`}
                        aria-hidden="true"
                        initial={{
                          left: PAD + c * CELL_W + 4,
                          top: PAD + r * CELL_H + 4,
                          scale: 0.7,
                          opacity: 0,
                        }}
                        animate={{
                          left: PAD + c * CELL_W + 4,
                          top: PAD + r * CELL_H + 4,
                          scale: 1,
                          opacity: 1,
                        }}
                        exit={{ scale: 0.65, opacity: 0 }}
                        transition={reduceMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 380, damping: 29 }}
                        style={{
                          width: CELL_W - 8,
                          height: CELL_H - 8,
                        }}
                      >
                        {displayLabel(piece, r, c)}
                      </motion.div>
                    ) : [],
                  ),
                )}
              </AnimatePresence>
              {Array.from({ length: ROWS }, (_, r) =>
                Array.from({ length: COLS }, (_, c) => {
                  const isSel = selected?.[0] === r && selected?.[1] === c
                  const isTarget = targets.some((m) => m.toR === r && m.toC === c)
                  const isLastFrom = lastMove?.fromR === r && lastMove?.fromC === c
                  const isLastTo = lastMove?.toR === r && lastMove?.toC === c
                  const hq = isHeadquarters(r, c)
                  const front = isFrontline(r)
                  const piece = board[r][c]
                  const visibleLabel = piece ? displayLabel(piece, r, c) : null
                  const pieceDescription = piece
                    ? `${piece.side === 'red' ? '红方' : '蓝方'}${visibleLabel === '?' ? '暗棋' : pieceName(piece)}`
                    : '空位'
                  return (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      aria-label={`${r + 1}行${c + 1}列，${pieceDescription}${hq ? '，大本营' : isCamp(r, c) ? '，行营' : ''}${isTarget ? '，可行棋' : ''}`}
                      aria-pressed={isSel}
                      disabled={winner !== null || (mode === 'ai' && turn === aiSide)}
                      className={`junqi-cell ${hq ? 'hq' : ''} ${front ? 'front' : ''} ${isSel ? 'selected' : ''} ${isTarget ? 'target' : ''} ${isLastFrom ? 'last-from' : ''} ${isLastTo ? 'last-to' : ''}`}
                      style={{
                        left: PAD + c * CELL_W,
                        top: PAD + r * CELL_H,
                        width: CELL_W,
                        height: CELL_H,
                      }}
                      onClick={() => onCellClick(r, c)}
                    />
                  )
                }),
              )}
            </div>
          </div>
        </div>
      </ResponsiveBoard>
    </div>
  )
}

function JunqiToolbar(props: {
  status: string
  mode: Mode
  undo: () => void
  historyLen: number
  reset: () => void
}) {
  const { status, mode, undo, historyLen, reset } = props
  return (
    <div className="junqi-toolbar">
      <p className="junqi-status" role="status" aria-live="polite" data-thinking={status.includes('思考')}>{status}</p>
      <div className="junqi-actions">
        {mode === 'local' && (
          <button type="button" className="junqi-undo" onClick={undo} disabled={historyLen === 0}>
            悔棋
          </button>
        )}
        <button type="button" className="junqi-reset" onClick={reset}>
          重开
        </button>
      </div>
    </div>
  )
}
