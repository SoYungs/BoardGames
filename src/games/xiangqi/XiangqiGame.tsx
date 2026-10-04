import { GameResult } from '../../components/GameResult'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ResponsiveBoard } from '../../components/ResponsiveBoard'
import { scheduleAiMove } from '../../workers/scheduleAiMove'
import { applyMove, createInitialBoard, snapshotBoard } from './xiangqiBoard'
import type { Board, Move, Side } from './xiangqiTypes'
import { pieceChar } from './xiangqiTypes'
import {
  getXiangqiWinner,
  inCheck,
  legalMovesFromChecked,
} from './xiangqiMoves'

type Mode = 'local' | 'ai'

const CELL = 44
const PAD = 28

type XiangqiSnap = {
  board: Board
  turn: Side
  lastMove: Move | null
  winner: Side | null
  selected: [number, number] | null
}

export function XiangqiGame({ mode }: { mode: Mode }) {
  const [board, setBoard] = useState<Board>(() => createInitialBoard())
  const [turn, setTurn] = useState<Side>('red')
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [winner, setWinner] = useState<Side | null>(null)
  const [lastMove, setLastMove] = useState<Move | null>(null)
  const [history, setHistory] = useState<XiangqiSnap[]>([])
  const [aiError, setAiError] = useState(false)

  const boardForAiRef = useRef(board)
  useLayoutEffect(() => {
    boardForAiRef.current = board
  }, [board])

  const humanSide: Side = 'red'
  const aiSide: Side = 'black'

  const targets = useMemo(() => {
    if (!selected) return [] as Move[]
    const [r, c] = selected
    return legalMovesFromChecked(board, r, c)
  }, [board, selected])

  const isCheck = useMemo(() => !winner && inCheck(board, turn), [winner, board, turn])

  const status = useMemo(() => {
    if (aiError) return '电脑计算遇到问题，请重新开始'
    if (winner) return `${winner === 'red' ? '红方' : '黑方'} 胜`
    if (mode === 'ai' && turn === aiSide) return '电脑思考中…'
    const sideLabel = turn === 'red' ? '红方' : '黑方'
    const chk = isCheck ? ' · 将军！' : ''
    return `${sideLabel} 行棋${chk}`
  }, [winner, mode, turn, aiSide, isCheck, aiError])

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
        setHistory((h) => [
          ...h,
          {
            board: snapshotBoard(board),
            turn,
            lastMove,
            winner,
            selected,
          },
        ])
      }
      const cap = board[m.toR][m.toC]
      const next = applyMove(board, m.fromR, m.fromC, m.toR, m.toC)
      setLastMove(m)
      setBoard(next)
      setSelected(null)
      const opp: Side = turn === 'red' ? 'black' : 'red'
      if (cap?.type === 'k') {
        setWinner(turn)
        return
      }
      const nextTurn = opp
      const nextWinner = getXiangqiWinner(next, nextTurn)
      if (nextWinner) {
        setWinner(nextWinner)
        return
      }
      setTurn(nextTurn)
    },
    [board, turn, mode, lastMove, winner, selected],
  )

  useEffect(() => {
    if (winner || aiError || mode !== 'ai' || turn !== aiSide) return
    const cur = boardForAiRef.current
    return scheduleAiMove('xiangqi', { board: cur, side: aiSide }, (m) => {
      if (!m) {
        setWinner(humanSide)
        return
      }
      const cap = cur[m.toR][m.toC]
      const next = applyMove(cur, m.fromR, m.fromC, m.toR, m.toC)
      setLastMove(m)
      if (cap?.type === 'k') {
        setWinner(aiSide)
        setBoard(next)
        return
      }
      const nextWinner = getXiangqiWinner(next, 'red')
      if (nextWinner) {
        setWinner(nextWinner)
        setBoard(next)
        return
      }
      setBoard(next)
      setTurn('red')
    }, 140, () => setAiError(true))
  }, [winner, aiError, mode, turn, aiSide, humanSide])

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
    if (piece?.side === turn) {
      setSelected([r, c])
    }
  }

  const w = PAD * 2 + CELL * (9 - 1)
  const h = PAD * 2 + CELL * (10 - 1)

  /** 人机：沿用原基线位置；双人：河在第四、五横线之间取竖直中线，左右以棋盘竖中线对称 */
  const riverY = PAD + 4.55 * CELL
  const dualRiver = mode === 'local'
  const gridMidX = PAD + 4 * CELL
  const riverMidY = PAD + 4.5 * CELL
  const riverSideOffset = 2 * CELL
  const riverChuX = dualRiver ? gridMidX - riverSideOffset : PAD + 1.5 * CELL
  const riverHanX = dualRiver ? gridMidX + riverSideOffset : PAD + 5.2 * CELL

  return (
    <div className="xiangqi-wrap">
      <div className="xiangqi-toolbar">
        <p className="xiangqi-status" role="status" aria-live="polite" data-thinking={mode === 'ai' && turn === aiSide && !winner && !aiError}>{status}</p>
        <div className="xiangqi-actions">
          {mode === 'local' && (
            <button type="button" className="xiangqi-undo" onClick={undo} disabled={history.length === 0}>
              悔棋
            </button>
          )}
          <button type="button" className="xiangqi-reset" onClick={reset}>
            重新开始
          </button>
        </div>
      </div>
      <GameResult result={winner ? status : null} onRestart={reset} />
      {mode === 'ai' && <p className="xiangqi-hint">你执红棋在下方先手；电脑执黑。</p>}
      <ResponsiveBoard width={w + 22} height={h + 22}>
      <div
        className="xiangqi-board-outer"
        style={
          {
            ['--xq-w' as string]: `${w}px`,
            ['--xq-h' as string]: `${h}px`,
          } as CSSProperties
        }
      >
        <div
          className={`xiangqi-board-surface${mode === 'local' ? ' xiangqi-board-surface--dual' : ''}`}
          style={{ width: w, height: h }}
        >
          {isCheck && (
            <div className="xiangqi-check-banner" role="status" aria-live="polite" data-thinking={mode === 'ai' && turn === aiSide && !winner && !aiError}>
              将军
            </div>
          )}
          <svg
            className="xiangqi-svg"
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            role="img"
            aria-label="中国象棋棋盘"
          >
          <rect x={0} y={0} width={w} height={h} className="xiangqi-bg" rx={10} />
          {Array.from({ length: 10 }, (_, j) => (
            <line
              key={`h${j}`}
              x1={PAD}
              y1={PAD + j * CELL}
              x2={PAD + 8 * CELL}
              y2={PAD + j * CELL}
              className="xiangqi-line"
            />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={PAD + i * CELL}
              y1={PAD}
              x2={PAD + i * CELL}
              y2={PAD + 4 * CELL}
              className="xiangqi-line"
            />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <line
              key={`v2${i}`}
              x1={PAD + i * CELL}
              y1={PAD + 5 * CELL}
              x2={PAD + i * CELL}
              y2={PAD + 9 * CELL}
              className="xiangqi-line"
            />
          ))}
          <line
            x1={PAD + 3 * CELL}
            y1={PAD}
            x2={PAD + 5 * CELL}
            y2={PAD + 2 * CELL}
            className="xiangqi-line"
          />
          <line
            x1={PAD + 5 * CELL}
            y1={PAD}
            x2={PAD + 3 * CELL}
            y2={PAD + 2 * CELL}
            className="xiangqi-line"
          />
          <line
            x1={PAD + 3 * CELL}
            y1={PAD + 7 * CELL}
            x2={PAD + 5 * CELL}
            y2={PAD + 9 * CELL}
            className="xiangqi-line"
          />
          <line
            x1={PAD + 5 * CELL}
            y1={PAD + 7 * CELL}
            x2={PAD + 3 * CELL}
            y2={PAD + 9 * CELL}
            className="xiangqi-line"
          />
          <text
            x={riverChuX}
            y={dualRiver ? riverMidY : riverY}
            className="xiangqi-river"
            textAnchor={dualRiver ? 'middle' : 'start'}
            dominantBaseline={dualRiver ? 'middle' : undefined}
          >
            楚 河
          </text>
          {dualRiver ? (
            <g transform={`translate(${riverHanX}, ${riverMidY})`}>
              <text
                x={0}
                y={0}
                className="xiangqi-river"
                textAnchor="middle"
                dominantBaseline="middle"
                transform="rotate(180)"
              >
                汉 界
              </text>
            </g>
          ) : (
            <text x={riverHanX} y={riverY} className="xiangqi-river">
              汉 界
            </text>
          )}
          </svg>
          <div className="xiangqi-grid" style={{ width: w, height: h }}>
          {Array.from({ length: 10 }, (_, r) =>
            Array.from({ length: 9 }, (_, c) => {
              const isSel = selected?.[0] === r && selected?.[1] === c
              const isTarget = targets.some((m) => m.toR === r && m.toC === c)
              const isLastFrom = lastMove?.fromR === r && lastMove?.fromC === c
              const isLastTo = lastMove?.toR === r && lastMove?.toC === c
              const piece = board[r][c]
              const label = piece ? `${piece.side === 'red' ? '红方' : '黑方'}${pieceChar(piece)}` : '空位'
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  className={`xiangqi-cell ${isSel ? 'selected' : ''} ${isTarget ? 'target' : ''} ${isLastFrom ? 'last-from' : ''} ${isLastTo ? 'last-to' : ''}`}
                  style={{
                    left: PAD + c * CELL - 22,
                    top: PAD + r * CELL - 22,
                  }}
                  aria-label={`第 ${r + 1} 行第 ${c + 1} 列，${label}${isTarget ? '，合法目标' : ''}`}
                  aria-pressed={isSel}
                  onClick={() => onCellClick(r, c)}
                />
              )
            }),
          )}
          <AnimatePresence initial={false}>
          {board.flatMap((row, r) =>
            row.map((piece, c) =>
              piece ? (
                <motion.div
                  key={piece.id}
                  style={{ position: 'absolute', left: 0, top: 0, width: 40, height: 40, pointerEvents: 'none' }}
                  initial={{ opacity: 0, scale: 0.65 }}
                  animate={{ x: PAD + c * CELL - 20, y: PAD + r * CELL - 20, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.45 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                  aria-hidden="true"
                >
                  <div className={`xiangqi-piece ${piece.side}`} style={{ left: 0, top: 0 }}>
                  {pieceChar(piece)}
                  </div>
                </motion.div>
              ) : null,
            ),
          )}
          </AnimatePresence>
          </div>
        </div>
      </div>
      </ResponsiveBoard>
    </div>
  )
}
