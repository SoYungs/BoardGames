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
import { applyMove, createInitialBoard, initialMeta, snapshotBoard, snapshotMeta } from './chessBoard'
import type { Board, GameMeta, Move, Side } from './chessTypes'
import { PIECE_NAMES, PROMOTION_PIECES, pieceChar } from './chessTypes'
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
    setBoard(createInitialBoard())
    setMeta(initialMeta())
    setTurn('white')
    setSelected(null)
    setWinner(null)
    setLastMove(null)
    setHistory([])
    setPendingPromotion(null)
    setAiError(false)
  }, [])

  const undo = useCallback(() => {
    if (mode !== 'local' || history.length === 0) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setBoard(snapshotBoard(prev.board))
    setMeta(snapshotMeta(prev.meta))
    setTurn(prev.turn)
    setLastMove(prev.lastMove)
    setWinner(prev.winner)
    setSelected(prev.selected)
    setPendingPromotion(null)
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

  useEffect(() => {
    if (winner || aiError || mode !== 'ai' || turn !== aiSide) return
    const { board: cur, meta: curMeta } = stateForAiRef.current
    return scheduleAiMove('chess', { board: cur, meta: curMeta, side: aiSide }, (m) => {
      if (!m) {
        setWinner(inCheck(cur, aiSide) ? humanSide : 'draw')
        return
      }
      const { board: next, meta: nextMeta } = applyMove(cur, curMeta, m)
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
    }, 320, () => setAiError(true))
  }, [winner, aiError, mode, turn, aiSide, humanSide])

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

  const w = PAD * 2 + CELL * 8
  const h = PAD * 2 + CELL * 8

  return (
    <div className="chess-wrap">
      <div className="chess-toolbar">
        <p className="chess-status" role="status" aria-live="polite" data-thinking={mode === 'ai' && turn === aiSide && !winner && !aiError}>{status}</p>
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
      {mode === 'ai' && <p className="chess-hint">你执白棋在下方先手；电脑执黑。</p>}
      {pendingPromotion && (
        <div
          className="chess-promotion"
          role="dialog"
          aria-labelledby="chess-promotion-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setPendingPromotion(null)
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
                onClick={() => tryMove({ ...pendingPromotion, promotion: type })}
              >
                <span className="chess-promotion-symbol" aria-hidden="true">{pieceChar({ id: '', side: turn, type })}</span>
                <span>{PIECE_NAMES[type]}</span>
              </button>
            ))}
          </div>
          <button type="button" className="chess-promotion-cancel" onClick={() => setPendingPromotion(null)}>取消</button>
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
                const isTarget = targets.some((m) => m.toR === r && m.toC === c)
                const isLastFrom = lastMove?.fromR === r && lastMove?.fromC === c
                const isLastTo = lastMove?.toR === r && lastMove?.toC === c
                const piece = board[r][c]
                const label = piece ? `${piece.side === 'white' ? '白方' : '黑方'}${PIECE_NAMES[piece.type]}` : '空位'
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    className={`chess-cell ${isSel ? 'selected' : ''} ${isTarget ? 'target' : ''} ${isLastFrom ? 'last-from' : ''} ${isLastTo ? 'last-to' : ''}`}
                    style={{ left: PAD + c * CELL, top: PAD + r * CELL, width: CELL, height: CELL }}
                    aria-label={`${String.fromCharCode(97 + c)}${8 - r}，${label}${isTarget ? '，合法目标' : ''}`}
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
                    animate={{ x: PAD + c * CELL + CELL / 2 - 20, y: PAD + r * CELL + CELL / 2 - 20, opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.45 }}
                    transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                    aria-hidden="true"
                  >
                    <div className={`chess-piece ${piece.side}`} style={{ left: 0, top: 0 }}>
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
