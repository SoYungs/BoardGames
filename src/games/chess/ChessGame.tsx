import { GameResult } from '../../components/GameResult'
import { GameStatus } from '../../components/GameStatus'
import { BoardEffects } from '../../components/BoardEffects'
import { InteractionHint } from '../../components/InteractionHint'
import { ChessPieceGlyph } from '../../components/ChessPieceGlyph'
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
import { applyMove, createInitialBoard, initialMeta, snapshotBoard, snapshotMeta } from './chessBoard'
import type { Board, GameMeta, Move, Side } from './chessTypes'
import { PIECE_NAMES, PROMOTION_PIECES } from './chessTypes'
import {
  allLegalMovesChecked,
  findKing,
  inCheck,
  legalMovesFromChecked,
} from './chessMoves'

type Mode = 'local' | 'ai'

const CELL = 48
const PAD = 24

type ChessSnap = {
  board: Board
  meta: GameMeta
  turn: Side
  lastMove: Move | null
  winner: Side | 'draw' | null
  selected: [number, number] | null
}

export function ChessGame({ mode }: { mode: Mode }) {
  const [board, setBoard] = useState<Board>(() => createInitialBoard())
  const [meta, setMeta] = useState<GameMeta>(() => initialMeta())
  const [turn, setTurn] = useState<Side>('white')
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [winner, setWinner] = useState<Side | 'draw' | null>(null)
  const [lastMove, setLastMove] = useState<Move | null>(null)
  const [history, setHistory] = useState<ChessSnap[]>([])
  const [pendingPromotion, setPendingPromotion] = useState<Move | null>(null)
  const [aiError, setAiError] = useState(false)
  const [moveEffect, setMoveEffect] = useState<{ move: Move; eventKey: number; kind: 'move' | 'capture' | 'place' } | null>(null)
  const [boardEpoch, setBoardEpoch] = useState(0)
  const effectSequence = useRef(0)
  const gameRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([])
  const promotionFocus = useRef<[number, number] | null>(null)
  const reduceMotion = useReducedMotion()

  useLayoutEffect(() => {
    if (pendingPromotion || !promotionFocus.current) return
    const [r, c] = promotionFocus.current
    promotionFocus.current = null
    const cell = cellRefs.current[r * 8 + c]
    const target = cell?.disabled ? gameRef.current?.querySelector<HTMLElement>('.game-status-copy') : cell
    target?.focus({ preventScroll: true })
  }, [pendingPromotion])

  const stateForAiRef = useRef({ board, meta })
  useLayoutEffect(() => {
    stateForAiRef.current = { board, meta }
  }, [board, meta])

  const humanSide: Side = 'white'
  const aiSide: Side = 'black'

  const targets = useMemo(() => {
    if (!selected) return [] as Move[]
    const [r, c] = selected
    return legalMovesFromChecked(board, meta, r, c)
  }, [board, meta, selected])

  const isCheck = useMemo(() => !winner && inCheck(board, turn), [winner, board, turn])

  const status = useMemo(() => {
    if (aiError) return '电脑计算遇到问题，请重新开始'
    if (winner === 'draw') return '和棋（逼和）'
    if (winner) return `${winner === 'white' ? '白方' : '黑方'} 胜`
    if (pendingPromotion) return '请选择兵的升变棋子'
    if (mode === 'ai' && turn === aiSide) return '电脑思考中…'
    const sideLabel = turn === 'white' ? '白方' : '黑方'
    const chk = isCheck ? ' · 将军！' : ''
    return `${sideLabel} 行棋${chk}`
  }, [winner, mode, turn, aiSide, isCheck, pendingPromotion, aiError])

  const reset = useCallback(() => {
    promotionFocus.current = null
    setBoard(createInitialBoard())
    setMeta(initialMeta())
    setTurn('white')
    setSelected(null)
    setWinner(null)
    setLastMove(null)
    setHistory([])
    setPendingPromotion(null)
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
    setMeta(snapshotMeta(prev.meta))
    setTurn(prev.turn)
    setLastMove(prev.lastMove)
    setWinner(prev.winner)
    setSelected(prev.selected)
    setPendingPromotion(null)
    setMoveEffect(null)
    setBoardEpoch(epoch => epoch + 1)
  }, [mode, history])

  const tryMove = useCallback(
    (m: Move) => {
      if (mode === 'local') {
        setHistory((h) => [
          ...h,
          { board: snapshotBoard(board), meta: snapshotMeta(meta), turn, lastMove, winner, selected },
        ])
      }
      const { board: next, meta: nextMeta } = applyMove(board, meta, m)
      setMoveEffect({ move: m, eventKey: ++effectSequence.current, kind: next.flat().filter(Boolean).length < board.flat().filter(Boolean).length ? 'capture' : 'move' })
      setLastMove(m)
      setBoard(next)
      setMeta(nextMeta)
      setSelected(null)
      setPendingPromotion(null)
      const opp: Side = turn === 'white' ? 'black' : 'white'
      if (!findKing(next, opp)) {
        setWinner(turn)
        return
      }
      const movesNext = allLegalMovesChecked(next, nextMeta, opp)
      if (movesNext.length === 0) {
        setWinner(inCheck(next, opp) ? turn : 'draw')
        return
      }
      setTurn(opp)
    },
    [board, meta, turn, mode, lastMove, winner, selected],
  )

  const present = useIsPresent()
  useEffect(() => {
    if (!present || winner || aiError || mode !== 'ai' || turn !== aiSide) return
    const { board: cur, meta: curMeta } = stateForAiRef.current
    return scheduleAiMove('chess', { board: cur, meta: curMeta, side: aiSide }, (m) => {
      if (!m) {
        setWinner(inCheck(cur, aiSide) ? humanSide : 'draw')
        return
      }
      const { board: next, meta: nextMeta } = applyMove(cur, curMeta, m)
      setMoveEffect({ move: m, eventKey: ++effectSequence.current, kind: next.flat().filter(Boolean).length < cur.flat().filter(Boolean).length ? 'capture' : 'move' })
      setLastMove(m)
      setBoard(next)
      setMeta(nextMeta)
      if (!findKing(next, 'white')) {
        setWinner(aiSide)
        return
      }
      const whiteMoves = allLegalMovesChecked(next, nextMeta, 'white')
      if (whiteMoves.length === 0) {
        setWinner(inCheck(next, 'white') ? aiSide : 'draw')
        return
      }
      setTurn('white')
    }, 140, () => setAiError(true))
  }, [present, winner, aiError, mode, turn, aiSide, humanSide])

  const onCellClick = (r: number, c: number) => {
    if (winner || pendingPromotion) return
    if (mode === 'ai' && turn === aiSide) return
    const piece = board[r][c]
    if (selected) {
      const hit = targets.find((m) => m.toR === r && m.toC === c)
      if (hit) {
        if (hit.promotion) {
          setPendingPromotion(hit)
          return
        }
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

  const cancelPromotion = () => {
    if (!pendingPromotion) return
    promotionFocus.current = [pendingPromotion.fromR, pendingPromotion.fromC]
    setPendingPromotion(null)
  }

  const confirmPromotion = (move: Move) => {
    promotionFocus.current = [move.toR, move.toC]
    tryMove(move)
  }

  const thinking = mode === 'ai' && turn === aiSide && !winner && !aiError
  const selectedPiece = selected ? board[selected[0]][selected[1]] : null
  const targetCount = new Set(targets.map(move => `${move.toR},${move.toC}`)).size
  const detail = aiError ? '请点击重新开始，恢复对局' : pendingPromotion ? '选择新的棋子，确认后兵会走到该格'
    : selectedPiece ? `已选${PIECE_NAMES[selectedPiece.type]} · ${targetCount ? `${targetCount} 个落点可走` : '暂无合法走法，换一枚棋子'}`
      : winner ? '本局结束，可重新开始' : thinking ? '正在寻找下一步，你可以先观察棋盘' : '先选自己的棋子，再点击标记的落点'

  const w = PAD * 2 + CELL * 8
  const h = PAD * 2 + CELL * 8

  return (
    <div className="chess-wrap moving-game" ref={gameRef}>
      <div className="chess-toolbar">
        <GameStatus status={status} thinking={thinking} sideLabel={turn === 'white' ? '白方' : '黑方'} sideTone={turn === 'white' ? 'light' : 'dark'} detail={detail} />
        <div className="chess-actions">
          {mode === 'local' && (
            <button type="button" className="chess-undo" onClick={undo} disabled={history.length === 0}>
              悔棋
            </button>
          )}
          <button type="button" className="chess-reset" onClick={reset}>
            重新开始
          </button>
        </div>
      </div>
      <GameResult result={winner ? status : null} onRestart={reset} />
      <InteractionHint steps={['选己方子', '查看落点', '点击走子']} activeStep={pendingPromotion ? 2 : selected ? 1 : 0} note={winner ? '本局结束。可重新开始，或在双人模式悔棋复盘。' : isCheck ? '正在被将军：先保护你的王。' : mode === 'ai' ? '你执白方先手；棋盘上的绿点可走，金圈可吃。' : '绿点可走，金圈可吃；双方轮流操作。'} />
      {pendingPromotion && (
        <div
          className="chess-promotion"
          role="dialog"
          aria-labelledby="chess-promotion-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelPromotion()
            }
          }}
        >
          <p id="chess-promotion-title">选择升变棋子</p>
          <div className="chess-promotion-options">
            {PROMOTION_PIECES.map((type) => (
              <button
                key={type}
                type="button"
                className="chess-promotion-option"
                autoFocus={type === 'q'}
                aria-label={`升变为${PIECE_NAMES[type]}`}
                onClick={() => confirmPromotion({ ...pendingPromotion, promotion: type })}
              >
                <span className="chess-promotion-symbol" aria-hidden="true"><ChessPieceGlyph type={type} side={turn} /></span>
                <span>{PIECE_NAMES[type]}</span>
              </button>
            ))}
          </div>
          <button type="button" className="chess-promotion-cancel" onClick={cancelPromotion}>取消</button>
        </div>
      )}
      <ResponsiveBoard width={w + 22} height={h + 22}>
      <div
        className="chess-board-outer"
        style={{ ['--ch-w' as string]: `${w}px`, ['--ch-h' as string]: `${h}px` } as CSSProperties}
      >
        <div
          className={`chess-board-surface${mode === 'local' ? ' chess-board-surface--dual' : ''}`}
          style={{ width: w, height: h }}
        >
          {isCheck && (
            <div className="chess-check-banner" role="status" aria-live="polite" data-thinking={mode === 'ai' && turn === aiSide && !winner && !aiError}>
              将军
            </div>
          )}
          <BoardEffects key={boardEpoch} width={w} height={h} eventKey={moveEffect?.eventKey ?? ''} from={moveEffect ? { x: PAD + (moveEffect.move.fromC + .5) * CELL, y: PAD + (moveEffect.move.fromR + .5) * CELL } : undefined} to={moveEffect ? { x: PAD + (moveEffect.move.toC + .5) * CELL, y: PAD + (moveEffect.move.toR + .5) * CELL } : undefined} kind={moveEffect?.kind} />
          <svg className="chess-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="国际象棋棋盘">
            {Array.from({ length: 8 }, (_, r) =>
              Array.from({ length: 8 }, (_, c) => {
                const light = (r + c) % 2 === 0
                return (
                  <rect
                    key={`sq-${r}-${c}`}
                    x={PAD + c * CELL}
                    y={PAD + r * CELL}
                    width={CELL}
                    height={CELL}
                    className={light ? 'chess-sq-light' : 'chess-sq-dark'}
                  />
                )
              }),
            )}
          </svg>
          <div className="chess-grid" style={{ width: w, height: h }}>
            {Array.from({ length: 8 }, (_, r) =>
              Array.from({ length: 8 }, (_, c) => {
                const isSel = selected?.[0] === r && selected?.[1] === c
                const targetMove = targets.find((m) => m.toR === r && m.toC === c)
                const isTarget = !!targetMove
                const isCapture = isTarget && (!!board[r][c] || (selectedPiece?.type === 'p' && targetMove.fromC !== c))
                const isLastFrom = lastMove?.fromR === r && lastMove?.fromC === c
                const isLastTo = lastMove?.toR === r && lastMove?.toC === c
                const piece = board[r][c]
                const label = piece ? `${piece.side === 'white' ? '白方' : '黑方'}${PIECE_NAMES[piece.type]}` : '空位'
                return (
                  <button
                    key={`${r}-${c}`}
                    ref={(cell) => { cellRefs.current[r * 8 + c] = cell }}
                    type="button"
                    className={`chess-cell ${isSel ? 'selected' : ''} ${isTarget ? 'target' : ''} ${isCapture ? 'capture-target' : ''} ${isLastFrom ? 'last-from' : ''} ${isLastTo ? 'last-to' : ''}`}
                    style={{ left: PAD + c * CELL, top: PAD + r * CELL, width: CELL, height: CELL }}
                    aria-label={`${String.fromCharCode(97 + c)}${8 - r}，${label}${isTarget ? isCapture ? '，可吃子' : '，可走空位' : ''}`}
                    aria-pressed={isSel}
                    disabled={!!winner || !!pendingPromotion || thinking}
                    onClick={() => onCellClick(r, c)}
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
                    className={`moving-piece ${lastMove?.toR === r && lastMove?.toC === c ? 'moving-piece--last' : ''}`}
                    style={{ width: 40, height: 40 }}
                    initial={reduceMotion ? false : { x: PAD + c * CELL + CELL / 2 - 20, y: PAD + r * CELL + CELL / 2 - 20, opacity: 0, scale: .72 }}
                    animate={{ x: PAD + c * CELL + CELL / 2 - 20, y: PAD + r * CELL + CELL / 2 - 20, opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: .55 }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 31, mass: .85 }}
                    aria-hidden="true"
                  >
                    <div className={`chess-piece ${piece.side}`} style={{ left: 0, top: 0 }}>
                    <ChessPieceGlyph type={piece.type} side={piece.side} />
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
