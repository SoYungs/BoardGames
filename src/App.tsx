import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useEffect } from 'react'
import { BrandMark } from './components/Icons'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { HomePage } from './pages/HomePage'
import { ModeSelectPage } from './pages/ModeSelectPage'
import { GomokuPlayPage } from './pages/GomokuPlayPage'
import { XiangqiPlayPage } from './pages/XiangqiPlayPage'
import { ShogiPlayPage } from './pages/ShogiPlayPage'
import { ChessPlayPage } from './pages/ChessPlayPage'
import { JunqiPlayPage } from './pages/JunqiPlayPage'
import { GoPlayPage } from './pages/GoPlayPage'
import { SokobanPlayPage } from './pages/SokobanPlayPage'
import { HuarongPlayPage } from './pages/HuarongPlayPage'

/**
 * Hash 路由的路径来自 `#` 之后（如 `/#/xiangqi`），与 `import.meta.env.BASE_URL`（如 `/BoardGames/`）无关。
 * 若把仓库 base 当作 basename，则 `stripBasename('/', '/BoardGames')` 为 null，**所有路由失配 → 黑屏**。
 */
function AppRoutes() {
  const location = useLocation()
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [location.pathname])
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div className="route-stage" key={location.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .18 }}>
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/gomoku" element={<ModeSelectPage game="gomoku" />} />
            <Route path="/gomoku/:mode" element={<GomokuPlayPage />} />
            <Route path="/xiangqi" element={<ModeSelectPage game="xiangqi" />} />
            <Route path="/xiangqi/:mode" element={<XiangqiPlayPage />} />
            <Route path="/shogi" element={<ModeSelectPage game="shogi" />} />
            <Route path="/shogi/:mode" element={<ShogiPlayPage />} />
            <Route path="/chess" element={<ModeSelectPage game="chess" />} />
            <Route path="/chess/:mode" element={<ChessPlayPage />} />
            <Route path="/junqi" element={<ModeSelectPage game="junqi" />} />
            <Route path="/junqi/:mode" element={<JunqiPlayPage />} />
            <Route path="/go" element={<ModeSelectPage game="go" />} />
            <Route path="/go/:mode" element={<GoPlayPage />} />
            <Route path="/sokoban" element={<SokobanPlayPage />} />
            <Route path="/huarong" element={<HuarongPlayPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

function App() {
  return (
    <MotionConfig reducedMotion="user">
    <HashRouter>
      <a href="#main-content" className="skip-link" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>跳到主要内容</a>
      <div className="app-shell">
        <header className="app-header"><Link to="/" className="brand" aria-label="棋弈，返回首页"><BrandMark /><span>棋弈<span className="brand-en">BOARD GAMES</span></span></Link><nav className="header-nav" aria-label="主导航"><NavLink to="/" end>游戏大厅</NavLink><NavLink to="/gomoku">快速开局</NavLink></nav><span className="header-note"><span className="status-dot" />好棋，随时开局</span></header>
        <div id="main-content" tabIndex={-1} className="main-content"><RouteErrorBoundary><AppRoutes /></RouteErrorBoundary></div>
        <footer className="app-footer"><Link to="/" className="footer-brand">棋弈<span>落子之间，自有天地。</span></Link><span>六种棋类 · 两款益智游戏 · 随时开局</span><span className="footer-en">TAKE YOUR TIME. MAKE YOUR MOVE.</span></footer>
      </div>
    </HashRouter>
    </MotionConfig>
  )
}

export default App
