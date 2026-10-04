import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { gameCatalog, type PuzzleId } from '../gameCatalog'
import { gameGuides } from '../gameGuides'
import { GameGuide } from './GameGuide'

export function PuzzleScene({ game, children }: { game: PuzzleId; children: ReactNode }) {
  const meta = gameCatalog[game]
  return (
    <main className={`app-main play-page theme-${game}`}>
      <nav className="breadcrumbs" aria-label="当前位置"><Link to="/">游戏大厅</Link><span>/</span><span>{meta.name}</span></nav>
      <div className="play-heading"><div><p className="eyebrow">{meta.english} · {meta.board}</p><h1 className="page-title">{meta.name}</h1><p className="play-goal">{gameGuides[game].goal}</p></div><span className="mode-badge"><span className="status-dot" />{meta.first}</span></div>
      <div className="play-layout">
        <section className="play-table" aria-label={`${meta.name}游戏`}>{children}<p className="table-caption"><span />停一停，想好下一步。</p></section>
        <GameGuide game={game} />
      </div>
    </main>
  )
}
