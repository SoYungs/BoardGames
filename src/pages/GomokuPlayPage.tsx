import { PlayScene } from '../components/PlayScene'
import { Navigate, useParams } from 'react-router-dom'
import { GomokuGame } from '../games/gomoku/GomokuGame'

export function GomokuPlayPage() {
  const { mode: raw } = useParams()
  const mode = (raw ?? '').replace(/\/+$/, '').trim().toLowerCase()
  if (mode !== 'local' && mode !== 'ai') {
    return <Navigate to="/gomoku" replace />
  }

  return (
    <PlayScene game="gomoku" mode={mode}>
      <GomokuGame key={mode} mode={mode} />
    </PlayScene>
  )
}
