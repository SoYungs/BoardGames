import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { GomokuGame } from '../games/gomoku/GomokuGame'

export function GomokuPlayPage() {
  const { mode: raw } = useParams()
  const navigate = useNavigate()
  const mode = (raw ?? '').replace(/\/+$/, '').trim().toLowerCase()
  if (mode !== 'local' && mode !== 'ai') {
    return <Navigate to="/gomoku" replace />
  }

  return (
    <main className="app-main">
      <button type="button" className="back-link" onClick={() => navigate('/gomoku')}>
        ← 返回模式选择
      </button>
      <h1 className="page-title" style={{ marginTop: 20 }}>
        五子棋 · {mode === 'ai' ? '人机' : '本地双人'}
      </h1>
      <GomokuGame mode={mode} />
    </main>
  )
}
