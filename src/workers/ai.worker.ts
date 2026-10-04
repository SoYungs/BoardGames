import { pickAiMove } from '../games/gomoku/gomokuLogic'
import { pickAiMoveChess } from '../games/chess/chessMoves'
import { pickAiMoveXiangqi } from '../games/xiangqi/xiangqiMoves'
import { pickAiMoveShogi } from '../games/shogi/shogiMoves'
import type { AiRequest } from './aiTypes'

self.onmessage = (event: MessageEvent<AiRequest>) => {
  const task = event.data
  switch (task.game) {
    case 'gomoku': self.postMessage({ move: pickAiMove(task.input.board, task.input.side) }); break
    case 'chess': self.postMessage({ move: pickAiMoveChess(task.input.board, task.input.meta, task.input.side) }); break
    case 'xiangqi': self.postMessage({ move: pickAiMoveXiangqi(task.input.board, task.input.side) }); break
    case 'shogi': self.postMessage({ move: pickAiMoveShogi(task.input.board, task.input.hand, task.input.side) }); break
  }
}
