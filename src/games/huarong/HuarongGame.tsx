import { useReducer, useRef, useState, type KeyboardEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { GameResult } from '../../components/GameResult'
import { GameStatus } from '../../components/GameStatus'
import { InteractionHint } from '../../components/InteractionHint'
import { BoardEffects } from '../../components/BoardEffects'
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
type Point = { x: number; y: number }
type UiState = { run: HuarongRun; feedback: string | null; revision: number; effect: { from: Point; to: Point; key: number } | null }
type Action = { type: 'move'; id: string; direction: Direction } | { type: 'undo' } | { type: 'restart' } | { type: 'inspect' }
const initialUiState = (revision = 0): UiState => ({ run: startHuarong(), feedback: null, revision, effect: null })
function reducer(ui: UiState, action: Action): UiState {
  if (action.type === 'restart') return initialUiState(ui.revision + 1)
  if (action.type === 'inspect') return { ...ui, feedback: null }
  if (action.type === 'undo') {
    const run = undoHuarong(ui.run)
    return { ...ui, run, feedback: run === ui.run ? '还没有可以撤销的走步。' : null, effect: null }
  }
  const run = moveHuarongRun(ui.run, action.id, action.direction)
  if (run === ui.run) return { ...ui, feedback: run.current.won ? '曹操已经抵达出口，可以重新挑战。' : '这个方向被挡住了，换个方向或另一枚棋子。', effect: null }
  const previous = ui.run.current.pieces.find(piece => piece.id === action.id)!
  const next = run.current.pieces.find(piece => piece.id === action.id)!
  const center = (piece: typeof next) => ({ x: PAD + (piece.col + piece.width / 2) * CELL, y: PAD + (piece.row + piece.height / 2) * CELL })
  const revision = ui.revision + 1
  return { run, feedback: null, revision, effect: { from: center(previous), to: center(next), key: revision } }
}

export function HuarongGame() {
  const [ui, dispatch] = useReducer(reducer, undefined, () => initialUiState())
  const [selected, setSelected] = useState<string | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const { run } = ui
  const state = run.current
  const selectedPiece = state.pieces.find(piece => piece.id === selected)
  const available = selected ? legalHuarongDirections(state, selected) : []
  const occupied = new Set(state.pieces.flatMap(piece => Array.from({ length: piece.height }, (_, dy) => Array.from({ length: piece.width }, (_, dx) => (piece.row + dy) * HUARONG_COLS + piece.col + dx)).flat()))
  const targetCells = new Set<number>()
  if (selectedPiece) for (const direction of available) {
    const col = selectedPiece.col + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0)
    const row = selectedPiece.row + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0)
    for (let dy = 0; dy < selectedPiece.height; dy++) for (let dx = 0; dx < selectedPiece.width; dx++) {
      const cell = (row + dy) * HUARONG_COLS + col + dx
      if (!occupied.has(cell)) targetCells.add(cell)
    }
  }
  // Direction controls can become disabled after a slide; keep Z/R available.
  const focusBoard = () => boardRef.current?.focus({ preventScroll: true })
  const move = (direction: Direction) => { if (selected) { focusBoard(); dispatch({ type: 'move', id: selected, direction }) } }
  const undo = () => { focusBoard(); dispatch({ type: 'undo' }) }
  const reset = () => { focusBoard(); dispatch({ type: 'restart' }); setSelected(null) }

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (event.altKey || event.ctrlKey || event.metaKey || !target.closest('[data-puzzle-keyboard]')) return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    if (KEYS[key]) {
      event.preventDefault()
      if (!event.repeat) move(KEYS[key])
    } else if (key === 'z') { event.preventDefault(); undo() }
    else if (key === 'r') { event.preventDefault(); reset() }
  }

  return (
    <div className="hr-game" onKeyDown={onKey}>
      <div className="hr-toolbar">
        <div className="hr-layout-name"><span>经典布局</span><strong>横刀立马</strong></div>
        <div className="hr-actions"><button type="button" onClick={undo} disabled={run.history.length === 0}>撤销</button><button type="button" onClick={reset}>重开</button></div>
      </div>
      <div className="hr-stats"><span><strong>{state.moves}</strong> 步</span><span>每次滑动一格计一步</span></div>
      <GameStatus status={ui.feedback ?? (state.won ? '曹操已抵达出口，成功解围！' : selectedPiece ? `${selectedPiece.name}已选中 · ${available.length ? '按方向滑动' : '暂时动不了，换一枚棋子'}` : '先点选一枚棋子')} sideLabel="单人解谜 · 横刀立马" sideTone="dark" detail={selectedPiece ? '深绿框是选中的棋子，绿点是可移动到的空位' : '目标：把曹操移到下方中间的出口'} />
      <InteractionHint steps={['选棋子', '方向滑动', '曹操到出口']} activeStep={state.won ? 2 : selected ? 1 : 0} note="一次只滑动一格。棋子不能旋转，不能穿过其他棋子。" />
      <ResponsiveBoard width={WIDTH} height={HEIGHT}>
        <div ref={boardRef} className="hr-board" data-puzzle-keyboard="true" tabIndex={0} style={{ width: WIDTH, height: HEIGHT }} aria-label="四列五行华容道棋盘，点选棋子后可用方向键或WASD移动">
          <div className="hr-floor" aria-hidden="true" style={{ left: PAD, top: PAD, width: CELL * HUARONG_COLS, height: CELL * HUARONG_ROWS }}>
            {Array.from({ length: HUARONG_COLS * HUARONG_ROWS }, (_, index) => <span key={index} className={targetCells.has(index) ? 'hr-target-cell' : ''} style={{ width: CELL, height: CELL }} />)}
          </div>
          {state.pieces.map(piece => <motion.button
            key={piece.id}
            type="button"
            className={`hr-piece hr-${piece.kind} ${piece.width > piece.height ? 'hr-horizontal' : piece.height > piece.width ? 'hr-vertical' : 'hr-square'} ${selected === piece.id ? 'hr-selected' : ''}`}
            aria-label={`${piece.name}，${piece.row + 1}行${piece.col + 1}列起，占${piece.width}列${piece.height}行，点击选择`}
            aria-pressed={selected === piece.id}
            disabled={state.won}
            onClick={() => { setSelected(piece.id); dispatch({ type: 'inspect' }) }}
            initial={false}
            animate={{ x: piece.col * CELL, y: piece.row * CELL }}
            transition={reduceMotion || !ui.effect ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 31 }}
            style={{ left: PAD + 4, top: PAD + 4, width: piece.width * CELL - 8, height: piece.height * CELL - 8 }}
          ><span className="hr-piece-name">{piece.kind === 'soldier' ? '卒' : piece.name}</span><span className="hr-piece-mark" aria-hidden="true">{piece.kind === 'leader' ? '魏' : piece.kind === 'soldier' ? piece.name.at(-1) : '将'}</span></motion.button>)}
          <div className={`hr-exit ${state.won ? 'hr-exit-open' : ''}`} aria-label="曹操出口，底部中央两列" style={{ left: PAD + CELL, top: PAD + CELL * HUARONG_ROWS + 3, width: CELL * 2 }}>出口 <span aria-hidden="true">↓</span></div>
          <BoardEffects width={WIDTH} height={HEIGHT} from={ui.effect?.from} to={ui.effect?.to} eventKey={ui.effect?.key ?? ''} kind={state.won ? 'place' : 'move'} />
        </div>
      </ResponsiveBoard>
      <div className="hr-controls">
        <div className="hr-dpad" data-puzzle-keyboard="true" role="group" aria-label="选中棋子的滑动方向">
          {DIRECTIONS.map(({ direction, label, arrow }) => <button key={direction} className={`hr-${direction}`} type="button" aria-label={label} title={selected && !available.includes(direction) ? '这个方向暂时被挡住了' : label} disabled={!selected || !available.includes(direction)} onClick={() => move(direction)}><span aria-hidden="true">{arrow}</span><small>{label.slice(1, 2)}</small></button>)}
          <span aria-hidden="true">移</span>
        </div>
        <p className="hr-keyboard">点选后，方向键 / WASD 移动<br /><kbd>Z</kbd> 撤销 · <kbd>R</kbd> 重开</p>
      </div>
      <p className="hr-hint">棋子不能旋转或重叠。让曹操抵达下方正中央的出口。</p>
      <GameResult result={state.won ? `成功解围 · 共 ${state.moves} 步` : null} onRestart={reset} restartLabel="重新挑战" eyebrow="挑战完成" />
    </div>
  )
}
