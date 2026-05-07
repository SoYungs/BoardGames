import { useCallback, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GOMOKU_SIZE,
  type Cell,
  emptyBoard,
  checkWin,
  pickAiMove,
} from './gomokuLogic'

type Mode = 'local' | 'ai'

const labels: Record<Cell, string> = { 0: '', 1: '黑子', 2: '白子' }

type GomokuSnap = {
  board: Cell[][]
  turn: 1 | 2
  lastMove: { r: number; c: number } | null
  winner: 0 | 1 | 2
}

function cloneGomokuBoard(b: Cell[][]): Cell[][] {
  return b.map((row) => row.slice()) as Cell[][]
}

export function GomokuGame({ mode }: { mode: Mode }) {
  const [board, setBoard] = useState<Cell[][]>(() => emptyBoard())
  const [turn, setTurn] = useState<1 | 2>(1)
  const [winner, setWinner] = useState<0 | 1 | 2>(0)
  const [lastMove, setLastMove] = useState<{ r: number; c: number } | null>(null)
  const [history, setHistory] = useState<GomokuSnap[]>([])
  const aiPlayer: 1 | 2 = 2

  const status = useMemo(() => {
    if (winner) return `${labels[winner]} 获胜`
    if (mode === 'ai' && turn === aiPlayer) return '电脑思考中…'
    return `${labels[turn]} 下`
  }, [winner, turn, mode, aiPlayer])

  const reset = useCallback(() => {
    setBoard(emptyBoard())
    setTurn(1)
    setWinner(0)
    setLastMove(null)
    setHistory([])
  }, [])

  const undo = useCallback(() => {
    if (mode !== 'local' || history.length === 0) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setBoard(cloneGomokuBoard(prev.board))
    setTurn(prev.turn)
    setLastMove(prev.lastMove)
    setWinner(prev.winner)
  }, [mode, history])

  const playAt = useCallback(
    (r: number, c: number) => {
      if (winner || board[r][c] !== 0) return
      if (mode === 'ai' && turn === aiPlayer) return

      if (mode === 'local') {
        setHistory((h) => [
          ...h,
          {
            board: cloneGomokuBoard(board),
            turn,
            lastMove,
            winner,
          },
        ])
      }

      const next = board.map((row) => row.slice()) as Cell[][]
      next[r][c] = turn
      const w = checkWin(next, r, c, turn) ? turn : 0
      setLastMove({ r, c })
      setBoard(next)
      if (w) {
        setWinner(w)
        return
      }
      const nextTurn = turn === 1 ? 2 : 1
      setTurn(nextTurn)

      if (mode === 'ai' && nextTurn === aiPlayer && !w) {
        window.setTimeout(() => {
          setBoard((cur) => {
            const copy = cur.map((row) => row.slice()) as Cell[][]
            const [ar, ac] = pickAiMove(copy, aiPlayer)
            if (copy[ar][ac] !== 0) return cur
            copy[ar][ac] = aiPlayer
            setLastMove({ r: ar, c: ac })
            if (checkWin(copy, ar, ac, aiPlayer)) {
              setWinner(aiPlayer)
            } else {
              setTurn(1)
            }
            return copy
          })
        }, 280)
      }
    },
    [board, turn, winner, mode, aiPlayer, lastMove],
  )

  const cellSize = `min(calc((100vw - 48px) / ${GOMOKU_SIZE}), 28px)`

  return (
    <div className="gomoku-wrap">
      <div className="gomoku-toolbar">
        <p className="gomoku-status">{status}</p>
        <div className="gomoku-actions">
          {mode === 'local' && (
            <button
              type="button"
              className="gomoku-undo"
              onClick={undo}
              disabled={history.length === 0}
            >
              悔棋
            </button>
          )}
          <button type="button" className="gomoku-reset" onClick={reset}>
            重新开始
          </button>
        </div>
      </div>
      {mode === 'ai' && (
        <p className="gomoku-hint">你是黑棋先手；电脑执白棋。</p>
      )}
      <div
        className="gomoku-board"
        style={
          {
            '--cell': cellSize,
            '--size': GOMOKU_SIZE,
          } as React.CSSProperties
        }
      >
        {board.map((row, r) =>
          row.map((cell, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              className={`gomoku-cell ${lastMove?.r === r && lastMove?.c === c ? 'last-move' : ''}`}
              aria-label={`${r + 1} 行 ${c + 1} 列`}
              disabled={cell !== 0 || winner !== 0 || (mode === 'ai' && turn === aiPlayer)}
              onClick={() => playAt(r, c)}
            >
              <AnimatePresence>
                {cell !== 0 && (
                  <motion.span
                    className={`gomoku-stone ${cell === 1 ? 'black' : 'white'}`}
                    initial={{ scale: 0.35, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.2, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 28 }}
                  />
                )}
              </AnimatePresence>
            </button>
          )),
        )}
      </div>
    </div>
  )
}
