import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { gameCatalog, type BoardGameId } from '../gameCatalog'

export function PlayScene({ game, mode, children }: { game: BoardGameId; mode: 'local' | 'ai'; children: ReactNode }) {
  const meta = gameCatalog[game]
  return (
    <main className={`app-main play-page theme-${game}`}>
      <nav className="breadcrumbs" aria-label="当前位置"><Link to="/">游戏大厅</Link><span>/</span><Link to={`/${game}`}>{meta.name}</Link><span>/</span><span>{mode === 'ai' ? '人机练习' : '双人对弈'}</span></nav>
      <div className="play-heading"><div><p className="eyebrow">{meta.english} · {meta.board}</p><h1 className="page-title">{meta.name}</h1></div><span className="mode-badge"><span className="status-dot" />{mode === 'ai' ? '人机练习' : '本地双人'}</span></div>
      <div className="play-layout">
        <section className="play-table" aria-label={`${meta.name}对局`}>{children}<p className="table-caption"><span />{mode === 'ai' ? '你的下一步，值得认真思考。' : '面对面，轮流落子。'}</p></section>
        <aside className="play-guide"><div className="guide-heading"><span className="eyebrow">HOW TO PLAY</span><h2>落子之前</h2></div><ol>{meta.rules.map(rule => <li key={rule}>{rule}</li>)}</ol><div className="guide-tip"><span>小提示</span><p>{meta.tip}</p></div><div className="board-legend"><span><i className="legend-selected" />{game === 'go' ? '选中棋块' : '选中棋子'}</span><span><i className="legend-target" />{game === 'go' ? '棋块的气' : '可走位置'}</span><span><i className="legend-last" />上一步</span></div><Link className="text-link" to={`/${game}`}>← 更换对战模式</Link></aside>
      </div>
    </main>
  )
}
