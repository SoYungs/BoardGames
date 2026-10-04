import { pickAiMove } from '../games/gomoku/gomokuLogic'
import { pickAiMoveChess } from '../games/chess/chessMoves'
import { analyzeXiangqi } from '../games/xiangqi/xiangqiAi'
import { pickAiMoveShogi } from '../games/shogi/shogiMoves'
import { pickAiMoveJunqi } from '../games/junqi/junqiMoves'
import { pickAiMoveGo } from '../games/go/goAi'
import type { AiRequest } from './aiTypes'
import { xiangqiWorkerBudget } from './aiDeadline'

self.onmessage = (event: MessageEvent<AiRequest>) => {
  const task = event.data
  switch (task.game) {
    case 'gomoku': self.postMessage({ move: pickAiMove(task.input.board, task.input.side, task.input.budgetMs ?? 800) }); break
    case 'chess': self.postMessage({ move: pickAiMoveChess(task.input.board, task.input.meta, task.input.side, task.input.budgetMs ?? 800) }); break
    case 'xiangqi': self.postMessage(analyzeXiangqi(task.input.board, task.input.side, xiangqiWorkerBudget(task.input), task.input.maxDepth ?? 8, task.input.history)); break
    case 'shogi': self.postMessage({ move: pickAiMoveShogi(task.input.board, task.input.hand, task.input.side, task.input.budgetMs ?? 800) }); break
    case 'junqi': self.postMessage({ move: pickAiMoveJunqi(task.input.board, task.input.side, task.input.budgetMs ?? 800) }); break
    case 'go': self.postMessage({ move: pickAiMoveGo(task.input.position, task.input.side, task.input.budgetMs ?? 650) }); break
  }
}
