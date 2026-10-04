import type { Cell } from '../games/gomoku/gomokuLogic'
import type { Board as ChessBoard, GameMeta, Move as ChessMove, Side as ChessSide } from '../games/chess/chessTypes'
import type { Board as XiangqiBoard, Move as XiangqiMove, Side as XiangqiSide } from '../games/xiangqi/xiangqiTypes'
import type { Board as ShogiBoard, Hand, Move as ShogiMove, Side as ShogiSide } from '../games/shogi/shogiTypes'
import type { Board as JunqiBoard, Move as JunqiMove, Side as JunqiSide } from '../games/junqi/junqiTypes'
import type { GoPosition, GoMove, GoSide } from '../games/go/goTypes'

export type AiTasks = {
  gomoku: { input: { board: Cell[][]; side: 1 | 2; budgetMs?: number }; move: [number, number] }
  chess: { input: { board: ChessBoard; meta: GameMeta; side: ChessSide; budgetMs?: number }; move: ChessMove }
  xiangqi: { input: { board: XiangqiBoard; side: XiangqiSide; budgetMs?: number }; move: XiangqiMove }
  shogi: { input: { board: ShogiBoard; hand: Hand; side: ShogiSide; budgetMs?: number }; move: ShogiMove }
  junqi: { input: { board: JunqiBoard; side: JunqiSide; budgetMs?: number }; move: JunqiMove }
  go: { input: { position: GoPosition; side: GoSide; budgetMs?: number }; move: GoMove }
}

export type AiRequest = { [G in keyof AiTasks]: { game: G; input: AiTasks[G]['input'] } }[keyof AiTasks]
