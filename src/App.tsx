import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { HomePage } from './pages/HomePage'
import { ModeSelectPage } from './pages/ModeSelectPage'
import { GomokuPlayPage } from './pages/GomokuPlayPage'
import { XiangqiPlayPage } from './pages/XiangqiPlayPage'

/**
 * Hash 路由的路径来自 `#` 之后（如 `/#/xiangqi`），与 `import.meta.env.BASE_URL`（如 `/BoardGames/`）无关。
 * 若把仓库 base 当作 basename，则 `stripBasename('/', '/BoardGames')` 为 null，**所有路由失配 → 黑屏**。
 */
function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <header className="app-header">
          <h1>棋弈</h1>
        </header>
        <RouteErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/gomoku" element={<ModeSelectPage game="gomoku" />} />
            <Route path="/gomoku/:mode" element={<GomokuPlayPage />} />
            <Route path="/xiangqi" element={<ModeSelectPage game="xiangqi" />} />
            <Route path="/xiangqi/:mode" element={<XiangqiPlayPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RouteErrorBoundary>
        <footer className="app-footer">
          部署到 GitHub Pages 时请在构建环境设置 <code>VITE_BASE=/仓库名/</code>，并启用 Pages（见仓库内
          workflow 示例）。
        </footer>
      </div>
    </HashRouter>
  )
}

export default App
