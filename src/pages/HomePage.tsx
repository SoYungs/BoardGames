import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GameArtwork } from '../components/GameArtwork'
import { ArrowIcon } from '../components/Icons'
import { gameCatalog, gameIds } from '../gameCatalog'

export function HomePage() {
  return (
    <main className="app-main home-page">
      <section className="home-hero">
        <motion.div className="hero-copy" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }}>
          <p className="eyebrow"><span className="small-rule" />一方棋盘 · 五种乐趣</p>
          <h1>慢下来，<br />下一盘<span>好棋。</span></h1>
          <p className="hero-description">和朋友面对面交锋，或与电脑练习。<br />五种经典棋类，打开就能开始。</p>
          <div className="hero-actions"><Link to="/gomoku" className="primary-button">开始一局 <ArrowIcon /></Link><button className="text-link" onClick={() => document.getElementById('game-library')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>探索全部棋类 <span>↓</span></button></div>
          <div className="hero-note"><span className="status-dot" />无需注册 <span className="note-divider">/</span> 即点即玩 <span className="note-divider">/</span> 本地对弈</div>
        </motion.div>
        <motion.div className="hero-visual" initial={{ opacity: 0, rotate: 3, scale: .96 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} transition={{ duration: .7, delay: .1 }}>
          <div className="hero-orbit hero-orbit--one" /><div className="hero-orbit hero-orbit--two" />
          <div className="hero-art-caption"><span>每一步，都有新可能</span><span>LET'S PLAY</span></div>
          <GameArtwork game="gomoku" hero />
          <span className="hero-seal">一局<br />一会</span>
        </motion.div>
      </section>
      <section className="game-library" id="game-library" aria-labelledby="library-title">
        <div className="section-heading"><div><p className="eyebrow">THE COLLECTION</p><h2 id="library-title">今天，想下哪一盘？</h2></div><span className="collection-count">05 <span>/ 经典棋类</span></span></div>
        <div className="card-grid">
          {gameIds.map((game, index) => {
            const meta = gameCatalog[game]
            return <motion.div className={`card-slot theme-${game}`} key={game} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ delay: index * .04, duration: .4 }}>
              <Link to={`/${game}`} className="game-card"><div className="card-art"><span className="card-number">0{index+1}</span><GameArtwork game={game} /><span className="card-arrow"><ArrowIcon diagonal /></span></div><div className="card-copy"><span className="card-english">{meta.english}</span><h3>{meta.name}<span className="tag">{meta.category}</span></h3><p>{meta.description}</p><div className="card-bottom"><span>{meta.first}</span><span>双人 / 人机 <ArrowIcon /></span></div></div></Link>
            </motion.div>
          })}
        </div>
      </section>
      <section className="home-invitation"><div className="invitation-icon">弈</div><div><h2>好对手，就在身边。</h2><p>把设备放在你们中间，轮流落子，让下一局成为一次相聚。</p></div><Link to="/xiangqi/local" className="outline-button">一起下棋 <ArrowIcon /></Link></section>
    </main>
  )
}
