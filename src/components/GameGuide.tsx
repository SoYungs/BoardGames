import { Link } from 'react-router-dom'
import { gameCatalog, isPuzzle, type GameId } from '../gameCatalog'
import { gameGuides } from '../gameGuides'

export function GameGuide({ game }: { game: GameId }) {
  const meta = gameCatalog[game]
  const guide = gameGuides[game]
  const puzzle = isPuzzle(game)
  return (
    <aside className="play-guide" aria-label={`${meta.name}玩法提示`}>
      <div className="guide-heading"><span className="eyebrow">HOW TO PLAY</span><h2>从这一步开始</h2></div>
      <ol className="guide-steps">{guide.steps.map((step, index) => <li key={step.title}><span className="guide-step-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
      <div className="guide-tip"><span>想一想</span><p>{meta.tip}</p></div>
      {!puzzle && <div className="board-legend" aria-label="棋盘标记说明">
        {game !== 'gomoku' && <span><i className="legend-selected" />{game === 'go' ? '选中棋块' : '选中棋子'}</span>}
        {game !== 'gomoku' && <span><i className="legend-target" />{game === 'go' ? '棋块的气' : '空位可走'}</span>}
        {game !== 'gomoku' && game !== 'go' && <span><i className="legend-capture" />{game === 'junqi' ? '可以交战' : '可以吃子'}</span>}
        <span><i className="legend-last" />刚走的一步</span>
      </div>}
      <details className="guide-rules"><summary>{puzzle ? '完整玩法规则' : '完整规则与胜负'}<span aria-hidden="true">＋</span></summary><ol>{meta.rules.map(rule => <li key={rule}>{rule}</li>)}</ol></details>
      <Link className="text-link" to={puzzle ? '/' : `/${game}`}>{puzzle ? '← 探索更多游戏' : '← 更换对战模式'}</Link>
    </aside>
  )
}
