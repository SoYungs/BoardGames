import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion, useIsPresent } from 'framer-motion'
import { GameResult } from '../../components/GameResult'
import { GameStatus } from '../../components/GameStatus'
import { InteractionHint } from '../../components/InteractionHint'
import { BoardEffects } from '../../components/BoardEffects'
import { ResponsiveBoard } from '../../components/ResponsiveBoard'
import { scheduleAiMove } from '../../workers/scheduleAiMove'
import { createGoPosition, getGoGroup, goPointKey, playGoMove } from './goLogic'
import { GO_SIZE, goSideName, otherGoSide } from './goTypes'
import type { GoMove, GoMoveError, GoPoint, GoPosition, GoSide } from './goTypes'
import './go.css'
import '../../styles/stone-games.css'

type Mode = 'local' | 'ai'
type State = { position: GoPosition; history: GoPosition[]; captured: GoPoint[]; effect: GoPoint | null; effectKey: number; epoch: number }
const initialState = (epoch = 0): State => ({ position: createGoPosition(), history: [], captured: [], effect: null, effectKey: 0, epoch })
const CELL = 44
const PAD = 30
const BOARD_WIDTH = PAD * 2 + CELL * (GO_SIZE - 1)
const COLUMNS = 'ABCDEFGHJ'
const ERROR_TEXT: Record<GoMoveError, string> = {
  finished: '对局已经结束，可以重开或在双人模式悔棋。', outside: '请在棋盘交叉点落子。',
  occupied: '这里已有棋子，请选择空交叉点。', suicide: '这里会让新棋子没气，请换个空点。',
  ko: '这里不能马上提回来，请先在别处落子或停一手。',
}

