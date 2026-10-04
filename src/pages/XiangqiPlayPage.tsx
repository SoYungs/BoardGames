import { PlayScene } from '../components/PlayScene'
import { Navigate, useParams } from 'react-router-dom'
import { XiangqiGame } from '../games/xiangqi/XiangqiGame'

export function XiangqiPlayPage() {
  const { mode: raw } = useParams()
  const mode = (raw ?? '').replace(/\/+$/, '').trim().toLowerCase()
  if (mode !== 'local' && mode !== 'ai') {
    return <Navigate to="/xiangqi" replace />
  }

  return (
    <PlayScene game="xiangqi" mode={mode}>
      <XiangqiGame key={mode} mode={mode} />
    </PlayScene>
  )
}
