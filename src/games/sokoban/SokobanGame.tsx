import { useReducer, type KeyboardEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { GameResult } from '../../components/GameResult'
import { ResponsiveBoard } from '../../components/ResponsiveBoard'
import { SOKOBAN_LEVELS } from './sokobanLevels'
import { moveSokobanRun, parseSokobanLevel, startSokoban, undoSokoban } from './sokobanLogic'
import type { Direction, SokobanRun } from './sokobanLogic'
import './sokoban.css'

const BOARDS = SOKOBAN_LEVELS.map(parseSokobanLevel)
const CELL = 48
const PAD = 12
const DIRECTIONS: { direction: Direction; label: string; arrow: string }[] = [
  { direction: 'up', label: '向上移动', arrow: '↑' },
  { direction: 'left', label: '向左移动', arrow: '←' },
  { direction: 'down', label: '向下移动', arrow: '↓' },
  { direction: 'right', label: '向右移动', arrow: '→' },
]
const KEYS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }
type Session = { levelIndex: number; run: SokobanRun }
type Action = { type: 'move'; direction: Direction } | { type: 'select'; levelIndex: number } | { type: 'undo' } | { type: 'restart' } | { type: 'next' }

function session(levelIndex = 0): Session { return { levelIndex, run: startSokoban(BOARDS[levelIndex]) } }
function reducer(state: Session, action: Action): Session {
  if (action.type === 'select') return session(action.levelIndex)
  if (action.type === 'restart') return session(state.levelIndex)
  if (action.type === 'next') return state.run.current.won && state.levelIndex < BOARDS.length - 1 ? session(state.levelIndex + 1) : state
  const run = action.type === 'undo' ? undoSokoban(state.run) : moveSokobanRun(BOARDS[state.levelIndex], state.run, action.direction)
  return run === state.run ? state : { ...state, run }
}

