import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { XiangqiGame } from '../games/xiangqi/XiangqiGame'

export function XiangqiPlayPage() {
  const { mode: raw } = useParams()
  const navigate = useNavigate()
  const mode = (raw ?? '').replace(/\/+$/, '').trim().toLowerCase()
  if (mode !== 'local' && mode !== 'ai') {
    return <Navigate to="/xiangqi" replace />
  }

  return (
    <main className="app-main">
      <button type="button" className="back-link" onClick={() => navigate('/xiangqi')}>
        ← 返回模式选择
      </button>
      <h1 className="page-title" style={{ marginTop: 20 }}>
        中国象棋 · {mode === 'ai' ? '人机' : '本地双人'}
      </h1>
      <XiangqiGame mode={mode} />
    </main>
  )
}
