import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export function ResponsiveBoard({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [zoomed, setZoomed] = useState(false)

  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    // Measure before first paint; narrow screens should never flash a full-size board.
    setScale(Math.min(1, element.getBoundingClientRect().width / width))
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [width])

  return (
    <div className="board-view">
      <div ref={container} className={`responsive-board ${zoomed ? 'responsive-board--zoomed' : ''}`} style={{ maxWidth: width, height: height * (zoomed ? 1 : scale) }}>
        <div className="responsive-board-content" style={{ width, transform: `scale(${zoomed ? 1 : scale})` }}>{children}</div>
      </div>
      {(scale < .85 || zoomed) && <div className="board-view-controls"><span>{zoomed && scale < 1 ? '左右滑动，查看棋盘' : '全盘视图'}</span><button type="button" aria-pressed={zoomed} onClick={() => setZoomed(current => !current)}>{zoomed ? '缩回全盘' : '放大查看'}<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.5" stroke="currentColor" /><path d="m10.5 10.5 3 3M5 7h4" stroke="currentColor" strokeLinecap="round" />{!zoomed && <path d="M7 5v4" stroke="currentColor" strokeLinecap="round" />}</svg></button></div>}
    </div>
  )
}
