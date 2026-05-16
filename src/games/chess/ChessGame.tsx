import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { applyMove, createInitialBoard, initialMeta, snapshotBoard, snapshotMeta } from './chessBoard'
import type { Board, GameMeta, Move, Side } from './chessTypes'
import { pieceChar } from './chessTypes'
import {
  allLegalMovesChecked,
  findKing,
  inCheck,
  legalMovesFromChecked,
  pickAiMoveChess,
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

  const checkState = useMemo(() => {
    if (winner) return { showCheckOverlay: false, isCheckmate: false }
    if (!inCheck(board, turn)) return { showCheckOverlay: false, isCheckmate: false }
    const moves = allLegalMovesChecked(board, meta, turn)
    return { showCheckOverlay: true, isCheckmate: moves.length === 0 }
  }, [winner, board, meta, turn])

  const status = useMemo(() => {
    if (winner === 'draw') return '和棋（逼和）'
    if (winner) return `${winner === 'white' ? '白方' : '黑方'} 胜`
    if (mode === 'ai' && turn === aiSide) return '电脑思考中…'
    const sideLabel = turn === 'white' ? '白方' : '黑方'
    const chk = checkState.showCheckOverlay ? ' · 将军！' : ''
    return `${sideLabel} 行棋${chk}`
  }, [winner, mode, turn, aiSide, checkState.showCheckOverlay])

  useLayoutEffect(() => {
    if (winner || !checkState.isCheckmate) return
    setWinner(turn === 'white' ? 'black' : 'white')
  }, [winner, checkState.isCheckmate, turn])

  const reset = useCallback(() => {
    setBoard(createInitialBoard())
    setMeta(initialMeta())
    setTurn('white')
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
    setMeta(snapshotMeta(prev.meta))
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
          { board: snapshotBoard(board), meta: snapshotMeta(meta), turn, lastMove, winner, selected },
        ])
      }
      const { board: next, meta: nextMeta } = applyMove(board, meta, m)
      setLastMove(m)
      setBoard(next)
      setMeta(nextMeta)
      setSelected(null)
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
    if (winner || mode !== 'ai' || turn !== aiSide) return
    const t = window.setTimeout(() => {
      const { board: cur, meta: curMeta } = stateForAiRef.current
      const m = pickAiMoveChess(cur, curMeta, aiSide)
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
    }, 320)
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

  const w = PAD * 2 + CELL * 8
  const h = PAD * 2 + CELL * 8

  return (
    <div className="chess-wrap">
      <div className="chess-toolbar">
        <p className="chess-status">{status}</p>
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
      {mode === 'ai' && <p className="chess-hint">你执白棋在下方先手；电脑执黑。</p>}
      <div
        className="chess-board-outer"
        style={{ ['--ch-w' as string]: `${w}px`, ['--ch-h' as string]: `${h}px` } as CSSProperties}
      >
        <div
          className={`chess-board-surface${mode === 'local' ? ' chess-board-surface--dual' : ''}`}
          style={{ width: w, height: h }}
        >
          {checkState.showCheckOverlay && (
            <div className="chess-check-banner" role="status" aria-live="polite">
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
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    className={`chess-cell ${isSel ? 'selected' : ''} ${isTarget ? 'target' : ''} ${isLastFrom ? 'last-from' : ''} ${isLastTo ? 'last-to' : ''}`}
                    style={{ left: PAD + c * CELL, top: PAD + r * CELL, width: CELL, height: CELL }}
                    aria-label={`第 ${r + 1} 行第 ${c + 1} 列`}
                    onClick={() => onCellClick(r, c)}
                  />
                )
              }),
            )}
            {board.map((row, r) =>
              row.map((piece, c) =>
                piece ? (
                  <div
                    key={piece.id}
                    className={`chess-piece ${piece.side}`}
                    style={{
                      left: PAD + c * CELL + CELL / 2 - 20,
                      top: PAD + r * CELL + CELL / 2 - 20,
                    }}
                  >
                    {pieceChar(piece)}
                  </div>
                ) : null,
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
