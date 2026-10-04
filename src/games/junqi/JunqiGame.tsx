import { GameResult } from '../../components/GameResult'
import { GameStatus } from '../../components/GameStatus'
import { BoardEffects } from '../../components/BoardEffects'
import { InteractionHint } from '../../components/InteractionHint'
import '../../styles/moving-games.css'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { AnimatePresence, motion, useReducedMotion, useIsPresent } from 'framer-motion'
import { ResponsiveBoard } from '../../components/ResponsiveBoard'
import { scheduleAiMove } from '../../workers/scheduleAiMove'
import { getUndoIndex } from '../undo'
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
  const [moveEffect, setMoveEffect] = useState<{ move: Move; eventKey: number; kind: 'move' | 'capture' | 'place' } | null>(null)
  const [boardEpoch, setBoardEpoch] = useState(0)
  const effectSequence = useRef(0)
  const aiCancelRef = useRef<(() => void) | null>(null)

  const reduceMotion = useReducedMotion()

  const humanSide: Side = 'red'
  const aiSide: Side = 'blue'

  const targets = useMemo(() => {
    if (!selected) return [] as Move[]
    const [r, c] = selected
    return legalMovesFrom(board, r, c, turn)
  }, [board, selected, turn])

  const status = useMemo(() => {
    if (aiError) return '电脑计算遇到问题，可悔棋重试或重新开始'
    if (winner) return `${winner === 'red' ? '红方' : '蓝方'} 胜`
    if (mode === 'ai' && turn === aiSide) return '电脑思考中…'
    if (selected && targets.length === 0) return '该棋子不可移动 · 换一枚棋子'
    return `${turn === 'red' ? '红方' : '蓝方'}行棋 · ${selected ? '选择落点' : '选择棋子'}`
  }, [winner, mode, turn, aiSide, selected, targets.length, aiError])

  const reset = useCallback(() => {
    aiCancelRef.current?.()
    aiCancelRef.current = null
    setBoard(createInitialBoard())
    setTurn('red')
    setSelected(null)
    setWinner(null)
    setLastMove(null)
    setHistory([])
    setAiError(false)
    setMoveEffect(null)
    setBoardEpoch(epoch => epoch + 1)
  }, [])

  const undo = useCallback(() => {
    const index = getUndoIndex(history, mode, humanSide)
    if (index < 0) return
    aiCancelRef.current?.()
    aiCancelRef.current = null
    const prev = history[index]
    setHistory((h) => h.slice(0, index))
    setBoard(snapshotBoard(prev.board))
    setTurn(prev.turn)
    setLastMove(prev.lastMove)
    setWinner(prev.winner)
    setSelected(mode === 'ai' ? null : prev.selected)
    setAiError(false)
    setMoveEffect(null)
    setBoardEpoch(epoch => epoch + 1)
  }, [mode, history, humanSide])

  const tryMove = useCallback(
    (m: Move) => {
      setHistory((h) => [...h, { board: snapshotBoard(board), turn, lastMove, winner, selected }])
      const attacker = board[m.fromR][m.fromC]!
      const defender = board[m.toR][m.toC]
      let result: import('./junqiCombat').CombatResult = 'none'
      if (defender) result = resolveCombat(attacker, defender)
      const next = applyMove(board, m, result)
      setMoveEffect({ move: m, eventKey: ++effectSequence.current, kind: defender ? 'capture' : 'move' })
      setLastMove(m)
      setBoard(next)
      setSelected(null)

      const nextTurn = turn === 'red' ? 'blue' : 'red'
      setWinner(getWinnerJunqi(next, nextTurn))
      setTurn(nextTurn)
    },
    [board, turn, lastMove, winner, selected],
  )

  const present = useIsPresent()
  useEffect(() => {
    if (!present || winner || aiError || mode !== 'ai' || turn !== aiSide) return
    const cancel = scheduleAiMove('junqi', { board, side: aiSide }, (m) => {
      if (!m) {
        setWinner(humanSide)
        return
      }
      tryMove(m)
    }, 140, () => setAiError(true))
    aiCancelRef.current = cancel
    return () => {
      cancel()
      if (aiCancelRef.current === cancel) aiCancelRef.current = null
    }
  }, [present, winner, aiError, mode, turn, board, aiSide, humanSide, tryMove, boardEpoch])

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

  const thinking = mode === 'ai' && turn === aiSide && !winner && !aiError
  const displaySide = winner ?? turn
  const selectedPiece = selected ? board[selected[0]][selected[1]] : null
  const detail = aiError ? '可悔棋重试，或重新开始' : selectedPiece && selected ? `已选${displayLabel(selectedPiece, selected[0], selected[1])} · ${targets.length ? `${targets.length} 个落点可走` : '不可移动，请换一枚棋子'}`
    : winner ? '本局结束，可悔棋练习或重新开始' : thinking ? '电脑正在思考，也可悔棋调整上一步' : '先选己方棋子，再查看可走或可交战的落点'

  const w = PAD * 2 + CELL_W * COLS
  const h = PAD * 2 + CELL_H * ROWS

  return (
    <div className="junqi-wrap moving-game">
      <JunqiToolbar status={status} thinking={thinking} sideLabel={displaySide === 'red' ? '红方' : '蓝方'} sideTone={displaySide === 'red' ? 'red' : 'blue'} detail={detail} mode={mode} undo={undo} historyLen={history.length} reset={reset} />
      <GameResult result={winner ? status : null} onRestart={reset} />
      <InteractionHint steps={['选己方子', '查看落点', '移动或交战']} activeStep={selected ? 1 : 0} note={winner ? '本局结束。可不限次数悔棋复盘，或重新开始。' : mode === 'ai' ? '你执红方；绿点可走，金圈可交战。对手暗子交战后才亮明。悔棋不限次数，每次回到你上一手行棋前。' : '轮到你时，选中己方暗子可看番号；绿点可走，金圈可交战。'} />
      <ResponsiveBoard width={w + 22} height={h + 22}>
        <div
          className="junqi-board-outer"
          style={{ ['--jq-w' as string]: `${w}px`, ['--jq-h' as string]: `${h}px` } as CSSProperties}
        >
          <div className="junqi-board-surface" style={{ width: w, height: h }}>
            <BoardEffects key={boardEpoch} width={w} height={h} eventKey={moveEffect?.eventKey ?? ''} from={moveEffect ? { x: PAD + (moveEffect.move.fromC + .5) * CELL_W, y: PAD + (moveEffect.move.fromR + .5) * CELL_H } : undefined} to={moveEffect ? { x: PAD + (moveEffect.move.toC + .5) * CELL_W, y: PAD + (moveEffect.move.toR + .5) * CELL_H } : undefined} kind={moveEffect?.kind} />
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
              <AnimatePresence key={boardEpoch} initial={false} custom={moveEffect}>
                {board.flatMap((row, r) =>
                  row.flatMap((piece, c) =>
                    piece ? (
                      <motion.div
                        key={piece.id}
                        className={`moving-piece ${lastMove?.toR === r && lastMove?.toC === c ? 'moving-piece--last' : ''}`}
                        aria-hidden="true"
                        initial={reduceMotion ? false : { x: PAD + c * CELL_W + 4, y: PAD + r * CELL_H + 4, scale: .72, opacity: 0 }}
                        animate={{ x: PAD + c * CELL_W + 4, y: PAD + r * CELL_H + 4, scale: 1, opacity: 1 }}
                        variants={{ removed: (effect: typeof moveEffect) => effect && effect.move.fromR === r && effect.move.fromC === c
                          ? { x: PAD + effect.move.toC * CELL_W + 4, y: PAD + effect.move.toR * CELL_H + 4, scale: .65, opacity: 0 }
                          : { scale: .55, opacity: 0 } }}
                        exit="removed"
                        transition={reduceMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 400, damping: 31, mass: .85 }}
                        style={{
                          width: CELL_W - 8,
                          height: CELL_H - 8,
                        }}
                      >
                        <div className={`junqi-piece ${piece.side} ${piece.revealed ? 'revealed' : 'hidden'}`} style={{ width: CELL_W - 8, height: CELL_H - 8 }}>{displayLabel(piece, r, c)}</div>
                      </motion.div>
                    ) : [],
                  ),
                )}
              </AnimatePresence>
              {Array.from({ length: ROWS }, (_, r) =>
                Array.from({ length: COLS }, (_, c) => {
                  const isSel = selected?.[0] === r && selected?.[1] === c
                  const isTarget = targets.some((m) => m.toR === r && m.toC === c)
                  const isCapture = isTarget && !!board[r][c]
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
                      aria-label={`${r + 1}行${c + 1}列，${pieceDescription}${hq ? '，大本营' : isCamp(r, c) ? '，行营' : ''}${isTarget ? isCapture ? '，可交战' : '，可走空位' : ''}`}
                      aria-pressed={isSel}
                      disabled={winner !== null || (mode === 'ai' && turn === aiSide)}
                      className={`junqi-cell ${hq ? 'hq' : ''} ${front ? 'front' : ''} ${isSel ? 'selected' : ''} ${isTarget ? 'target' : ''} ${isCapture ? 'capture-target' : ''} ${isLastFrom ? 'last-from' : ''} ${isLastTo ? 'last-to' : ''}`}
                      style={{
                        left: PAD + c * CELL_W,
                        top: PAD + r * CELL_H,
                        width: CELL_W,
                        height: CELL_H,
                      }}
                      onClick={() => onCellClick(r, c)}
                    >{isTarget && <span aria-hidden="true" className={`move-target-marker ${isCapture ? 'move-target-marker--capture' : ''}`} />}</button>
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
  thinking: boolean
  sideLabel: string
  sideTone: 'red' | 'blue'
  detail: string
  mode: Mode
  undo: () => void
  historyLen: number
  reset: () => void
}) {
  const { status, thinking, sideLabel, sideTone, detail, mode, undo, historyLen, reset } = props
  return (
    <div className="junqi-toolbar">
      <GameStatus status={status} thinking={thinking} sideLabel={sideLabel} sideTone={sideTone} detail={detail} />
      <div className="junqi-actions">
        <button type="button" className="junqi-undo" onClick={undo} disabled={historyLen === 0} title={mode === 'ai' ? '不限次数，撤回到你上次行棋前' : '不限次数，撤回上一步'}>
          悔棋
        </button>
        <button type="button" className="junqi-reset" onClick={reset}>
          重开
        </button>
      </div>
    </div>
  )
}
