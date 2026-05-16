import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
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
import { COLS, ROWS, pieceLabel } from './junqiTypes'
import { legalMovesFrom, pickAiMoveJunqi } from './junqiMoves'

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

  const boardRef = useRef(board)
  useLayoutEffect(() => {
    boardRef.current = board
  }, [board])

  const humanSide: Side = 'red'
  const aiSide: Side = 'blue'

  const targets = useMemo(() => {
    if (!selected) return [] as Move[]
    const [r, c] = selected
    return legalMovesFrom(board, r, c, turn)
  }, [board, selected, turn])

  const status = useMemo(() => {
    if (winner) return `${winner === 'red' ? '红方' : '蓝方'} 胜`
    if (mode === 'ai' && turn === aiSide) return '电脑思考中…'
    return `${turn === 'red' ? '红方' : '蓝方'} 行棋（点击己方棋子后点目标格）`
  }, [winner, mode, turn, aiSide])

  const reset = useCallback(() => {
    setBoard(createInitialBoard())
    setTurn('red')
    setSelected(null)
    setWinner(null)
    setLastMove(null)
    setHistory([])
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

      if (defender?.type === 'flag' && result === 'attacker') {
        setWinner(turn)
        return
      }
      if (!next.flat().some((p) => p?.type === 'flag' && p.side === (turn === 'red' ? 'blue' : 'red'))) {
        setWinner(turn)
        return
      }
      setTurn(turn === 'red' ? 'blue' : 'red')
    },
    [board, turn, mode, lastMove, winner, selected],
  )

  useEffect(() => {
    if (winner || mode !== 'ai' || turn !== aiSide) return
    const t = window.setTimeout(() => {
      const cur = boardRef.current
      const m = pickAiMoveJunqi(cur, aiSide)
      if (!m) {
        setWinner(humanSide)
        return
      }
      const attacker = cur[m.fromR][m.fromC]!
      const defender = cur[m.toR][m.toC]
      let result: import('./junqiCombat').CombatResult = 'none'
      if (defender) result = resolveCombat(attacker, defender)
      const next = applyMove(cur, m, result)
      setLastMove(m)
      setBoard(next)
      if (defender?.type === 'flag' && result === 'attacker') {
        setWinner(aiSide)
        return
      }
      if (!next.flat().some((p) => p?.type === 'flag' && p.side === 'red')) {
        setWinner(aiSide)
        return
      }
      setTurn('red')
    }, 400)
    return () => window.clearTimeout(t)
  }, [winner, mode, turn, aiSide, humanSide])

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
      <p className="junqi-hint">
        {mode === 'ai'
          ? '你执红方（下方）。对方未翻开的棋子显示为「?」，交战后才亮明。'
          : '本地双人：双方均为暗棋「?」；只有轮到你走棋且选中己方棋子时，才显示该子番号。'}
      </p>
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
            {board.map((row, r) =>
              row.map((piece, c) =>
                piece ? (
                  <div
                    key={piece.id}
                    className={`junqi-piece ${piece.side} ${piece.revealed ? 'revealed' : 'hidden'}`}
                    style={{
                      left: PAD + c * CELL_W + 4,
                      top: PAD + r * CELL_H + 4,
                      width: CELL_W - 8,
                      height: CELL_H - 8,
                    }}
                  >
                    {displayLabel(piece, r, c)}
                  </div>
                ) : null,
              ),
            )}
            {Array.from({ length: ROWS }, (_, r) =>
              Array.from({ length: COLS }, (_, c) => {
                const isSel = selected?.[0] === r && selected?.[1] === c
                const isTarget = targets.some((m) => m.toR === r && m.toC === c)
                const isLastFrom = lastMove?.fromR === r && lastMove?.fromC === c
                const isLastTo = lastMove?.toR === r && lastMove?.toC === c
                const hq = isHeadquarters(r, c)
                const front = isFrontline(r, c)
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
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
      <p className="junqi-status">{status}</p>
      <div className="junqi-actions">
        {mode === 'local' && (
          <button type="button" className="junqi-undo" onClick={undo} disabled={historyLen === 0}>
            悔棋
          </button>
        )}
        <button type="button" className="junqi-reset" onClick={reset}>
          重新开始
        </button>
      </div>
    </div>
  )
}
