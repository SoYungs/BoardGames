import { Navigate, useParams } from 'react-router-dom'
import { PlayScene } from '../components/PlayScene'
import { GoGame } from '../games/go/GoGame'

export function GoPlayPage() {
  const { mode: raw } = useParams()
  const mode = (raw ?? '').replace(/\/+$/, '').trim().toLowerCase()
  if (mode !== 'local' && mode !== 'ai') return <Navigate to="/go" replace />
  return <PlayScene game="go" mode={mode}><GoGame key={mode} mode={mode} /></PlayScene>
}
