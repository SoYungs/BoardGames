import { PlayScene } from '../components/PlayScene'
import { Navigate, useParams } from 'react-router-dom'
import { ChessGame } from '../games/chess/ChessGame'

export function ChessPlayPage() {
  const { mode: raw } = useParams()
  const mode = (raw ?? '').replace(/\/+$/, '').trim().toLowerCase()
  if (mode !== 'local' && mode !== 'ai') {
    return <Navigate to="/chess" replace />
  }

  return (
    <PlayScene game="chess" mode={mode}>
      <ChessGame key={mode} mode={mode} />
    </PlayScene>
  )
}
