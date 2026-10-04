import type { PieceType, Side } from '../games/chess/chessTypes'

// Native SVG keeps the six silhouettes consistent across systems and screen sizes.
export function ChessPieceGlyph({ type, side }: { type: PieceType; side: Side }) {
  const fill = side === 'white' ? '#fff9e9' : '#2c4434'
  const edge = side === 'white' ? '#536447' : '#1f3427'
  const detail = side === 'white' ? '#7b886c' : '#a2b493'
  return <svg className="chess-piece-glyph" viewBox="0 0 48 48" fill={fill} stroke={edge} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {type === 'p' && <><circle cx="24" cy="13" r="6" /><path d="M18 21h12v4c-4 5-3 9 3 13H15c6-4 7-8 3-13Z" /><path d="M17 22h14" stroke={detail} /></>}
    {type === 'r' && <><path d="M13 8h6v6h5V8h5v6h5V8h6v13l-6 4 1 12H18l1-12-6-4Z" transform="translate(-2 0)" /><path d="M16 20h16M19 27h10" stroke={detail} /></>}
    {type === 'n' && <><path d="m15 35 4-12-6 2-5-5 9-10 10-4 3 5c9 4 12 13 8 26H15Z" /><path d="m15 14 7 1-6 9M27 12c6 5 6 14 1 20" stroke={detail} fill="none" /><circle cx="22" cy="13" r="1.3" fill={edge} stroke="none" /></>}
    {type === 'b' && <><path d="M24 6c-4 4-10 10-8 15 1 3 4 4 5 7l-5 10h16l-5-10c1-3 4-4 5-7 2-5-4-11-8-15Z" /><path d="m25 10-5 8M18 26h12M19 33h10" stroke={detail} fill="none" /><circle cx="24" cy="5" r="2" /></>}
    {type === 'q' && <><path d="m12 12 5 6 3-9 4 9 4-9 3 9 5-6-4 14-3 3 4 9H15l4-9-3-3Z" /><path d="M17 25h14M19 30h10" stroke={detail} /><circle cx="12" cy="11" r="2" /><circle cx="20" cy="8" r="2" /><circle cx="28" cy="8" r="2" /><circle cx="36" cy="11" r="2" /></>}
    {type === 'k' && <><path d="M22 3h4v4h4v4h-4v5h-4v-5h-4V7h4Z" /><path d="M24 18c-7-8-14-3-11 4l6 7-3 9h16l-3-9 6-7c3-7-4-12-11-4Z" /><path d="M18 27h12M19 31h10" stroke={detail} fill="none" /></>}
    <path d="M15 36h18l3 5H12Z" /><path d="M12 41h24v3H12Z" />
  </svg>
}
