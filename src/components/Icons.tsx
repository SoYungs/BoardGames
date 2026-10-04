export function ArrowIcon({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h16m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function BrandMark() {
  return <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect width="34" height="34" rx="10" fill="#284b40" /><path d="M9 8v18M17 8v18M25 8v18M8 9h18M8 17h18M8 25h18" stroke="#a8beb0" strokeWidth=".7" /><circle cx="13" cy="13" r="5" fill="#f5f1e7" /><circle cx="21" cy="21" r="5" fill="#152e26" stroke="#c7d4c8" strokeWidth=".6" /></svg>
}
