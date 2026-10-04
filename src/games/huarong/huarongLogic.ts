export type Direction = 'up' | 'down' | 'left' | 'right'
export const HUARONG_COLS = 4
export const HUARONG_ROWS = 5
const OFFSETS: Record<Direction, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

export interface HuarongPiece {
  id: string
  name: string
  width: number
  height: number
  col: number
  row: number
  kind: 'leader' | 'general' | 'soldier'
}

export interface HuarongState { pieces: HuarongPiece[]; moves: number; won: boolean }
export interface HuarongRun { current: HuarongState; history: HuarongState[] }

/** 经典横刀立马：曹操居上，关羽横置，四位竖将和四卒，底部中央两格空位。 */
export function initialHuarongState(): HuarongState {
  return { moves: 0, won: false, pieces: [
    { id: 'cao', name: '曹操', width: 2, height: 2, col: 1, row: 0, kind: 'leader' },
    { id: 'zhao', name: '赵云', width: 1, height: 2, col: 0, row: 0, kind: 'general' },
    { id: 'zhang', name: '张飞', width: 1, height: 2, col: 3, row: 0, kind: 'general' },
    { id: 'ma', name: '马超', width: 1, height: 2, col: 0, row: 2, kind: 'general' },
    { id: 'huang', name: '黄忠', width: 1, height: 2, col: 3, row: 2, kind: 'general' },
    { id: 'guan', name: '关羽', width: 2, height: 1, col: 1, row: 2, kind: 'general' },
    { id: 'soldier-1', name: '卒一', width: 1, height: 1, col: 1, row: 3, kind: 'soldier' },
    { id: 'soldier-2', name: '卒二', width: 1, height: 1, col: 2, row: 3, kind: 'soldier' },
    { id: 'soldier-3', name: '卒三', width: 1, height: 1, col: 0, row: 4, kind: 'soldier' },
    { id: 'soldier-4', name: '卒四', width: 1, height: 1, col: 3, row: 4, kind: 'soldier' },
  ] }
}

export function moveHuarong(state: HuarongState, id: string, direction: Direction): HuarongState {
  if (state.won) return state
  const piece = state.pieces.find(current => current.id === id)
  if (!piece) return state
  const [dx, dy] = OFFSETS[direction]
  const col = piece.col + dx
  const row = piece.row + dy
  if (col < 0 || row < 0 || col + piece.width > HUARONG_COLS || row + piece.height > HUARONG_ROWS) return state
  if (state.pieces.some(other => other.id !== id &&
    col < other.col + other.width && col + piece.width > other.col &&
    row < other.row + other.height && row + piece.height > other.row)) return state
  return {
    pieces: state.pieces.map(current => current.id === id ? { ...current, col, row } : current),
    moves: state.moves + 1,
    won: id === 'cao' && col === 1 && row === 3,
  }
}

export function legalHuarongDirections(state: HuarongState, id: string): Direction[] {
  return (Object.keys(OFFSETS) as Direction[]).filter(direction => moveHuarong(state, id, direction) !== state)
}

export function startHuarong(): HuarongRun { return { current: initialHuarongState(), history: [] } }

export function moveHuarongRun(run: HuarongRun, id: string, direction: Direction): HuarongRun {
  const current = moveHuarong(run.current, id, direction)
  return current === run.current ? run : { current, history: [...run.history, run.current] }
}

export function undoHuarong(run: HuarongRun): HuarongRun {
  const previous = run.history.at(-1)
  return previous ? { current: previous, history: run.history.slice(0, -1) } : run
}
