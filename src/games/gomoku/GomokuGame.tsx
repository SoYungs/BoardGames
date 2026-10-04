import { GameResult } from '../../components/GameResult'
import { GameStatus } from '../../components/GameStatus'
import { InteractionHint } from '../../components/InteractionHint'
import { BoardEffects } from '../../components/BoardEffects'
import { useEffect, useState, type CSSProperties } from 'react'
import { motion, AnimatePresence, useReducedMotion, useIsPresent } from 'framer-motion'
import { ResponsiveBoard } from '../../components/ResponsiveBoard'
import { scheduleAiMove } from '../../workers/scheduleAiMove'
import { GOMOKU_SIZE, type Cell, emptyBoard, checkWin, isBoardFull } from './gomokuLogic'
import '../../styles/stone-games.css'

type Mode = 'local' | 'ai'
type Snapshot = { board: Cell[][]; turn: 1 | 2; lastMove: { r: number; c: number } | null; winner: 0 | 1 | 2 | 'draw' }
type State = Snapshot & { history: Snapshot[]; effect: { r: number; c: number; key: number } | null; epoch: number }
const initialState = (epoch = 0): State => ({ board: emptyBoard(), turn: 1, lastMove: null, winner: 0, history: [], effect: null, epoch })

function placeStone(state: State, r: number, c: number): State {
  if (state.winner || state.board[r][c] !== 0) return state
  const board = state.board.map(row => row.slice())
  board[r][c] = state.turn
  const winner = checkWin(board, r, c, state.turn) ? state.turn : isBoardFull(board) ? 'draw' : 0
  const { history } = state
  const snapshot: Snapshot = { board: state.board, turn: state.turn, lastMove: state.lastMove, winner: state.winner }
  return { board, turn: state.turn === 1 ? 2 : 1, lastMove: { r, c }, winner, history: [...history, snapshot], effect: { r, c, key: history.length + 1 }, epoch: state.epoch }
}

export function GomokuGame({ mode }: { mode: Mode }) {
  const [state, setState] = useState(() => initialState())
  const [aiError, setAiError] = useState(false)
  const reduced = useReducedMotion()
  const { board, turn, winner, lastMove, history, effect, epoch } = state
  const thinking = mode === 'ai' && turn === 2 && !winner && !aiError
  const present = useIsPresent()
  useEffect(() => {
    if (!present || mode !== 'ai' || winner || turn !== 2) return
    return scheduleAiMove('gomoku', { board, side: 2 }, move => {
      if (move) setState(current => current.turn === 2 && current.board === board ? placeStone(current, ...move) : current)
    }, 140, () => setAiError(true))
  }, [present, board, mode, turn, winner])

  const status = aiError ? '电脑计算遇到问题，请重新开始' : winner === 'draw' ? '满盘和棋' : winner ? `${winner === 1 ? '黑棋' : '白棋'} 获胜` : mode === 'ai' && turn === 2 ? '电脑思考中…' : `${turn === 1 ? '黑棋' : '白棋'} 落子`
  const reset = () => { setAiError(false); setState(current => initialState(current.epoch + 1)) }
  const undo = () => setState(current => {
    if (mode !== 'local' || !current.history.length) return current
    return { ...current.history[current.history.length - 1], history: current.history.slice(0, -1), effect: null, epoch: current.epoch + 1 }
  })

  return (
    <div className="gomoku-wrap">
      <div className="gomoku-toolbar"><GameStatus status={status} thinking={thinking} sideTone={(winner === 1 || winner === 2 ? winner : turn) === 1 ? 'dark' : 'light'} sideLabel={winner ? '对局结果' : mode === 'ai' ? turn === 1 ? '你的回合' : '电脑回合' : '当前回合'} detail={mode === 'ai' ? '你执黑棋先手，电脑执白棋' : '黑棋先手，两人轮流落子'} /><div className="gomoku-actions">{mode === 'local' && <button type="button" className="gomoku-undo" onClick={undo} disabled={!history.length}>悔棋</button>}<button type="button" className="gomoku-reset" onClick={reset}>重开</button></div></div>
      <GameResult result={winner ? status : null} onRestart={reset} />
      <p className="gomoku-hint">15 × 15 棋盘<span className="move-count">第 {history.length + (winner ? 0 : 1)} 手</span></p>
      <InteractionHint steps={['找空点', '点击落子', '连成五子']} activeStep={winner ? 2 : thinking ? 1 : 0} note={thinking ? '电脑正在落子，稍等片刻。' : '横、竖或斜线，五颗同色棋子连在一起就赢。'} />
      <ResponsiveBoard width={510} height={510}>
        <div key={epoch} className="gomoku-board" style={{ '--cell': '32px', '--size': GOMOKU_SIZE } as CSSProperties} role="group" aria-label="五子棋棋盘">
          {board.map((row, r) => row.map((cell, c) => <button key={`${r}-${c}`} type="button" className={`gomoku-cell ${lastMove?.r === r && lastMove.c === c ? 'last-move' : ''}`} aria-label={`${r + 1} 行 ${c + 1} 列，${cell ? cell === 1 ? '黑棋' : '白棋' : '空位'}`} disabled={cell !== 0 || !!winner || (mode === 'ai' && turn === 2)} onClick={() => setState(current => (mode === 'ai' && current.turn === 2) ? current : placeStone(current, r, c))}>
            {[3, 7, 11].includes(r) && [3, 7, 11].includes(c) && <span className="gomoku-star" />}
            <AnimatePresence initial={false}>{cell !== 0 && <motion.span className={`gomoku-stone ${cell === 1 ? 'black' : 'white'}`} initial={reduced ? false : { scale: .75, opacity: 0, y: -12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: .7, opacity: 0 }} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 29, opacity: { duration: .12 } }} />}</AnimatePresence>
          </button>))}
          <BoardEffects width={510} height={510} to={effect ? { x: 30 + effect.c * 32, y: 30 + effect.r * 32 } : undefined} eventKey={effect?.key ?? ''} kind="place" />
        </div>
      </ResponsiveBoard>
    </div>
  )
}
