import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion'

function ResultPanel({ result, onRestart, restartLabel, eyebrow }: {
  result: string; onRestart: () => void; restartLabel: string; eyebrow: string
}) {
  const reduced = useReducedMotion()
  const present = useIsPresent()
  return (
      <motion.div className="result-reveal" inert={!present} aria-hidden={!present ? true : undefined} initial={{ height: reduced ? 'auto' : 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: reduced ? 'auto' : 0, opacity: 0 }} transition={{ duration: reduced ? 0 : .28, ease: [.22, 1, .36, 1] }}>
        <div className="game-result" role="group" aria-label="对局结果">
          <span className="result-icon" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 40 40" fill="none"><path d="M12 7h16v8a8 8 0 0 1-16 0V7ZM12 9H7v4a6 6 0 0 0 7 6m14-10h5v4a6 6 0 0 1-7 6M20 24v7m-6 3h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="m20 10 1.4 2.8 3.1.5-2.3 2.2.5 3.1-2.7-1.4-2.7 1.4.5-3.1-2.3-2.2 3.1-.5Z" fill="currentColor" /></svg>
          </span>
          <div className="result-copy"><span className="result-eyebrow">{eyebrow}</span><strong>{result}</strong></div>
          <button type="button" onClick={event => {
            event.currentTarget.closest('.play-table')?.querySelector<HTMLElement>('.game-status-copy')?.focus({ preventScroll: true })
            onRestart()
          }}>{restartLabel} <span aria-hidden="true">↗</span></button>
          {!reduced && <svg className="result-sparks" viewBox="0 0 500 130" preserveAspectRatio="none" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <motion.circle key={i} cx={55+i*48} cy={68+(i%3)*13} r={i%2 ? 2 : 3} initial={{ opacity: 0, cy: 90 }} animate={{ opacity: [0, .7, 0], cy: 15+(i%3)*18 }} transition={{ duration: 1.2, delay: i*.055, ease: 'easeOut' }} />)}</svg>}
        </div>
      </motion.div>
  )
}

export function GameResult({ result, onRestart, restartLabel = '再来一局', eyebrow = '本局结束' }: {
  result: string | null; onRestart: () => void; restartLabel?: string; eyebrow?: string
}) {
  return <AnimatePresence initial={false}>{result && <ResultPanel result={result} onRestart={onRestart} restartLabel={restartLabel} eyebrow={eyebrow} />}</AnimatePresence>
}
