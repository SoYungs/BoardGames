import { AnimatePresence, motion } from 'framer-motion'

export function GameResult({ result, onRestart }: { result: string | null; onRestart: () => void }) {
  return (
    <AnimatePresence>
      {result && <motion.div className="game-result" role="group" aria-label="对局结果" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .25 }}>
        <span className="result-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M7 4h10v5a5 5 0 0 1-10 0V4ZM7 5H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4M12 14v5m-4 1h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <div><span className="result-eyebrow">本局结束</span><strong>{result}</strong></div>
        <button type="button" onClick={onRestart}>再来一局 <span aria-hidden="true">↗</span></button>
      </motion.div>}
    </AnimatePresence>
  )
}
