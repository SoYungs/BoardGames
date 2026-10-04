import { useReducer, useState, type KeyboardEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { GameResult } from '../../components/GameResult'
import { ResponsiveBoard } from '../../components/ResponsiveBoard'
import { HUARONG_COLS, HUARONG_ROWS, legalHuarongDirections, moveHuarongRun, startHuarong, undoHuarong } from './huarongLogic'
import type { Direction, HuarongRun } from './huarongLogic'
import './huarong.css'

const CELL = 76
const PAD = 12
const WIDTH = HUARONG_COLS * CELL + PAD * 2
const HEIGHT = HUARONG_ROWS * CELL + PAD * 2 + 34
const KEYS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }
const DIRECTIONS: { direction: Direction; label: string; arrow: string }[] = [
  { direction: 'up', label: '向上滑动', arrow: '↑' },
  { direction: 'left', label: '向左滑动', arrow: '←' },
  { direction: 'down', label: '向下滑动', arrow: '↓' },
  { direction: 'right', label: '向右滑动', arrow: '→' },
]
type Action = { type: 'move'; id: string; direction: Direction } | { type: 'undo' } | { type: 'restart' }
function reducer(run: HuarongRun, action: Action): HuarongRun {
  if (action.type === 'restart') return startHuarong()
  if (action.type === 'undo') return undoHuarong(run)
  return moveHuarongRun(run, action.id, action.direction)
}

export function HuarongGame() {
  const [run, dispatch] = useReducer(reducer, undefined, startHuarong)
  const [selected, setSelected] = useState<string | null>(null)
  const reduceMotion = useReducedMotion()
  const state = run.current
  const selectedPiece = state.pieces.find(piece => piece.id === selected)
  const available = selected ? legalHuarongDirections(state, selected) : []
  const reset = () => { dispatch({ type: 'restart' }); setSelected(null) }

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (event.altKey || event.ctrlKey || event.metaKey || !target.closest('[data-puzzle-keyboard]')) return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    if (KEYS[key]) {
      event.preventDefault()
      if (selected && !event.repeat) dispatch({ type: 'move', id: selected, direction: KEYS[key] })
    } else if (key === 'z') { event.preventDefault(); dispatch({ type: 'undo' }) }
    else if (key === 'r') { event.preventDefault(); dispatch({ type: 'restart' }); setSelected(null) }
  }

  return (
    <div className="hr-game" onKeyDown={onKey}>
      <div className="hr-toolbar">
        <div className="hr-layout-name"><span>经典布局</span><strong>横刀立马</strong></div>
        <div className="hr-actions"><button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={run.history.length === 0}>撤销</button><button type="button" onClick={reset}>重开</button></div>
      </div>
      <div className="hr-stats"><span><strong>{state.moves}</strong> 步</span><span>每次滑动一格计一步</span></div>
      <p className="hr-status" role="status" aria-live="polite">{state.won ? '曹操已抵达出口，成功解围！' : selectedPiece ? `${selectedPiece.name}已选中 · ${available.length ? '选择滑动方向' : '暂无可走方向，换一枚棋子'}` : '点选一枚棋子，再选择滑动方向'}</p>
      <ResponsiveBoard width={WIDTH} height={HEIGHT}>
        <div className="hr-board" data-puzzle-keyboard="true" tabIndex={0} style={{ width: WIDTH, height: HEIGHT }} aria-label="四列五行华容道棋盘，点选棋子后可用方向键或WASD移动">
          <div className="hr-floor" aria-hidden="true" style={{ left: PAD, top: PAD, width: CELL * HUARONG_COLS, height: CELL * HUARONG_ROWS }}>
            {Array.from({ length: HUARONG_COLS * HUARONG_ROWS }, (_, index) => <span key={index} style={{ width: CELL, height: CELL }} />)}
          </div>
          {state.pieces.map(piece => <motion.button
            key={piece.id}
            type="button"
            className={`hr-piece hr-${piece.kind} ${piece.width > piece.height ? 'hr-horizontal' : piece.height > piece.width ? 'hr-vertical' : 'hr-square'} ${selected === piece.id ? 'hr-selected' : ''}`}
            aria-label={`${piece.name}，${piece.row + 1}行${piece.col + 1}列起，占${piece.width}列${piece.height}行，点击选择`}
            aria-pressed={selected === piece.id}
            disabled={state.won}
            onClick={() => setSelected(piece.id)}
            initial={false}
            animate={{ left: PAD + piece.col * CELL + 4, top: PAD + piece.row * CELL + 4 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 31 }}
            style={{ width: piece.width * CELL - 8, height: piece.height * CELL - 8 }}
          ><span className="hr-piece-name">{piece.kind === 'soldier' ? '卒' : piece.name}</span><span className="hr-piece-mark" aria-hidden="true">{piece.kind === 'leader' ? '魏' : piece.kind === 'soldier' ? piece.name.at(-1) : '将'}</span></motion.button>)}
          <div className={`hr-exit ${state.won ? 'hr-exit-open' : ''}`} aria-label="曹操出口，底部中央两列" style={{ left: PAD + CELL, top: PAD + CELL * HUARONG_ROWS + 3, width: CELL * 2 }}>出口 <span aria-hidden="true">↓</span></div>
        </div>
      </ResponsiveBoard>
      <div className="hr-controls">
        <div className="hr-dpad" data-puzzle-keyboard="true" role="group" aria-label="选中棋子的滑动方向">
          {DIRECTIONS.map(({ direction, label, arrow }) => <button key={direction} className={`hr-${direction}`} type="button" aria-label={label} disabled={!selected || !available.includes(direction)} onClick={() => selected && dispatch({ type: 'move', id: selected, direction })}>{arrow}</button>)}
          <span aria-hidden="true">移</span>
        </div>
        <p className="hr-keyboard">点选后，方向键 / WASD 移动<br /><kbd>Z</kbd> 撤销 · <kbd>R</kbd> 重开</p>
      </div>
      <p className="hr-hint">棋子不能旋转或重叠。让曹操抵达下方正中央的出口。</p>
      <GameResult result={state.won ? `成功解围 · 共 ${state.moves} 步` : null} onRestart={reset} />
    </div>
  )
}
