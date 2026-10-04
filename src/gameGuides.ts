import type { GameId } from './gameCatalog'

export const gameGuides = {
  gomoku: { goal: '让自己的棋子连成五子。', steps: [{ title: '找到交叉点', body: '轮到你时，点击棋盘上的空交叉点。' }, { title: '连线，也要防守', body: '横、竖、斜向都算；看到对方连成四子，先想办法挡住。' }] },
  xiangqi: { goal: '将死对方的将或帅。', steps: [{ title: '选一枚己方棋子', body: '点击后，棋盘会标出这枚棋子能去的位置。' }, { title: '点击目标走子', body: '绿色圆点可移动，金色圈可吃子；被将军时先解围。' }] },
  shogi: { goal: '将死对方的玉或王。', steps: [{ title: '选子，再选目标', body: '棋盘会标出合法走法；可以升变时，会出现选择按钮。' }, { title: '让持子重新上场', body: '吃来的棋子在持子区，选中后可打入标记的空格。' }] },
  chess: { goal: '将死对方的王。', steps: [{ title: '点击己方棋子', body: '绿色圆点是空位，金色圈是可吃的目标。' }, { title: '走到标记位置', body: '被将军时必须先保护王；兵到达末行后选择升变棋子。' }] },
  junqi: { goal: '夺取敌方军旗。', steps: [{ title: '选子，查看路线', body: '点击己方能移动的棋子，再点击标记位置。' }, { title: '交战后揭晓', body: '敌方身份在交战后公开。先观察行营与铁路，再判断攻击。' }] },
  go: { goal: '围出更多地盘，保护自己的棋。', steps: [{ title: '点击空交叉点落子', body: '相连的棋子是一块；紧邻它们的空点叫“气”。' }, { title: '数气，连接弱棋', body: '点击已有棋子可查看整块棋和它的气。无气的敌子会被提走。' }, { title: '收完官，再停一手', body: '双方连续停一手结束；计分前先提净死子，白棋贴 6.5 目。' }] },
  sokoban: { goal: '把所有箱子推到圆形目标上。', steps: [{ title: '方向键控制小人', body: '也可用 WASD 或棋盘下方的方向按钮。' }, { title: '给箱子留退路', body: '箱子只能推，不能拉；走错后点“撤销”，随时重试。' }] },
  huarong: { goal: '让曹操到达下方中央出口。', steps: [{ title: '先点击选择棋子', body: '深绿框标出选中的棋子；亮起的方向按钮可以移动。' }, { title: '用方向按钮滑动', body: '也可用方向键或 WASD；把两个空格合起来，给大棋子让路。' }] },
} satisfies Record<GameId, { goal: string; steps: { title: string; body: string }[] }>
