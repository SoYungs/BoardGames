import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

type GameId = 'gomoku' | 'xiangqi' | 'shogi' | 'chess' | 'junqi'

const copy: Record<GameId, { title: string; subtitle: string }> = {
  gomoku: {
    title: '五子棋',
    subtitle: '连成五子即胜。支持本机双人与简单人机。',
  },
  xiangqi: {
    title: '中国象棋',
    subtitle: '红先黑后，含将军检测与「将帅照面」限制。',
  },
  shogi: {
    title: '日本将棋',
    subtitle: '先手后手对弈，支持持子打入、升变与王手。',
  },
  chess: {
    title: '国际象棋',
    subtitle: '白先黑后，含易位、吃过路兵、升变与将军。',
  },
  junqi: {
    title: '中国军棋',
    subtitle: '暗棋随机布阵，铁路公路移动与等级战斗。',
  },
}

export function ModeSelectPage({ game }: { game: GameId }) {
  const meta = copy[game]
  const navigate = useNavigate()

  return (
    <main className="app-main">
      <button type="button" className="back-link" onClick={() => navigate('/')}>
        ← 返回首页
      </button>
      <h1 className="page-title" style={{ marginTop: 20 }}>
        {meta.title}
      </h1>
      <p className="page-sub">{meta.subtitle}</p>
      <motion.div
        className="mode-buttons"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <Link to="local" relative="path" className="mode-btn">
          <strong>本地双人对战</strong>
          <span>同一设备轮流落子，适合面对面娱乐。</span>
        </Link>
        <Link to="ai" relative="path" className="mode-btn">
          <strong>人机对战</strong>
          <span>与内置 AI 对局（难度偏休闲，后续可加强）。</span>
        </Link>
      </motion.div>
    </main>
  )
}
