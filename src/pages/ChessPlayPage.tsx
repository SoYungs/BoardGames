import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ChessGame } from '../games/chess/ChessGame'

export function ChessPlayPage() {
  const { mode: raw } = useParams()
  const navigate = useNavigate()
  const mode = (raw ?? '').replace(/\/+$/, '').trim().toLowerCase()
  if (mode !== 'local' && mode !== 'ai') {
    return <Navigate to="/chess" replace />
  }

  return (
    <main className="app-main">
      <button type="button" className="back-link" onClick={() => navigate('/chess')}>
        ← 返回模式选择
      </button>
      <h1 className="page-title" style={{ marginTop: 20 }}>
        国际象棋 · {mode === 'ai' ? '人机' : '本地双人'}
      </h1>
      <ChessGame mode={mode} />
    </main>
  )
}
