import { PlayScene } from '../components/PlayScene'
import { Navigate, useParams } from 'react-router-dom'
import { JunqiGame } from '../games/junqi/JunqiGame'

export function JunqiPlayPage() {
  const { mode: raw } = useParams()
  const mode = (raw ?? '').replace(/\/+$/, '').trim().toLowerCase()
  if (mode !== 'local' && mode !== 'ai') {
    return <Navigate to="/junqi" replace />
  }

  return (
    <PlayScene game="junqi" mode={mode}>
      <JunqiGame key={mode} mode={mode} />
    </PlayScene>
  )
}
