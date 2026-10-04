export type BoardGameId = 'gomoku' | 'xiangqi' | 'shogi' | 'chess' | 'junqi' | 'go'
export type PuzzleId = 'sokoban' | 'huarong'
export type GameId = BoardGameId | PuzzleId
export function isPuzzle(game: GameId): game is PuzzleId { return game === 'sokoban' || game === 'huarong' }

export const gameCatalog = {
  gomoku: {
    name: '五子棋', english: 'GOMOKU', tag: '落子之间，步步为营', category: '轻快 · 连珠',
    description: '黑白交错，攻守相生。在简单的规则里，找到你的下一步。',
    first: '黑棋先手', board: '15 × 15 路',
    rules: ['黑白双方轮流在交叉点落子。', '横、竖或斜向连成五子及以上即可获胜。', '本作采用自由连珠，不设禁手。满盘无胜者为和棋。'],
    tip: '既要寻找自己的连线，也要留意对手的四子威胁。',
  },
  xiangqi: {
    name: '中国象棋', english: 'XIANGQI', tag: '一渡楚河，再越汉界', category: '经典 · 谋略',
    description: '车马炮兵各有所长，方寸之间，演绎一场楚河汉界的较量。',
    first: '红方先手', board: '9 × 10 路',
    rules: ['红方先行，点击己方棋子，再点击标记的目标。', '走子须遵守马腿、象眼、炮架及将帅不照面的规则。', '将死或困毙对手获胜。同一局面与行棋方第三次出现时，单方长将判负，双方长将或其他重复判和；第二次出现会提示变招。', '本作使用上述练习规则，暂不区分长捉、长杀等复杂棋例。'],
    tip: '车走直线、马走日、象走田；炮吃子时需要一个炮架。',
  },
  shogi: {
    name: '日本将棋', english: 'SHOGI', tag: '棋子归来，局势再起', category: '进阶 · 打入',
    description: '吃下的棋子，成为手中的新机会。打入与升变，让变化继续。',
    first: '先手执玉', board: '9 × 9 格',
    rules: ['点击己方棋子，再点击合法目标格。', '进入、离开或在敌阵移动时可选择升变，部分末线走法必须升变。', '持子可打入空格，禁止二步和打步诘；本作暂不裁定千日手。'],
    tip: '被吃的棋子会成为持子，轮到你时可重新打入棋盘。',
  },
  chess: {
    name: '国际象棋', english: 'CHESS', tag: '黑白方格，无限可能', category: '经典 · 战术',
    description: '从第一步兵，到最后一次将军。让每一枚棋子发挥它的力量。',
    first: '白方先手', board: '8 × 8 格',
    rules: ['白方先行，选中棋子后查看合法目标。', '支持王车易位、吃过路兵与兵升变选择。', '将死获胜，无合法走法且未被将军为逼和；暂不裁定重复与五十回合规则。'],
    tip: '先争夺中心，再让马和象出动，注意保护你的王。',
  },
  junqi: {
    name: '中国军棋', english: 'JUNQI', tag: '暗藏阵势，亮出锋芒', category: '趣味 · 暗棋',
    description: '在未知中判断，在交锋中揭晓。用铁路与行营，展开你的布局。',
    first: '红方先手', board: '6 × 12 简化盘',
    rules: ['本作使用简化棋盘，随机布阵，每方 25 子，军旗位于大本营。', '铁路可直行，工兵可转弯；行营内棋子不能被攻击，本营内棋子不能移动。', '吃掉敌方军旗，或使对方无子可走获胜。此变体仅交战后亮明棋子。'],
    tip: '工兵能排雷，炸弹与对方同归于尽；攻击前先判断风险。',
  },
  go: {
    name: '围棋', english: 'GO', tag: '黑白之间，围出天地', category: '经典 · 围地',
    description: '从九路小棋盘开始，连接、包围与提子，让每一步都有分量。',
    first: '黑棋先手', board: '9 × 9 路',
    rules: ['黑白轮流落子，相连棋子共用气，无气的敌子会被提走；禁止自杀。', '采用简单劫：不能立即还原上一手棋盘。可停一手，连续两次停着结束。', '按棋子与围空的面积计分，白贴 6.5 目。双方须先提净死子；结束时不自动判定死子。'],
    tip: '被打吃时先数气；将弱棋连在一起，比单纯追着对手跑更稳妥。',
  },
  sokoban: {
    name: '推箱子', english: 'SOKOBAN', tag: '向前一步，先想三步', category: '益智 · 关卡',
    description: '把每只箱子送到目标上。不能拉回的那一步，最考验你的判断。',
    first: '单人闯关', board: '精选关卡',
    rules: ['使用方向键、WASD 或屏幕方向按钮移动。', '一次只能推动一只箱子，不能拉箱子，也不能穿过墙壁。', '将所有箱子推上目标即可过关；卡住时可撤销或重开。'],
    tip: '箱子一旦进入没有目标的墙角，就无法再推出；先给自己留条路。',
  },
  huarong: {
    name: '华容道', english: 'HUARONG', tag: '方寸腾挪，寻一条出路', category: '益智 · 滑块',
    description: '从横刀立马的布局出发，挪动将士，为曹操腾出下方的出口。',
    first: '单人解谜', board: '4 × 5 格',
    rules: ['先点击选择棋子，再使用方向键、WASD 或屏幕按钮移动。', '棋子只能沿上下左右滑动，不能重叠，也不能离开棋盘。', '将 2×2 的曹操移动到下方中央出口即获胜。每次移动一格记一步。'],
    tip: '两个空格的位置是关键。把它们合在一起，才能让大棋子通过。',
  },
} satisfies Record<GameId, { name: string; english: string; tag: string; category: string; description: string; first: string; board: string; rules: string[]; tip: string }>

export const gameIds = Object.keys(gameCatalog) as GameId[]
