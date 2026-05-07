import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

const games = [
  {
    to: '/gomoku',
    title: '五子棋',
    desc: '在 15×15 路连珠，攻防节奏快，适合碎片时间。',
    tag: '连珠 · 策略',
  },
  {
    to: '/xiangqi',
    title: '中国象棋',
    desc: '楚河汉界、车马炮兵，完整走子与将军逻辑。',
    tag: '传统 · 对弈',
  },
]

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.06 },
  },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
}

export function HomePage() {
  return (
    <main className="app-main">
      <h1 className="page-title">选择棋类</h1>
      <p className="page-sub">TypeScript + React + Vite，动效使用 Framer Motion；棋盘为 DOM / SVG + CSS。</p>
      <motion.div className="card-grid" variants={container} initial="hidden" animate="show">
        {games.map((g) => (
          <motion.div key={g.to} variants={item}>
            <Link to={g.to} className="game-card">
              <span className="tag">{g.tag}</span>
              <h2>{g.title}</h2>
              <p>{g.desc}</p>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </main>
  )
}
