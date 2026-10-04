import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GameArtwork } from '../components/GameArtwork'
import { ArrowIcon } from '../components/Icons'
import { gameCatalog, type BoardGameId } from '../gameCatalog'

export function ModeSelectPage({ game }: { game: BoardGameId }) {
  const meta = gameCatalog[game]
  return (
    <main className={`app-main mode-page theme-${game}`}>
      <nav className="breadcrumbs" aria-label="当前位置"><Link to="/">游戏大厅</Link><span>/</span><span>{meta.name}</span></nav>
      <div className="mode-layout">
        <div className="mode-illustration"><span className="eyebrow">{meta.english}</span><GameArtwork game={game} /><div className="mode-art-bottom"><span>{meta.board}</span><span>{meta.first}</span></div></div>
        <div className="mode-content"><p className="eyebrow">{meta.tag}</p><h1 className="page-title">{meta.name}</h1><p className="page-sub">{meta.description}</p><h2 className="mode-question">这一局，和谁下？</h2>
          <div className="mode-buttons">
            <motion.div whileHover={{ y: -3 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}><Link to="local" relative="path" className="mode-btn"><span className="mode-icon"><svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><circle cx="10" cy="9" r="4" stroke="currentColor" strokeWidth="1.5" /><path d="M2 24v-2a8 8 0 0 1 16 0v2M20 5a4 4 0 0 1 0 8m2 3a7 7 0 0 1 4 6v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></span><span className="mode-btn-copy"><strong>本地双人</strong><span>同一台设备，轮流落子。<br />和身边的朋友，认真下一盘。</span></span><ArrowIcon /></Link></motion.div>
            <motion.div whileHover={{ y: -3 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}><Link to="ai" relative="path" className="mode-btn"><span className="mode-icon"><svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="4" y="8" width="20" height="16" rx="5" stroke="currentColor" strokeWidth="1.5" /><path d="M14 8V4M1 15h3m20 0h3M10 19h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="10" cy="14" r="1.5" fill="currentColor" /><circle cx="18" cy="14" r="1.5" fill="currentColor" /><circle cx="14" cy="3" r="1.5" fill="currentColor" /></svg></span><span className="mode-btn-copy"><strong>人机练习</strong><span>你执先手，电脑陪你对弈。<br />更懂攻守，思考时间适中。</span></span><ArrowIcon /></Link></motion.div>
          </div><p className="mode-footnote"><span className="status-dot" />本地运行，无需账号或网络对手。</p>
        </div>
      </div>
      <details className="mode-rules"><summary>第一次玩？看看基本规则 <span>＋</span></summary><ol>{meta.rules.map(rule => <li key={rule}>{rule}</li>)}</ol></details>
    </main>
  )
}
