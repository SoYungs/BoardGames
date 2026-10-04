import { motion, useReducedMotion } from 'framer-motion'

type Point = { x: number; y: number }

/** A short trace explains a completed move; it never delays or intercepts play. */
export function BoardEffects({ width, height, from, to, eventKey, kind = 'move' }: {
  width: number; height: number; from?: Point; to?: Point; eventKey: string | number; kind?: 'move' | 'capture' | 'place'
}) {
  const reduced = useReducedMotion()
  if (reduced || !to || eventKey === '') return null
  return (
    <svg className={`board-effects board-effects--${kind}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <motion.g key={eventKey}>
        {from && <motion.path d={`M${from.x} ${from.y}L${to.x} ${to.y}`} fill="none" strokeLinecap="round" strokeWidth="2.2" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1], opacity: [0, .6, 0] }} transition={{ duration: .65, times: [0, .45, 1], ease: 'easeOut' }} />}
        <motion.circle cx={to.x} cy={to.y} fill="none" strokeWidth="1.8" initial={{ r: 7, opacity: .7 }} animate={{ r: [7, 22, 30], opacity: [.7, .4, 0] }} transition={{ duration: .65, ease: 'easeOut' }} />
        <motion.circle cx={to.x} cy={to.y} r="18" className="board-arrival-glow" initial={{ opacity: .3 }} animate={{ opacity: 0 }} transition={{ duration: .5 }} />
        {kind === 'capture' && Array.from({ length: 6 }, (_, index) => {
          const angle = index * Math.PI / 3
          return <motion.circle key={index} r="2.2" initial={{ cx: to.x + Math.cos(angle) * 13, cy: to.y + Math.sin(angle) * 13, opacity: .8 }} animate={{ cx: to.x + Math.cos(angle) * 35, cy: to.y + Math.sin(angle) * 35, opacity: 0 }} transition={{ duration: .55, ease: 'easeOut' }} />
        })}
      </motion.g>
    </svg>
  )
}