export function SokobanGame() {
  const [game, dispatch] = useReducer(reducer, undefined, () => session())
  const reduceMotion = useReducedMotion()
  const { levelIndex, run } = game
  const state = run.current
  const board = BOARDS[levelIndex]
  const level = SOKOBAN_LEVELS[levelIndex]
  const placed = state.boxes.filter(position => board.goals.has(position)).length
  const width = board.width * CELL + PAD * 2
  const height = board.height * CELL + PAD * 2
  const position = (cell: number) => ({ left: PAD + cell % board.width * CELL + 5, top: PAD + Math.floor(cell / board.width) * CELL + 5 })
  const transition = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 480, damping: 32 }
  const reset = () => dispatch({ type: 'restart' })
  const cellDescription = (cell: number) => {
    if (board.walls.has(cell)) return '墙'
    const goal = board.goals.has(cell)
    if (state.boxes.includes(cell)) return goal ? '箱子（目标）' : '箱子'
    if (state.player === cell) return goal ? '玩家（目标）' : '玩家'
    return goal ? '目标' : '空地'
  }

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (event.altKey || event.ctrlKey || event.metaKey || !target.closest('[data-puzzle-keyboard]')) return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    if (KEYS[key]) {
      event.preventDefault()
      if (!event.repeat) dispatch({ type: 'move', direction: KEYS[key] })
    } else if (key === 'z') { event.preventDefault(); dispatch({ type: 'undo' }) }
    else if (key === 'r') { event.preventDefault(); dispatch({ type: 'restart' }) }
  }

  return (
    <div className="soko-game" onKeyDown={onKey}>
      <div className="soko-toolbar">
        <label className="soko-level-label">关卡
          <select aria-label="选择推箱子关卡" value={levelIndex} onChange={event => dispatch({ type: 'select', levelIndex: Number(event.target.value) })}>
            {SOKOBAN_LEVELS.map((item, index) => <option key={item.id} value={index}>{String(index + 1).padStart(2, '0')} · {item.name}</option>)}
          </select>
        </label>
        <div className="soko-actions">
          <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={run.history.length === 0}>撤销</button>
          <button type="button" onClick={reset}>重开</button>
        </div>
      </div>
      <div className="soko-stats"><span><strong>{state.moves}</strong> 步</span><span><strong>{state.pushes}</strong> 推</span><span className="soko-goals"><strong>{placed}/{board.goals.size}</strong> 箱归位</span></div>
      <p className="soko-status" role="status" aria-live="polite">{state.won ? '全部箱子已归位，关卡完成！' : `第 ${levelIndex + 1} 关 · ${level.name}`}</p>
      <ResponsiveBoard width={width} height={height}>
        <div className="soko-board" data-puzzle-keyboard="true" tabIndex={0} onClick={event => event.currentTarget.focus()} style={{ width, height }} role="img" aria-label={`仓库棋盘，聚焦后可用方向键或WASD移动。玩家在${Math.floor(state.player / board.width) + 1}行${state.player % board.width + 1}列。箱子在${state.boxes.map(cell => `${Math.floor(cell / board.width) + 1}行${cell % board.width + 1}列`).join('、')}。目标在${[...board.goals].map(cell => `${Math.floor(cell / board.width) + 1}行${cell % board.width + 1}列`).join('、')}。墙体及完整地图可展开下方棋盘文字说明查看。`}>
          <div className="soko-tiles" aria-hidden="true" style={{ left: PAD, top: PAD, gridTemplateColumns: `repeat(${board.width}, ${CELL}px)` }}>
            {Array.from({ length: board.width * board.height }, (_, cell) => <div key={cell} className={`soko-tile ${board.walls.has(cell) ? 'soko-wall' : 'soko-floor'} ${board.goals.has(cell) ? 'soko-target' : ''}`} style={{ width: CELL, height: CELL }}>{board.goals.has(cell) && <span />}</div>)}
          </div>
          {state.boxes.map((cell, index) => <motion.div key={`box-${index}`} className={`soko-box ${board.goals.has(cell) ? 'soko-box-placed' : ''}`} aria-hidden="true" initial={false} animate={position(cell)} transition={transition} style={{ width: CELL - 10, height: CELL - 10 }}><span /><i /></motion.div>)}
          <motion.div className="soko-player" aria-hidden="true" initial={false} animate={position(state.player)} transition={transition} style={{ width: CELL - 10, height: CELL - 10 }}>
            <svg width="30" height="32" viewBox="0 0 30 32" fill="none"><circle cx="15" cy="9" r="6" fill="currentColor" /><path d="M5 27c0-7 4-11 10-11s10 4 10 11H5Z" fill="currentColor" /><path d="M9 7h12" stroke="#335653" strokeWidth="3" strokeLinecap="round" /></svg>
          </motion.div>
        </div>
      </ResponsiveBoard>
      <div className="soko-controls">
        <div className="soko-dpad" data-puzzle-keyboard="true" role="group" aria-label="移动方向">
          {DIRECTIONS.map(({ direction, label, arrow }) => <button key={direction} className={`soko-${direction}`} type="button" aria-label={label} disabled={state.won} onClick={() => dispatch({ type: 'move', direction })}>{arrow}</button>)}
          <span aria-hidden="true">✦</span>
        </div>
        <p className="soko-keyboard">点击棋盘后<br />方向键 / WASD 移动<br /><kbd>Z</kbd> 撤销 · <kbd>R</kbd> 重开</p>
      </div>
      <p className="soko-hint">{level.hint}</p>
      <details className="soko-text-map">
        <summary>棋盘文字说明<span>按行查看</span></summary>
        <p className="soko-map-help">从上往下列出每一行，行内从左到右。括号内的“目标”表示该位置同时是目标格；内容随走步、撤销和选关更新。</p>
        <ol className="soko-map-rows" role="list">
          {Array.from({ length: board.height }, (_, row) => <li key={row}>
            <strong>第 {row + 1} 行</strong>
            <p>{Array.from({ length: board.width }, (_, col) => <span key={col}>{col + 1}列：{cellDescription(row * board.width + col)}；</span>)}</p>
          </li>)}
        </ol>
      </details>
      <GameResult result={state.won ? `第 ${levelIndex + 1} 关完成 · ${state.moves} 步 / ${state.pushes} 推` : null} onRestart={reset} />
      {state.won && (levelIndex < SOKOBAN_LEVELS.length - 1
        ? <button type="button" className="soko-next" onClick={() => dispatch({ type: 'next' })}>下一关 <span aria-hidden="true">→</span></button>
        : <p className="soko-final">最后一关已完成。还可以选关，尝试用更少的步数通关。</p>)}
    </div>
  )
}
