import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { gameCatalog, type PuzzleId } from '../gameCatalog'

export function PuzzleScene({ game, children }: { game: PuzzleId; children: ReactNode }) {
  const meta = gameCatalog[game]
  return (
    <main className={`app-main play-page theme-${game}`}>
      <nav className="breadcrumbs" aria-label="当前位置"><Link to="/">游戏大厅</Link><span>/</span><span>{meta.name}</span></nav>
      <div className="play-heading"><div><p className="eyebrow">{meta.english} · {meta.board}</p><h1 className="page-title">{meta.name}</h1></div><span className="mode-badge"><span className="status-dot" />{meta.first}</span></div>
      <div className="play-layout">
        <section className="play-table" aria-label={`${meta.name}游戏`}>{children}<p className="table-caption"><span />停一停，想好下一步。</p></section>
        <aside className="play-guide"><div className="guide-heading"><span className="eyebrow">HOW TO PLAY</span><h2>开始之前</h2></div><ol>{meta.rules.map(rule => <li key={rule}>{rule}</li>)}</ol><div className="guide-tip"><span>小提示</span><p>{meta.tip}</p></div><Link className="text-link puzzle-back" to="/">← 探索更多游戏</Link></aside>
      </div>
    </main>
  )
}
