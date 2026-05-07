import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { HomePage } from './pages/HomePage'
import { ModeSelectPage } from './pages/ModeSelectPage'
import { GomokuPlayPage } from './pages/GomokuPlayPage'
import { XiangqiPlayPage } from './pages/XiangqiPlayPage'

/** Vite `base: './'` 时 BASE_URL 为 `./`，不能交给 HashRouter 当 basename */
function routerBasename(): string | undefined {
  const b = import.meta.env.BASE_URL
  if (!b || b === '/' || b === './') return undefined
  return b.endsWith('/') ? b.slice(0, -1) : b
}

function App() {
  return (
    <HashRouter basename={routerBasename()}>
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
