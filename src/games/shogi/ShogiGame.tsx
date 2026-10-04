import { GameResult } from '../../components/GameResult'
import { GameStatus } from '../../components/GameStatus'
import { BoardEffects } from '../../components/BoardEffects'
import { InteractionHint } from '../../components/InteractionHint'
import '../../styles/moving-games.css'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { AnimatePresence, motion, useReducedMotion, useIsPresent } from 'framer-motion'
import { ResponsiveBoard } from '../../components/ResponsiveBoard'
import { scheduleAiMove } from '../../workers/scheduleAiMove'
import { applyShogiMove, createInitialBoard, emptyHand, snapshotBoard, snapshotHand } from './shogiBoard'
import type { Board, Hand, Move, PieceType, Side } from './shogiTypes'
import { COLS, ROWS, pieceChar } from './shogiTypes'
import {
  allLegalMovesChecked,
  inCheck,
  legalMovesFromChecked,
} from './shogiMoves'

type Mode = 'local' | 'ai'

const CELL = 40
const PAD = 24

type ShogiSnap = {
  board: Board
  hand: Hand
  turn: Side
  lastMove: Move | null
  winner: Side | null
  selected: [number, number] | null
  selectedDrop: PieceType | null
}

export function ShogiGame({ mode }: { mode: Mode }) {
  const [board, setBoard] = useState<Board>(() => createInitialBoard())
  const [hand, setHand] = useState<Hand>(() => emptyHand())
  const [turn, setTurn] = useState<Side>('sente')
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [selectedDrop, setSelectedDrop] = useState<PieceType | null>(null)
  const [winner, setWinner] = useState<Side | null>(null)
  const [lastMove, setLastMove] = useState<Move | null>(null)
  const [history, setHistory] = useState<ShogiSnap[]>([])
  const [promotionChoices, setPromotionChoices] = useState<Move[] | null>(null)
  const [aiError, setAiError] = useState(false)
  const [moveEffect, setMoveEffect] = useState<{ move: Move; eventKey: number; kind: 'move' | 'capture' | 'place' } | null>(null)
  const [boardEpoch, setBoardEpoch] = useState(0)
  const effectSequence = useRef(0)
  const gameRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([])
  const promotionFocus = useRef<[number, number] | null>(null)
  const reduceMotion = useReducedMotion()

  useLayoutEffect(() => {
    if (promotionChoices || !promotionFocus.current) return
    const [r, c] = promotionFocus.current
    promotionFocus.current = null
    const cell = cellRefs.current[r * COLS + c]
    const target = cell?.disabled ? gameRef.current?.querySelector<HTMLElement>('.game-status-copy') : cell
    target?.focus({ preventScroll: true })
  }, [promotionChoices])

  const humanSide: Side = 'sente'
  const aiSide: Side = 'gote'

  const targets = useMemo(() => {
    if (selectedDrop) {
      return allLegalMovesChecked(board, hand, turn).filter((m) => m.dropType === selectedDrop)
    }
    if (!selected) return [] as Move[]
    const [r, c] = selected
    return legalMovesFromChecked(board, hand, r, c)
  }, [board, hand, selected, selectedDrop, turn])

  const targetSet = useMemo(() => new Set(targets.map((m) => `${m.toR},${m.toC}`)), [targets])

  const checkState = useMemo(() => {
    if (winner) return { showCheckOverlay: false, isCheckmate: false }
    if (!inCheck(board, turn)) return { showCheckOverlay: false, isCheckmate: false }
    const moves = allLegalMovesChecked(board, hand, turn)
    return { showCheckOverlay: true, isCheckmate: moves.length === 0 }
  }, [winner, board, hand, turn])

  const status = useMemo(() => {
    if (winner) return `${winner === 'sente' ? '先手' : '后手'} 胜`
    if (aiError) return '电脑计算遇到问题，请重新开始'
    if (promotionChoices) return '请选择升变或不升，完成这一步'
    if (mode === 'ai' && turn === aiSide) return '电脑思考中…'
    const sideLabel = turn === 'sente' ? '先手' : '后手'
    const chk = checkState.showCheckOverlay ? ' · 王手！' : ''
    return `${sideLabel} 行棋${chk}`
  }, [winner, aiError, mode, turn, aiSide, checkState.showCheckOverlay, promotionChoices])

  const reset = useCallback(() => {
    promotionFocus.current = null
    setBoard(createInitialBoard())
    setHand(emptyHand())
    setTurn('sente')
    setSelected(null)
    setSelectedDrop(null)
    setWinner(null)
    setLastMove(null)
    setHistory([])
    setPromotionChoices(null)
    setAiError(false)
    setMoveEffect(null)
    setBoardEpoch(epoch => epoch + 1)
  }, [])

  const undo = useCallback(() => {
    if (mode !== 'local' || history.length === 0) return
    promotionFocus.current = null
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setBoard(snapshotBoard(prev.board))
    setHand(snapshotHand(prev.hand))
    setTurn(prev.turn)
    setLastMove(prev.lastMove)
    setWinner(prev.winner)
    setSelected(prev.selected)
    setSelectedDrop(prev.selectedDrop)
    setPromotionChoices(null)
    setMoveEffect(null)
    setBoardEpoch(epoch => epoch + 1)
  }, [mode, history])

  const tryMove = useCallback(
    (m: Move) => {
      const ok = targets.some(
        (x) =>
          x.toR === m.toR &&
          x.toC === m.toC &&
          (x.dropType ?? null) === (m.dropType ?? null) &&
          (x.fromR ?? null) === (m.fromR ?? null) &&
          (x.fromC ?? null) === (m.fromC ?? null) &&
          x.promote === m.promote,
      )
      if (!ok) return

      if (mode === 'local') {
        setHistory((h) => [
          ...h,
          {
            board: snapshotBoard(board),
            hand: snapshotHand(hand),
            turn,
            lastMove,
            winner,
            selected,
            selectedDrop,
          },
        ])
      }
      const { board: next, hand: nextHand } = applyShogiMove(board, hand, m, turn)
      setMoveEffect({ move: m, eventKey: ++effectSequence.current, kind: board[m.toR][m.toC] ? 'capture' : m.dropType ? 'place' : 'move' })
      setLastMove(m)
      setBoard(next)
      setHand(nextHand)
      setSelected(null)
      setSelectedDrop(null)
      setPromotionChoices(null)
      const opp: Side = turn === 'sente' ? 'gote' : 'sente'
      if (!next.flat().some((p) => p?.type === 'k' && p.side === opp)) {
        setWinner(turn)
        return
      }
      const movesNext = allLegalMovesChecked(next, nextHand, opp)
      if (movesNext.length === 0) {
        setWinner(turn)
        return
      }
      setTurn(opp)
    },
    [board, hand, turn, mode, lastMove, winner, selected, selectedDrop, targets],
  )

  const present = useIsPresent()
  useEffect(() => {
    if (!present || winner || mode !== 'ai' || turn !== aiSide) return
    return scheduleAiMove('shogi', { board, hand, side: aiSide }, (m: Move | null) => {
      if (!m) {
        setWinner(humanSide)
        return
      }
      const { board: next, hand: nextHand } = applyShogiMove(board, hand, m, aiSide)
      setMoveEffect({ move: m, eventKey: ++effectSequence.current, kind: board[m.toR][m.toC] ? 'capture' : m.dropType ? 'place' : 'move' })
      setLastMove(m)
      setBoard(next)
      setHand(nextHand)
      if (!next.flat().some((p) => p?.type === 'k' && p.side === 'sente')) {
        setWinner(aiSide)
        return
      }
      const senteMoves = allLegalMovesChecked(next, nextHand, 'sente')
      if (senteMoves.length === 0) {
        setWinner(aiSide)
        return
      }
      setTurn('sente')
    }, 140, () => setAiError(true))
  }, [present, winner, mode, turn, aiSide, humanSide, board, hand])

  const onCellClick = (r: number, c: number) => {
    if (winner || promotionChoices) return
    if (mode === 'ai' && turn === aiSide) return
    const piece = board[r][c]
    if (selectedDrop) {
      const hit = targets.find((m) => m.toR === r && m.toC === c)
      if (hit) tryMove(hit)
      return
    }
    if (selected) {
      const choices = targets.filter((m) => m.toR === r && m.toC === c)
      if (choices.length > 0) {
        if (choices.length > 1) setPromotionChoices(choices)
        else tryMove(choices[0])
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

  const onHandClick = (type: PieceType) => {
    if (winner || promotionChoices || (mode === 'ai' && turn === aiSide)) return
    if (!hand[turn].includes(type)) return
    setSelected(null)
    setSelectedDrop(selectedDrop === type ? null : type)
  }

  const cancelPromotion = () => {
    promotionFocus.current = selected
    setPromotionChoices(null)
  }

  const confirmPromotion = (move: Move) => {
    promotionFocus.current = [move.toR, move.toC]
    tryMove(move)
  }

  const thinking = mode === 'ai' && turn === aiSide && !winner && !aiError
  const selectedPiece = selected ? board[selected[0]][selected[1]] : null
  const chosenLabel = selectedDrop ? pieceChar({ id: '', side: turn, type: selectedDrop, promoted: false }) : selectedPiece ? pieceChar(selectedPiece) : null
  const detail = aiError ? '请点击重新开始，恢复对局' : promotionChoices ? '选择是否升变，完成这一步'
    : chosenLabel ? `${selectedDrop ? '准备打入' : '已选'}${chosenLabel} · ${targetSet.size ? `${targetSet.size} 个落点可走` : '暂无合法落点，请重新选择'}`
      : winner ? '本局结束，可重新开始' : thinking ? '电脑正在思考，下一步很快就来' : '先选棋子，或从持子栏选择打入的棋子'

  const w = PAD * 2 + CELL * (COLS - 1)
  const h = PAD * 2 + CELL * (ROWS - 1)

  const handCounts = (side: Side) => {
    const counts = new Map<PieceType, number>()
    for (const t of hand[side]) counts.set(t, (counts.get(t) ?? 0) + 1)
    return counts
  }

  const renderHand = (side: Side, label: string) => {
    const counts = handCounts(side)
    const types: PieceType[] = ['r', 'b', 'g', 's', 'n', 'l', 'p']
    return (
      <div className={`shogi-hand shogi-hand--${side}`}>
        <span className="shogi-hand-label">{label}</span>
        <ShogiHandPieces
          types={types}
          counts={counts}
          side={side}
          turn={turn}
          selectedDrop={selectedDrop}
          winner={winner}
          mode={mode}
          aiSide={aiSide}
          onHandClick={onHandClick}
        />
      </div>
    )
  }

  return (
    <div className="shogi-wrap moving-game" ref={gameRef}>
      <div className="shogi-toolbar">
        <GameStatus status={status} thinking={thinking} sideLabel={turn === 'sente' ? '先手' : '后手'} sideTone={turn === 'sente' ? 'dark' : 'red'} detail={detail} />
        <div className="shogi-actions">
          {mode === 'local' && (
            <button type="button" className="shogi-undo" onClick={undo} disabled={history.length === 0}>
              悔棋
            </button>
          )}
          <button type="button" className="shogi-reset" onClick={reset}>
            重新开始
          </button>
        </div>
      </div>
      <GameResult result={winner ? status : null} onRestart={reset} />
      <InteractionHint steps={['选棋子或持子', '查看落点', '走子或打入']} activeStep={promotionChoices ? 2 : selected || selectedDrop ? 1 : 0} note={winner ? '本局结束。可重新开始，或在双人模式悔棋复盘。' : checkState.showCheckOverlay ? '正在被王手：先保护你的玉。' : selectedDrop ? '绿点是这枚持子可以打入的空位；再点持子可取消。' : '绿点可走，金圈可吃；吃下的棋子会进入持子栏。'} />
      {promotionChoices && (
        <div className="shogi-promotion" role="group" aria-label="选择是否升变" onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            cancelPromotion()
          }
        }}>
          <p>进入或离开敌阵，可以将棋子升变。</p>
          <button type="button" className="shogi-reset" autoFocus onClick={() => confirmPromotion(promotionChoices.find((m) => m.promote === true)!)}>
            升变
          </button>
          <button type="button" className="shogi-undo" onClick={() => confirmPromotion(promotionChoices.find((m) => m.promote === false)!)}>
            不升
          </button>
          <button type="button" className="shogi-undo" onClick={cancelPromotion}>
            取消
          </button>
        </div>
      )}
      {renderHand('gote', '后手持子')}
      <ResponsiveBoard width={w + 22} height={h + 22}>
      <div
        className="shogi-board-outer"
        style={{ ['--sg-w' as string]: `${w}px`, ['--sg-h' as string]: `${h}px` } as CSSProperties}
      >
        <div
          className={`shogi-board-surface${mode === 'local' ? ' shogi-board-surface--dual' : ''}`}
          style={{ width: w, height: h }}
        >
          {checkState.showCheckOverlay && (
            <div className="shogi-check-banner" role="status" aria-live="polite" data-thinking={mode === 'ai' && turn === aiSide && !winner && !aiError}>
              王手
            </div>
          )}
          <BoardEffects key={boardEpoch} width={w} height={h} eventKey={moveEffect?.eventKey ?? ''} from={moveEffect && moveEffect.move.fromR !== undefined && moveEffect.move.fromC !== undefined ? { x: PAD + moveEffect.move.fromC * CELL, y: PAD + moveEffect.move.fromR * CELL } : undefined} to={moveEffect ? { x: PAD + moveEffect.move.toC * CELL, y: PAD + moveEffect.move.toR * CELL } : undefined} kind={moveEffect?.kind} />
          <svg className="shogi-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
            <rect x={0} y={0} width={w} height={h} className="shogi-bg" rx={8} />
            {Array.from({ length: ROWS }, (_, j) => (
              <line
                key={`h${j}`}
                x1={PAD}
                y1={PAD + j * CELL}
                x2={PAD + (COLS - 1) * CELL}
                y2={PAD + j * CELL}
                className="shogi-line"
              />
            ))}
            {Array.from({ length: COLS }, (_, i) => (
              <line
                key={`v${i}`}
                x1={PAD + i * CELL}
                y1={PAD}
                x2={PAD + i * CELL}
                y2={PAD + (ROWS - 1) * CELL}
                className="shogi-line"
              />
            ))}
            {Array.from({ length: COLS }, (_, i) => (
              <text key={`n${i}`} x={PAD + i * CELL} y={PAD - 8} className="shogi-coord" textAnchor="middle">
                {9 - i}
              </text>
            ))}
          </svg>
          <div className="shogi-grid" style={{ width: w, height: h }} role="group" aria-label="将棋棋盘">
            {Array.from({ length: ROWS }, (_, r) =>
              Array.from({ length: COLS }, (_, c) => {
                const isSel = selected?.[0] === r && selected?.[1] === c
                const isTarget = targetSet.has(`${r},${c}`)
                const isCapture = isTarget && !!board[r][c]
                const isLastFrom = lastMove?.fromR === r && lastMove?.fromC === c
                const isLastTo = lastMove?.toR === r && lastMove?.toC === c
                const piece = board[r][c]
                const label = piece ? `${piece.side === 'sente' ? '先手' : '后手'}${pieceChar(piece)}` : '空格'
                return (
                  <button
                    key={`hit-${r}-${c}`}
                    ref={(cell) => { cellRefs.current[r * COLS + c] = cell }}
                    type="button"
                    aria-label={`${9 - c}筋${r + 1}段，${label}${isTarget ? isCapture ? '，可吃子' : selectedDrop ? '，可打入' : '，可走空位' : ''}`}
                    aria-pressed={isSel}
                    disabled={winner !== null || promotionChoices !== null || (mode === 'ai' && turn === aiSide)}
                    onClick={() => onCellClick(r, c)}
                    className={`shogi-hit ${isSel ? 'selected' : ''} ${isTarget ? 'target' : ''} ${isCapture ? 'capture-target' : ''} ${isLastFrom ? 'last-from' : ''} ${isLastTo ? 'last-to' : ''}`}
                    style={{
                      left: PAD + c * CELL - 20,
                      top: PAD + r * CELL - 20,
                    }}
                  >{isTarget && <span aria-hidden="true" className={`move-target-marker ${isCapture ? 'move-target-marker--capture' : ''}`} />}</button>
                )
              }),
            )}
            <AnimatePresence key={boardEpoch} initial={false}>
            {board.flatMap((row, r) =>
              row.map((piece, c) =>
                piece ? (
                  <motion.div
                    key={piece.id}
                    aria-hidden="true"
                    className={`moving-piece ${lastMove?.toR === r && lastMove?.toC === c ? 'moving-piece--last' : ''}`}
                    style={{ width: 40, height: 40 }}
                    initial={reduceMotion ? false : { x: PAD + c * CELL - 20, y: PAD + r * CELL - 20, scale: .72, opacity: 0 }}
                    animate={{ x: PAD + c * CELL - 20, y: PAD + r * CELL - 20, scale: 1, opacity: 1 }}
                    exit={{ scale: .55, opacity: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 31, mass: .85 }}
                  >
                    <div className={`shogi-piece shogi-piece--${piece.side}${piece.promoted ? ' promoted' : ''}`}><svg className="shogi-piece-plaque" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 1 33 9 38 38H2L7 9Z" /><path className="shogi-piece-inset" d="m20 4 10 7 5 24H5l5-24Z" /></svg><span>{pieceChar(piece)}</span></div>
                  </motion.div>
                ) : null,
              ),
            )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      </ResponsiveBoard>
      {renderHand('sente', '先手持子')}
    </div>
  )
}

function ShogiHandPieces(props: {
  types: PieceType[]
  counts: Map<PieceType, number>
  side: Side
  turn: Side
  selectedDrop: PieceType | null
  winner: Side | null
  mode: Mode
  aiSide: Side
  onHandClick: (t: PieceType) => void
}) {
  const { types, counts, side, turn, selectedDrop, winner, mode, aiSide, onHandClick } = props
  return (
    <div className="shogi-hand-pieces">
      {counts.size === 0 && <span className="shogi-hand-empty">暂无持子</span>}
      {types.map((type) => {
        const n = counts.get(type) ?? 0
        if (n === 0) return null
        const active = selectedDrop === type && turn === side
        return (
          <button
            key={type}
            type="button"
            className={`shogi-hand-piece shogi-hand-piece--${side} ${active ? 'active' : ''}`}
            disabled={winner !== null || turn !== side || (mode === 'ai' && turn === aiSide)}
            aria-pressed={active}
            aria-label={`${side === 'sente' ? '先手' : '后手'}持子${pieceChar({ id: '', side, type, promoted: false })}，${n}枚`}
            onClick={() => onHandClick(type)}
          >
            {pieceChar({ id: '', side, type, promoted: false })}
            {n > 1 ? <span className="shogi-hand-count">{n}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
