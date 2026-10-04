import { motion, useReducedMotion } from 'framer-motion'

export function GameStatus({ status, thinking = false, sideLabel, sideTone = 'dark', detail }: {
  status: string
  thinking?: boolean
  sideLabel?: string
  sideTone?: 'dark' | 'light' | 'red' | 'blue'
  detail?: string
}) {
  const reduced = useReducedMotion()
  return (
    <div className={`game-status ${thinking ? 'game-status--thinking' : ''}`}>
      <span className={`game-status-token game-status-token--${sideTone}`} aria-hidden="true"><span /></span>
      <div className="game-status-body">
        <span className="game-status-label">{sideLabel ?? (thinking ? '电脑回合' : '当前回合')}</span>
        <p className="game-status-copy" role="status" aria-live="polite" tabIndex={-1} data-thinking={thinking}>
          <motion.span key={status} initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .16 }}>{status}</motion.span>
          {detail && <span className="game-status-detail">{detail}</span>}
        </p>
      </div>
      {thinking && <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>}
    </div>
  )
}
