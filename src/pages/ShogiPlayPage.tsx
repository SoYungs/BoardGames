import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ShogiGame } from '../games/shogi/ShogiGame'

export function ShogiPlayPage() {
  const { mode: raw } = useParams()
  const navigate = useNavigate()
  const mode = (raw ?? '').replace(/\/+$/, '').trim().toLowerCase()
  if (mode !== 'local' && mode !== 'ai') {
    return <Navigate to="/shogi" replace />
  }

  return (
    <main className="app-main">
      <button type="button" className="back-link" onClick={() => navigate('/shogi')}>
        ← 返回模式选择
      </button>
      <h1 className="page-title" style={{ marginTop: 20 }}>
        日本将棋 · {mode === 'ai' ? '人机' : '本地双人'}
      </h1>
      <ShogiGame key={mode} mode={mode} />
    </main>
  )
}
