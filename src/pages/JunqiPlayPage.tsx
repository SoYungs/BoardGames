import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { JunqiGame } from '../games/junqi/JunqiGame'

export function JunqiPlayPage() {
  const { mode: raw } = useParams()
  const navigate = useNavigate()
  const mode = (raw ?? '').replace(/\/+$/, '').trim().toLowerCase()
  if (mode !== 'local' && mode !== 'ai') {
    return <Navigate to="/junqi" replace />
  }

  return (
    <main className="app-main">
      <button type="button" className="back-link" onClick={() => navigate('/junqi')}>
        ← 返回模式选择
      </button>
      <h1 className="page-title" style={{ marginTop: 20 }}>
        中国军棋 · {mode === 'ai' ? '人机' : '本地双人'}
      </h1>
      <JunqiGame mode={mode} />
    </main>
  )
}
