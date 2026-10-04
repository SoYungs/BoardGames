import { GameResult } from '../../components/GameResult'
import { useEffect, useState, type CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ResponsiveBoard } from '../../components/ResponsiveBoard'
import { scheduleAiMove } from '../../workers/scheduleAiMove'
import { GOMOKU_SIZE, type Cell, emptyBoard, checkWin, isBoardFull } from './gomokuLogic'

type Mode = 'local' | 'ai'
type Snapshot = { board: Cell[][]; turn: 1 | 2; lastMove: { r: number; c: number } | null; winner: 0 | 1 | 2 | 'draw' }
type State = Snapshot & { history: Snapshot[] }
const initialState = (): State => ({ board: emptyBoard(), turn: 1, lastMove: null, winner: 0, history: [] })

function placeStone(state: State, r: number, c: number): State {
  if (state.winner || state.board[r][c] !== 0) return state
  const board = state.board.map(row => row.slice())
  board[r][c] = state.turn
  const winner = checkWin(board, r, c, state.turn) ? state.turn : isBoardFull(board) ? 'draw' : 0
  const { history, ...snapshot } = state
  return { board, turn: state.turn === 1 ? 2 : 1, lastMove: { r, c }, winner, history: [...history, snapshot] }
}

export function GomokuGame({ mode }: { mode: Mode }) {
  const [state, setState] = useState(initialState)
  const [aiError, setAiError] = useState(false)
  const { board, turn, winner, lastMove, history } = state
  useEffect(() => {
    if (mode !== 'ai' || winner || turn !== 2) return
    return scheduleAiMove('gomoku', { board, side: 2 }, move => {
      if (move) setState(current => current.turn === 2 && current.board === board ? placeStone(current, ...move) : current)
    }, 360, () => setAiError(true))
  }, [board, mode, turn, winner])

  const status = aiError ? '电脑计算遇到问题，请重新开始' : winner === 'draw' ? '满盘和棋' : winner ? `${winner === 1 ? '黑棋' : '白棋'} 获胜` : mode === 'ai' && turn === 2 ? '电脑思考中…' : `${turn === 1 ? '黑棋' : '白棋'} 落子`
  const reset = () => { setAiError(false); setState(initialState()) }
  const undo = () => setState(current => {
    if (mode !== 'local' || !current.history.length) return current
    return { ...current.history[current.history.length - 1], history: current.history.slice(0, -1) }
  })

  return (
    <div className="gomoku-wrap">
      <div className="gomoku-toolbar"><p className="gomoku-status" role="status" aria-live="polite" data-thinking={mode === 'ai' && turn === 2 && !winner && !aiError}>{status}</p><div className="gomoku-actions">{mode === 'local' && <button type="button" className="gomoku-undo" onClick={undo} disabled={!history.length}>悔棋</button>}<button type="button" className="gomoku-reset" onClick={reset}>重新开始</button></div></div>
      <GameResult result={winner ? status : null} onRestart={reset} />
      <p className="gomoku-hint">{mode === 'ai' ? '你执黑棋先手 · 电脑执白棋' : '黑棋先手 · 轮流落子'}<span className="move-count">第 {history.length + (winner ? 0 : 1)} 手</span></p>
      <ResponsiveBoard width={510} height={510}>
        <div className="gomoku-board" style={{ '--cell': '32px', '--size': GOMOKU_SIZE } as CSSProperties} role="group" aria-label="五子棋棋盘">
          {board.map((row, r) => row.map((cell, c) => <button key={`${r}-${c}`} type="button" className={`gomoku-cell ${lastMove?.r === r && lastMove.c === c ? 'last-move' : ''}`} aria-label={`${r + 1} 行 ${c + 1} 列，${cell ? cell === 1 ? '黑棋' : '白棋' : '空位'}`} disabled={cell !== 0 || !!winner || (mode === 'ai' && turn === 2)} onClick={() => setState(current => (mode === 'ai' && current.turn === 2) ? current : placeStone(current, r, c))}>
            {[3, 7, 11].includes(r) && [3, 7, 11].includes(c) && <span className="gomoku-star" />}
            <AnimatePresence>{cell !== 0 && <motion.span className={`gomoku-stone ${cell === 1 ? 'black' : 'white'}`} initial={{ scale: .5, opacity: 0, y: -5 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: .6, opacity: 0 }} transition={{ type: 'spring', stiffness: 450, damping: 25 }} />}</AnimatePresence>
          </button>))}
        </div>
      </ResponsiveBoard>
    </div>
  )
}
