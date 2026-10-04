import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { GameArtwork } from '../components/GameArtwork'
import { ArrowIcon } from '../components/Icons'
import { gameCatalog, type BoardGameId } from '../gameCatalog'
import { gameGuides } from '../gameGuides'
import '../styles/lobby.css'

function OpponentIcon({ computer = false }: { computer?: boolean }) {
  return computer ? <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true"><rect x="5" y="9" width="20" height="17" rx="5" stroke="currentColor" strokeWidth="1.5" /><path d="M15 9V4M2 17h3m20 0h3M11 21h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="11" cy="15" r="1.5" fill="currentColor" /><circle cx="19" cy="15" r="1.5" fill="currentColor" /><circle cx="15" cy="3" r="1.5" fill="currentColor" /></svg> : <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true"><circle cx="10" cy="9" r="4" stroke="currentColor" strokeWidth="1.5" /><path d="M2 26v-3a8 8 0 0 1 16 0v3M20 5a4 4 0 0 1 0 8m2 4a7 7 0 0 1 6 7v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
}

export function ModeSelectPage({ game }: { game: BoardGameId }) {
  const meta = gameCatalog[game]
  const guide = gameGuides[game]
  const reduced = useReducedMotion()
  return (
    <main className={`app-main mode-lobby theme-${game}`}>
      <nav className="mode-breadcrumbs" aria-label="当前位置"><Link to="/">游戏大厅</Link><span aria-hidden="true">/</span><span aria-current="page">{meta.name}</span></nav>
      <section className="mode-intro"><div><p className="lobby-kicker">{meta.english} · 先看看怎么玩</p><h1>{meta.name}</h1><p>{guide.goal}</p></div><dl className="mode-facts"><div><dt>棋盘</dt><dd>{meta.board}</dd></div><div><dt>开局</dt><dd>{meta.first}</dd></div></dl></section>
      <div className="mode-setup-grid">
        <div className="mode-board-preview"><GameArtwork game={game} /><div className="mode-preview-caption"><span>一台设备，就能开局</span><span>无需账号</span></div></div>
        <section className="mode-opponents" aria-labelledby="mode-choice-title"><h2 id="mode-choice-title">这一局，和谁下？</h2><p>选择一种方式，直接进入棋盘。</p><div className="mode-choice-grid">
          <motion.div whileHover={reduced ? undefined : { y: -3 }} transition={{ duration: reduced ? 0 : .18 }}><Link to="local" relative="path" className="mode-choice mode-choice--local"><span className="mode-choice-icon"><OpponentIcon /></span><span className="mode-choice-number">01</span><h3>和朋友下</h3><p>两个人共用一台设备，<br />轮流操作自己的棋子。</p><span className="mode-choice-note">面对面 · 本地双人</span><span className="mode-choice-cta">开始双人对弈 <ArrowIcon /></span></Link></motion.div>
          <motion.div whileHover={reduced ? undefined : { y: -3 }} transition={{ duration: reduced ? 0 : .18 }}><Link to="ai" relative="path" className="mode-choice mode-choice--ai"><span className="mode-choice-icon"><OpponentIcon computer /></span><span className="mode-choice-number">02</span><h3>和电脑练习</h3><p>你执先手，电脑执后手。<br />轮到你时，按提示走棋。</p><span className="mode-choice-note">一个人 · 电脑对手</span><span className="mode-choice-cta">开始人机练习 <ArrowIcon /></span></Link></motion.div>
        </div><p className="mode-local-note"><span className="status-dot" />对局在本机运行，支持不限次数悔棋。</p></section>
      </div>
      <section className="mode-first-steps" aria-labelledby="mode-steps-title"><div className="mode-steps-heading"><p className="lobby-kicker">第一次玩也能上手</p><h2 id="mode-steps-title">两步，走出第一手</h2></div><ol>{guide.steps.slice(0, 2).map((step, index) => <li key={step.title}><span className="mode-step-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol></section>
      <details className="mode-complete-rules"><summary><span><strong>完整规则与本作说明</strong><span>看看走法、胜负条件和规则边界</span></span><span className="mode-rules-toggle" aria-hidden="true">＋</span></summary><ol>{meta.rules.map(rule => <li key={rule}>{rule}</li>)}</ol><div className="mode-rule-tip"><strong>给新手的小提示</strong><p>{meta.tip}</p></div></details>
    </main>
  )
}