export function GoGame({ mode }: { mode: Mode }) {
  const [state, setState] = useState(() => initialState())
  const [aiError, setAiError] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null)
  const [selected, setSelected] = useState<GoPoint | null>(null)
  const [focusIndex, setFocusIndex] = useState(40)
  const cells = useRef<(HTMLButtonElement | null)[]>([])
  const reduceMotion = useReducedMotion()
  const { position, history, captured, effect, effectKey, epoch } = state
  const { board, turn, result, lastMove, consecutivePasses } = position
  const thinking = mode === 'ai' && turn === 2 && !result && !aiError

  const present = useIsPresent()
  useEffect(() => {
    if (!present || mode !== 'ai' || position.result || position.turn !== 2) return
    return scheduleAiMove('go', { position, side: 2, budgetMs: 650 }, (move: GoMove | null) => {
      const played = playGoMove(position, move ?? { type: 'pass' })
      if (!played.ok) {
        setAiError(true)
        return
      }
      setState((current) => current.position === position
        ? { position: played.position, history: [...current.history, position], captured: played.captured, effect: played.position.lastMove?.type === 'place' ? played.position.lastMove : null, effectKey: current.effectKey + 1, epoch: current.epoch }
        : current)
      setSelected(null)
      setFeedback(null)
    }, 140, () => setAiError(true))
  }, [present, mode, position])

  const selectedGroup = useMemo(() => selected ? getGoGroup(board, selected.r, selected.c) : null, [board, selected])
  const groupSet = useMemo(() => new Set(selectedGroup?.stones.map(goPointKey) ?? []), [selectedGroup])
  const libertySet = useMemo(() => new Set(selectedGroup?.liberties.map(goPointKey) ?? []), [selectedGroup])
  const resultLabel = result
    ? result.reason === 'resign'
      ? `${goSideName(otherGoSide(result.winner))}认输 · ${goSideName(result.winner)}胜`
      : `${goSideName(result.winner)}胜 ${result.margin} 目`
    : null
  const status = resultLabel ?? (aiError ? '电脑计算遇到问题，请重新开始'
    : thinking ? '电脑思考中…'
      : `${goSideName(turn)}行棋${consecutivePasses ? ' · 对方已停一手' : ''}${captured.length ? ` · 上一步提走 ${captured.length} 子` : ''}`)

  function reset() {
    setState(current => initialState(current.epoch + 1))
    setAiError(false)
    setSelected(null)
    setFeedback(null)
    setFocusIndex(40)
  }

  function commit(move: GoMove) {
    if (result || (mode === 'ai' && turn === 2 && move.type !== 'resign')) return
    const played = playGoMove(position, move)
    if (!played.ok) {
      setFeedback({ text: ERROR_TEXT[played.reason], error: true })
      return
    }
    setState({ position: played.position, history: [...history, position], captured: played.captured, effect: move.type === 'place' ? move : null, effectKey: effectKey + 1, epoch })
    setSelected(null)
    setFeedback(null)
  }

  function onPoint(r: number, c: number) {
    if (board[r][c]) {
      const group = getGoGroup(board, r, c)!
      const same = selected?.r === r && selected.c === c
      setSelected(same ? null : { r, c })
      setFeedback(same ? null : { text: `${goSideName(group.side)}这一块有 ${group.stones.length} 子、${group.liberties.length} 口气。${group.liberties.length === 1 ? '正在被打吃。' : ''}`, error: false })
      return
    }
    commit({ type: 'place', r, c })
  }

  function undo() {
    if (mode !== 'local' || history.length === 0) return
    setState({ position: history[history.length - 1], history: history.slice(0, -1), captured: [], effect: null, effectKey: effectKey + 1, epoch: epoch + 1 })
    setSelected(null)
    setFeedback(null)
  }

  function onBoardKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    if (event.key === 'ArrowUp') next = index >= GO_SIZE ? index - GO_SIZE : index
    else if (event.key === 'ArrowDown') next = index < GO_SIZE * (GO_SIZE - 1) ? index + GO_SIZE : index
    else if (event.key === 'ArrowLeft') next = index % GO_SIZE === 0 ? index : index - 1
    else if (event.key === 'ArrowRight') next = index % GO_SIZE === GO_SIZE - 1 ? index : index + 1
    else if (event.key === 'Home') next = index - index % GO_SIZE
    else if (event.key === 'End') next = index - index % GO_SIZE + GO_SIZE - 1
    else if (event.key === 'Escape') { setSelected(null); setFeedback(null); return }
    else return
    event.preventDefault()
    setFocusIndex(next)
    cells.current[next]?.focus()
  }

  const renderPlayer = (side: GoSide) => (
    <div className={`go-player ${turn === side && !result ? 'go-player--active' : ''}`}>
      <span className={`go-player-stone go-player-stone--${side}`} aria-hidden="true" />
      <div><strong>{goSideName(side)}</strong><span>{mode === 'ai' ? side === 1 ? '你 · 先手' : '电脑 · 贴 6.5 目' : side === 1 ? '先手' : '贴 6.5 目'}</span></div>
      <span className="go-captures">提子 <b>{position.captures[side === 1 ? 'black' : 'white']}</b></span>
    </div>
  )

  return (
    <div className="go-wrap">
      <div className="go-toolbar">
        <GameStatus status={feedback?.text ?? status} thinking={thinking} sideTone={(result?.winner ?? selectedGroup?.side ?? turn) === 1 ? 'dark' : 'light'} sideLabel={result ? '对局结果' : selectedGroup ? '棋块信息' : mode === 'ai' ? turn === 1 ? '你的回合' : '电脑回合' : '当前回合'} detail={selectedGroup ? `深绿框是这一块棋 · 绿点是它的 ${selectedGroup.liberties.length} 口气` : '点空交叉点落子，点已有棋子查看它的气'} />
        <div className="go-actions">
          {mode === 'local' && <button type="button" onClick={undo} disabled={!history.length}>悔棋</button>}
          <button type="button" onClick={reset}>重新开始</button>
        </div>
      </div>
      <GameResult result={resultLabel} onRestart={reset} />
      <div className="go-players">{renderPlayer(1)}{renderPlayer(2)}</div>
      <InteractionHint steps={['空点落子', '点子看气', '停手计分']} activeStep={result ? 2 : selectedGroup ? 1 : 0} note={selectedGroup ? '气就是相邻的空点。深绿框围住同一块棋，绿点标出它的气。' : '棋子的气被围尽就会被提走。先实际提走死子，再停一手结束。'} />
      <div className="go-board-heading"><span>9 路快速对局</span><span>第 {position.moveNumber + (result ? 0 : 1)} 手</span></div>
      <ResponsiveBoard width={BOARD_WIDTH + 26} height={BOARD_WIDTH + 26}>
        <div key={epoch} className="go-board-outer">
          <div className="go-board-surface" style={{ width: BOARD_WIDTH, height: BOARD_WIDTH }} role="group" aria-label="9 路围棋棋盘，用方向键选择交叉点，回车落子">
            <svg className="go-board-lines" width={BOARD_WIDTH} height={BOARD_WIDTH} viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_WIDTH}`} aria-hidden="true">
              {Array.from({ length: GO_SIZE }, (_, i) => <g key={i}>
                <line x1={PAD} y1={PAD + i * CELL} x2={PAD + (GO_SIZE - 1) * CELL} y2={PAD + i * CELL} />
                <line x1={PAD + i * CELL} y1={PAD} x2={PAD + i * CELL} y2={PAD + (GO_SIZE - 1) * CELL} />
                <text x={PAD + i * CELL} y={16} textAnchor="middle">{COLUMNS[i]}</text>
                <text x={12} y={PAD + i * CELL + 4} textAnchor="middle">{GO_SIZE - i}</text>
              </g>)}
              {[{ r: 2, c: 2 }, { r: 2, c: 6 }, { r: 4, c: 4 }, { r: 6, c: 2 }, { r: 6, c: 6 }].map((point) => <circle key={goPointKey(point)} cx={PAD + point.c * CELL} cy={PAD + point.r * CELL} r={3} />)}
            </svg>
            {board.flatMap((row, r) => row.map((cell, c) => {
              const index = r * GO_SIZE + c
              const last = lastMove?.type === 'place' && lastMove.r === r && lastMove.c === c
              const owner = result?.score?.ownership[r][c]
              const label = cell ? goSideName(cell) : owner ? `${goSideName(owner)}围空` : '空位'
              return <button key={index} ref={(element) => { cells.current[index] = element }} type="button"
                className={`go-point ${groupSet.has(index) ? 'go-point--selected' : ''}`}
                style={{ left: PAD + c * CELL - CELL / 2, top: PAD + r * CELL - CELL / 2, width: CELL, height: CELL }}
                tabIndex={focusIndex === index ? 0 : -1} aria-label={`${COLUMNS[c]}${GO_SIZE - r}，${label}${last ? '，上一步' : ''}${libertySet.has(index) ? '，选中棋块的气' : ''}`}
                aria-pressed={groupSet.has(index)} disabled={!!result || (mode === 'ai' && turn === 2)}
                onClick={() => onPoint(r, c)} onFocus={() => setFocusIndex(index)} onKeyDown={(event) => onBoardKey(event, index)}>
                <AnimatePresence initial={false}>
                  {cell !== 0 && <motion.span key={cell} className={`go-stone go-stone--${cell}`} aria-hidden="true"
                    initial={reduceMotion ? false : { scale: .75, opacity: 0, y: -15 }} animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { scale: .85, opacity: 0, y: -16, transition: { duration: .23, ease: 'easeOut' } }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 480, damping: 28, opacity: { duration: .14 } }}>
                    {last && <span className="go-last-mark" />}
                  </motion.span>}
                </AnimatePresence>
                {!cell && owner ? <span className={`go-territory go-territory--${owner}`} aria-hidden="true" /> : null}
                {!cell && libertySet.has(index) && <motion.span className="go-liberty" aria-hidden="true" initial={reduceMotion ? false : { scale: .4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: reduceMotion ? 0 : .2 }} />}
                {!cell && !result && !thinking && <span className={`go-preview go-preview--${turn}`} aria-hidden="true" />}
              </button>
            }))}
            <BoardEffects width={BOARD_WIDTH} height={BOARD_WIDTH} to={effect ? { x: PAD + effect.c * CELL, y: PAD + effect.r * CELL } : undefined} eventKey={effect ? effectKey : ''} kind={captured.length ? 'capture' : 'place'} />
          </div>
        </div>
      </ResponsiveBoard>
      <div className="go-turn-actions">
        <button type="button" className="go-pass" onClick={() => commit({ type: 'pass' })} disabled={!!result || (mode === 'ai' && turn === 2)}>
          停一手<span>连续两次停着，结束计分</span>
        </button>
        <div className="go-resign-actions">
          <button type="button" onClick={() => commit({ type: 'resign', side: 1 })} disabled={!!result}>{mode === 'ai' ? '认输' : '黑棋认输'}</button>
          {mode === 'local' && <button type="button" onClick={() => commit({ type: 'resign', side: 2 })} disabled={!!result}>白棋认输</button>}
        </div>
      </div>
      {feedback?.error && <p className="go-feedback go-feedback--error">请换个位置再试，不会增加手数。</p>}
      {result?.score && <div className="go-score" aria-label="面积计分明细">
        <div><span>黑棋</span><strong>{result.score.black.total}<small>目</small></strong><p>{result.score.black.stones} 子 + {result.score.black.territory} 围空</p></div>
        <div><span>白棋</span><strong>{result.score.white.total}<small>目</small></strong><p>{result.score.white.stones} 子 + {result.score.white.territory} 围空 + 6.5 贴目</p></div>
        <p className="go-score-neutral">双方共同接触的空区为中立，共 {result.score.neutral} 点。提子数仅供记录，不另加分。</p>
      </div>}
      <p className="go-rule-note">本作采用 9 路快速规则：禁自杀、简单劫，按棋子与围空计分，白贴 6.5 目。不会自动判定死子，请实际提走死子再停着；复杂循环不自动裁定。</p>
    </div>
  )
}
