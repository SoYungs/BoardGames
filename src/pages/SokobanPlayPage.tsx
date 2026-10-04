import { PuzzleScene } from '../components/PuzzleScene'
import { SokobanGame } from '../games/sokoban/SokobanGame'

export function SokobanPlayPage() {
  return <PuzzleScene game="sokoban"><SokobanGame /></PuzzleScene>
}
