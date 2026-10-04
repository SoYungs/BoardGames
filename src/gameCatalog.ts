export type GameId = 'gomoku' | 'xiangqi' | 'shogi' | 'chess' | 'junqi'

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
    rules: ['红方先行，点击己方棋子，再点击标记的目标。', '走子须遵守马腿、象眼、炮架及将帅不照面的规则。', '将死或困毙对手获胜；本作暂不裁定长将、长捉与重复局面。'],
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
} satisfies Record<GameId, { name: string; english: string; tag: string; category: string; description: string; first: string; board: string; rules: string[]; tip: string }>

export const gameIds = Object.keys(gameCatalog) as GameId[]
