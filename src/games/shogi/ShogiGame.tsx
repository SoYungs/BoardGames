import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { applyShogiMove, createInitialBoard, emptyHand, snapshotBoard, snapshotHand } from './shogiBoard'
import type { Board, Hand, Move, PieceType, Side } from './shogiTypes'
import { COLS, ROWS, pieceChar } from './shogiTypes'
import {
  allLegalMovesChecked,
  inCheck,
  legalMovesFrom,
  legalMovesFromChecked,
  pickAiMoveShogi,
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

  const stateRef = useRef({ board, hand })
  useLayoutEffect(() => {
    stateRef.current = { board, hand }
  }, [board, hand])

  const humanSide: Side = 'sente'
  const aiSide: Side = 'gote'

  const targets = useMemo(() => {
    if (selectedDrop) {
      return allLegalMovesChecked(board, hand, turn).filter((m) => m.dropType === selectedDrop)
    }
    if (!selected) return [] as Move[]
    const [r, c] = selected
    const checked = legalMovesFromChecked(board, hand, r, c)
    if (checked.length > 0) return checked
    return legalMovesFrom(board, r, c)
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
    if (mode === 'ai' && turn === aiSide) return '电脑思考中…'
    const sideLabel = turn === 'sente' ? '先手' : '后手'
    const chk = checkState.showCheckOverlay ? ' · 王手！' : ''
    const sel =
      selected && !selectedDrop
        ? ` · 已选${9 - selected[1]}筋${selected[0] + 1}段，${targets.length} 步可走`
        : selectedDrop
          ? ` · 持子打入「${pieceChar({ id: '', side: turn, type: selectedDrop, promoted: false })}」`
          : ''
    return `${sideLabel} 行棋${chk}${sel}`
  }, [winner, mode, turn, aiSide, checkState.showCheckOverlay, selected, selectedDrop, targets.length])

  const reset = useCallback(() => {
    setBoard(createInitialBoard())
    setHand(emptyHand())
    setTurn('sente')
    setSelected(null)
    setSelectedDrop(null)
    setWinner(null)
    setLastMove(null)
    setHistory([])
  }, [])

  const undo = useCallback(() => {
    if (mode !== 'local' || history.length === 0) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setBoard(snapshotBoard(prev.board))
    setHand(snapshotHand(prev.hand))
    setTurn(prev.turn)
    setLastMove(prev.lastMove)
    setWinner(prev.winner)
    setSelected(prev.selected)
    setSelectedDrop(prev.selectedDrop)
  }, [mode, history])

  const tryMove = useCallback(
    (m: Move) => {
      const ok = targets.some(
        (x) =>
          x.toR === m.toR &&
          x.toC === m.toC &&
          (x.dropType ?? null) === (m.dropType ?? null) &&
          (x.fromR ?? null) === (m.fromR ?? null) &&
          (x.fromC ?? null) === (m.fromC ?? null),
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
      setLastMove(m)
      setBoard(next)
      setHand(nextHand)
      setSelected(null)
      setSelectedDrop(null)
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

  useEffect(() => {
    if (winner || mode !== 'ai' || turn !== aiSide) return
    const t = window.setTimeout(() => {
      const { board: cur, hand: curHand } = stateRef.current
      const m = pickAiMoveShogi(cur, curHand, aiSide)
      if (!m) {
        setWinner(humanSide)
        return
      }
      const { board: next, hand: nextHand } = applyShogiMove(cur, curHand, m, aiSide)
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
    }, 360)
    return () => window.clearTimeout(t)
  }, [winner, mode, turn, aiSide, humanSide])

  const boardPointToCell = (clientX: number, clientY: number, rect: DOMRect) => {
    const c = Math.round((clientX - rect.left - PAD) / CELL)
    const r = Math.round((clientY - rect.top - PAD) / CELL)
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null
    return [r, c] as [number, number]
  }

  const onCellClick = (r: number, c: number) => {
    if (winner) return
    if (mode === 'ai' && turn === aiSide) return
    const piece = board[r][c]
    if (selectedDrop) {
      const hit = targets.find((m) => m.toR === r && m.toC === c)
      if (hit) tryMove(hit)
      return
    }
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

  const onBoardPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const cell = boardPointToCell(e.clientX, e.clientY, rect)
    if (!cell) return
    onCellClick(cell[0], cell[1])
  }

  const onHandClick = (type: PieceType) => {
    if (winner || (mode === 'ai' && turn === aiSide)) return
    if (!hand[turn].includes(type)) return
    setSelected(null)
    setSelectedDrop(selectedDrop === type ? null : type)
  }

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
    <div className="shogi-wrap">
      <div className="shogi-toolbar">
        <p className="shogi-status">{status}</p>
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
      <p className="shogi-hint">
        {mode === 'ai'
          ? '你执先手（棋盘最下方一行）。点击己方棋子再点目标格；持子打入请先点下方「先手持子」。'
          : '本地双人：先手在下方。点击己方棋子选中，再点绿色高亮格走子。'}
      </p>
      {winner && (
        <p className="shogi-hint shogi-hint--warn">对局已结束，请点击「重新开始」。</p>
      )}
      {renderHand('gote', '后手持子')}
      <div
        className="shogi-board-outer"
        style={{ ['--sg-w' as string]: `${w}px`, ['--sg-h' as string]: `${h}px` } as CSSProperties}
      >
        <div
          className={`shogi-board-surface${mode === 'local' ? ' shogi-board-surface--dual' : ''}`}
          style={{ width: w, height: h }}
        >
          {checkState.showCheckOverlay && (
            <div className="shogi-check-banner" role="status" aria-live="polite">
              王手
            </div>
          )}
          <svg className="shogi-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="将棋棋盘">
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
          <div className="shogi-grid" style={{ width: w, height: h }} aria-hidden>
            {Array.from({ length: ROWS }, (_, r) =>
              Array.from({ length: COLS }, (_, c) => {
                const isSel = selected?.[0] === r && selected?.[1] === c
                const isTarget = targetSet.has(`${r},${c}`)
                const isLastFrom = lastMove?.fromR === r && lastMove?.fromC === c
                const isLastTo = lastMove?.toR === r && lastMove?.toC === c
                return (
                  <button
                    key={`hit-${r}-${c}`}
                    type="button"
                    tabIndex={-1}
                    className={`shogi-hit ${isSel ? 'selected' : ''} ${isTarget ? 'target' : ''} ${isLastFrom ? 'last-from' : ''} ${isLastTo ? 'last-to' : ''}`}
                    style={{
                      left: PAD + c * CELL - 20,
                      top: PAD + r * CELL - 20,
                    }}
                  />
                )
              }),
            )}
            {board.map((row, r) =>
              row.map((piece, c) =>
                piece ? (
                  <div
                    key={piece.id}
                    className={`shogi-piece ${piece.side}${piece.promoted ? ' promoted' : ''}`}
                    style={{
                      left: PAD + c * CELL - 20,
                      top: PAD + r * CELL - 20,
                    }}
                  >
                    {pieceChar(piece)}
                  </div>
                ) : null,
              ),
            )}
          </div>
          <div className="shogi-input-layer" onPointerDown={onBoardPointer} />
        </div>
      </div>
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
      {types.map((type) => {
        const n = counts.get(type) ?? 0
        if (n === 0) return null
        const active = selectedDrop === type && turn === side
        return (
          <button
            key={type}
            type="button"
            className={`shogi-hand-piece ${active ? 'active' : ''}`}
            disabled={winner !== null || turn !== side || (mode === 'ai' && turn === aiSide)}
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
