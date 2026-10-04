import type { Cell } from '../games/gomoku/gomokuLogic'
import type { Board as ChessBoard, GameMeta, Move as ChessMove, Side as ChessSide } from '../games/chess/chessTypes'
import type { Board as XiangqiBoard, Move as XiangqiMove, Side as XiangqiSide } from '../games/xiangqi/xiangqiTypes'
import type { Board as ShogiBoard, Hand, Move as ShogiMove, Side as ShogiSide } from '../games/shogi/shogiTypes'

export type AiTasks = {
  gomoku: { input: { board: Cell[][]; side: 1 | 2 }; move: [number, number] }
  chess: { input: { board: ChessBoard; meta: GameMeta; side: ChessSide }; move: ChessMove }
  xiangqi: { input: { board: XiangqiBoard; side: XiangqiSide }; move: XiangqiMove }
  shogi: { input: { board: ShogiBoard; hand: Hand; side: ShogiSide }; move: ShogiMove }
}

export type AiRequest = { [G in keyof AiTasks]: { game: G; input: AiTasks[G]['input'] } }[keyof AiTasks]
