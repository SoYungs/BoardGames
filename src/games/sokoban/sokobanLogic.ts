import type { SokobanLevel } from './sokobanLevels'

export type Direction = 'up' | 'down' | 'left' | 'right'
export const DIRECTION_OFFSETS: Record<Direction, [number, number]> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
}

export interface SokobanState {
  player: number
  boxes: number[]
  moves: number
  pushes: number
  won: boolean
}

export interface SokobanBoard {
  width: number
  height: number
  walls: Set<number>
  goals: Set<number>
  initial: SokobanState
}

export interface SokobanRun { current: SokobanState; history: SokobanState[] }

export function parseSokobanLevel(level: SokobanLevel): SokobanBoard {
  const width = level.map[0]?.length ?? 0
  const height = level.map.length
  const walls = new Set<number>()
  const goals = new Set<number>()
  const boxes: number[] = []
  let player = -1
  let playerCount = 0
  if (!width || !height || level.map.some(row => row.length !== width)) throw new Error('关卡必须为完整矩形')
  level.map.forEach((row, r) => [...row].forEach((cell, c) => {
    const position = r * width + c
    if (!'# .@$+*'.includes(cell)) throw new Error('未知关卡字符')
    if (cell === '#') walls.add(position)
    if ('.+*'.includes(cell)) goals.add(position)
    if ('$*'.includes(cell)) boxes.push(position)
    if ('@+'.includes(cell)) { player = position; playerCount++ }
  }))
  if (playerCount !== 1 || boxes.length === 0 || boxes.length !== goals.size) throw new Error('关卡需要一名玩家，且箱子和目标数量相等')
  return { width, height, walls, goals, initial: { player, boxes, moves: 0, pushes: 0, won: boxes.every(position => goals.has(position)) } }
}

function neighbor(board: SokobanBoard, position: number, direction: Direction): number | null {
  const [dx, dy] = DIRECTION_OFFSETS[direction]
  const col = position % board.width + dx
  const row = Math.floor(position / board.width) + dy
  if (col < 0 || row < 0 || col >= board.width || row >= board.height) return null
  const target = row * board.width + col
  return board.walls.has(target) ? null : target
}

export function moveSokoban(board: SokobanBoard, state: SokobanState, direction: Direction): SokobanState {
  if (state.won) return state
  const target = neighbor(board, state.player, direction)
  if (target === null) return state
  const boxIndex = state.boxes.indexOf(target)
  let boxes = state.boxes
  if (boxIndex >= 0) {
    const beyond = neighbor(board, target, direction)
    if (beyond === null || boxes.includes(beyond)) return state
    boxes = state.boxes.map((position, index) => index === boxIndex ? beyond : position)
  }
  return {
    player: target,
    boxes,
    moves: state.moves + 1,
    pushes: state.pushes + (boxIndex >= 0 ? 1 : 0),
    won: boxes.every(position => board.goals.has(position)),
  }
}

export function startSokoban(board: SokobanBoard): SokobanRun {
  return { current: { ...board.initial, boxes: [...board.initial.boxes] }, history: [] }
}

export function moveSokobanRun(board: SokobanBoard, run: SokobanRun, direction: Direction): SokobanRun {
  const current = moveSokoban(board, run.current, direction)
  return current === run.current ? run : { current, history: [...run.history, run.current] }
}

export function undoSokoban(run: SokobanRun): SokobanRun {
  const previous = run.history.at(-1)
  return previous ? { current: previous, history: run.history.slice(0, -1) } : run
}
