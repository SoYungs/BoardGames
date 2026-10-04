import { PlayScene } from '../components/PlayScene'
import { Navigate, useParams } from 'react-router-dom'
import { ShogiGame } from '../games/shogi/ShogiGame'

export function ShogiPlayPage() {
  const { mode: raw } = useParams()
  const mode = (raw ?? '').replace(/\/+$/, '').trim().toLowerCase()
  if (mode !== 'local' && mode !== 'ai') {
    return <Navigate to="/shogi" replace />
  }

  return (
    <PlayScene game="shogi" mode={mode}>
      <ShogiGame key={mode} mode={mode} />
    </PlayScene>
  )
}
