import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { GameArtwork } from '../components/GameArtwork'
import { ArrowIcon } from '../components/Icons'
import { gameCatalog, gameIds, isPuzzle } from '../gameCatalog'
import { gameGuides } from '../gameGuides'
import '../styles/lobby.css'

type Filter = 'all' | 'board' | 'puzzle'
const FILTERS: { id: Filter; label: string; count: number }[] = [
  { id: 'all', label: '全部游戏', count: 8 },
  { id: 'board', label: '棋类', count: 6 },
  { id: 'puzzle', label: '益智', count: 2 },
]

/** Two complete boards share a tabletop rather than a stack of floating cards. */
function LobbyArtwork() {
  const id = useId().replace(/:/g, '')
  const blocks = [
    [1, 0, 2, 2, '曹操'], [0, 0, 1, 2, '赵云'], [3, 0, 1, 2, '张飞'],
    [0, 2, 1, 2, '马超'], [3, 2, 1, 2, '黄忠'], [1, 2, 2, 1, '关羽'],
    [1, 3, 1, 1, '卒'], [2, 3, 1, 1, '卒'], [0, 4, 1, 1, '卒'], [3, 4, 1, 1, '卒'],
  ] as const
  return (
    <svg className="lobby-artwork" viewBox="0 0 640 450" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-wood`} x1="0" y1="0" x2="296" y2="296" gradientUnits="userSpaceOnUse"><stop stopColor="#eddbb4" /><stop offset="1" stopColor="#d0b481" /></linearGradient>
        <radialGradient id={`${id}-black`} cx=".3" cy=".24"><stop stopColor="#647365" /><stop offset=".45" stopColor="#293b30" /><stop offset="1" stopColor="#17261d" /></radialGradient>
        <radialGradient id={`${id}-white`} cx=".3" cy=".2"><stop stopColor="#fffef4" /><stop offset="1" stopColor="#e4e2d5" /></radialGradient>
        <filter id={`${id}-shadow`} x="-25%" y="-25%" width="160%" height="175%"><feDropShadow dx="2" dy="12" stdDeviation="11" floodColor="#3b513d" floodOpacity=".16" /></filter>
      </defs>
      <path d="M37 88c39-49 94-39 185-54 114-19 237-14 313 25 57 29 82 95 67 159-21 91-123 174-256 180C178 406-17 336 37 88Z" fill="#e6ebdb" />
      <path d="M91 71c116-43 319-59 430 19M64 357c114 45 349 63 473-16" stroke="#b5c4a4" strokeOpacity=".55" strokeDasharray="2 8" />
      <text x="78" y="69" fill="#6b8062" fontSize="13" letterSpacing="3">黑白之间</text><text x="425" y="84" fill="#9c8153" fontSize="13" letterSpacing="3">方寸腾挪</text>
      <g transform="translate(54 111) rotate(-7 148 148)" filter={`url(#${id}-shadow)`}>
        <rect y="8" width="296" height="296" rx="12" fill="#b79868" /><rect width="296" height="296" rx="12" fill={`url(#${id}-wood)`} /><rect x="11" y="11" width="274" height="274" rx="5" stroke="#ae925f" strokeOpacity=".4" />
        <g stroke="#947748" strokeWidth="1" opacity=".8">{Array.from({ length: 9 }, (_, index) => <g key={index}><path d={`M${24 + index * 31} 24v248`} /><path d={`M24 ${24 + index * 31}h248`} /></g>)}</g>
        {[[2, 2], [2, 6], [4, 4], [6, 2], [6, 6]].map(([col, row]) => <circle key={`${col}-${row}`} cx={24 + col * 31} cy={24 + row * 31} r="2.6" fill="#896d42" />)}
        {[[2, 2, 0], [3, 2, 0], [2, 3, 0], [3, 3, 1], [4, 2, 1], [4, 3, 1], [3, 4, 1], [5, 5, 0], [5, 6, 0], [6, 5, 1], [6, 6, 1], [5, 7, 0]].map(([col, row, white], index) => <circle key={index} cx={24 + col * 31} cy={24 + row * 31} r="13.3" fill={`url(#${id}-${white ? 'white' : 'black'})`} stroke={white ? '#d3cbb9' : '#243b2b'} strokeWidth=".7" />)}
        <circle cx="179" cy="241" r="3.4" stroke="#d1ae6d" strokeWidth="1.5" />
      </g>
      <g transform="translate(375 118) rotate(7 102 140)" filter={`url(#${id}-shadow)`}>
        <rect y="8" width="204" height="278" rx="12" fill="#a28c62" /><rect width="204" height="278" rx="12" fill="#cfbd95" /><rect x="10" y="10" width="184" height="245" rx="5" fill="#5d7257" />
        {blocks.map(([col, row, width, height, label], index) => <g key={index} transform={`translate(${12 + col * 46} ${12 + row * 49})`}>
          <rect width={width * 46 - 4} height={height * 49 - 4} rx="6" fill={index === 0 ? '#b38950' : index === 5 ? '#6b8564' : '#efe0b8'} stroke={index === 0 ? '#96713e' : index === 5 ? '#54724f' : '#b8a271'} />
          <rect x="4" y="4" width={width * 46 - 12} height={height * 49 - 12} rx="3" stroke={index === 0 || index === 5 ? '#edd7a45e' : '#b59b6655'} />
          <text x={(width * 46 - 4) / 2} y={(height * 49 - 4) / 2} textAnchor="middle" dominantBaseline="central" fontFamily="serif" fontSize={index === 0 ? 23 : 17} fill={index === 0 || index === 5 ? '#fff0d0' : '#5d6545'} style={height > width ? { writingMode: 'vertical-rl' } : {}}>{label}</text>
        </g>)}
        <path d="M65 266h74" stroke="#69835c" strokeWidth="4" strokeLinecap="round" />
      </g>
      <circle cx="336" cy="394" r="14" fill={`url(#${id}-black)`} /><circle cx="366" cy="405" r="14" fill={`url(#${id}-white)`} stroke="#d6d3c4" />
    </svg>
  )
}

export function HomePage() {
  const [filter, setFilter] = useState<Filter>('all')
  const reduced = useReducedMotion()
  const visibleGames = gameIds.filter(game => filter === 'all' || (filter === 'puzzle') === isPuzzle(game))
  return (
    <main className="app-main home-page lobby-page">
      <section className="lobby-hero" aria-labelledby="lobby-title">
        <motion.div className="lobby-hero-copy" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .35 }}>
          <p className="lobby-kicker"><span />棋弈 · 本地游艺场</p>
          <h1 id="lobby-title">下盘棋，<br /><span>也解个谜。</span></h1>
          <p className="lobby-hero-description">和朋友轮流下棋，或让电脑陪你练习。<br />一个人，也能从推箱子和华容道开始。</p>
          <div className="lobby-hero-actions"><button type="button" className="lobby-primary" onClick={() => document.getElementById('game-library')?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' })}>挑选游戏 <ArrowIcon /></button><Link to="/gomoku/ai" className="lobby-text-link">先来一局五子棋 <span aria-hidden="true">↗</span></Link></div>
          <div className="lobby-hero-facts"><div><strong>6 <span>种棋类</span></strong><span>双人对弈 / 单人练习</span></div><div><strong>2 <span>款益智</span></strong><span>自己解谜 / 随时撤销</span></div></div>
        </motion.div>
        <motion.div className="lobby-hero-scene" initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .5, delay: reduced ? 0 : .08 }}><LobbyArtwork /><div className="lobby-scene-caption"><span>一张桌，八种玩法</span><span>无需注册 · 打开即玩</span></div></motion.div>
      </section>
      <section className="lobby-library" id="game-library" aria-labelledby="library-title">
        <div className="lobby-library-heading"><div><p className="lobby-kicker">挑一个，马上开始</p><h2 id="library-title">今天，想玩哪一个？</h2></div><p>棋类可选朋友或电脑，益智游戏直接进入。</p></div>
        <div className="lobby-library-controls"><div className="lobby-filters" role="group" aria-label="按游戏类型筛选">{FILTERS.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} aria-controls="lobby-game-grid" onClick={() => setFilter(item.id)}><span>{item.label}</span><span className="lobby-filter-count">{item.count}</span></button>)}</div><span className="lobby-visible-count" aria-live="polite">显示 {visibleGames.length} 款游戏</span></div>
        <motion.div className="lobby-game-grid" id="lobby-game-grid" data-filter={filter} layout={!reduced}>
          <AnimatePresence initial={false} mode="popLayout">
            {visibleGames.map(game => {
              const meta = gameCatalog[game]
              const puzzle = isPuzzle(game)
              return <motion.article className={`lobby-game-card theme-${game}`} key={game} layout={!reduced} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -5 }} transition={{ duration: reduced ? 0 : .18, layout: { duration: reduced ? 0 : .28, ease: 'easeOut' } }}>
                <Link to={`/${game}`} className="lobby-card-art" aria-label={`${meta.name}，${puzzle ? '开始解谜' : '了解玩法与选择模式'}`}><span className="lobby-card-number">{String(gameIds.indexOf(game) + 1).padStart(2, '0')}</span><GameArtwork game={game} /><span className="lobby-card-type">{puzzle ? '单人解谜' : '双人 / 电脑'}</span></Link>
                <div className="lobby-card-copy"><span className="lobby-card-english">{meta.english}</span><h3><Link to={`/${game}`}>{meta.name}</Link></h3><p className="lobby-card-goal">{gameGuides[game].goal}</p><p className="lobby-card-meta"><span>{meta.board}</span><span>{meta.first}</span></p></div>
                <div className={`lobby-card-actions ${puzzle ? 'lobby-card-actions--puzzle' : ''}`}>{puzzle ? <Link to={`/${game}`} aria-label={`${meta.name}，开始解谜`}>开始解谜 <ArrowIcon /></Link> : <><Link to={`/${game}/local`} aria-label={`${meta.name}，与朋友双人对弈`}>与朋友 <ArrowIcon /></Link><Link to={`/${game}/ai`} aria-label={`${meta.name}，与电脑练习`}>与电脑 <ArrowIcon /></Link></>}</div>
              </motion.article>
            })}
          </AnimatePresence>
        </motion.div>
      </section>
      <section className="lobby-invitation"><span className="lobby-invitation-mark" aria-hidden="true">弈</span><div><h2>两个人，一台设备。</h2><p>不需要组房间。选好棋类，把设备放在中间，就能轮流走子。</p></div><Link to="/xiangqi/local" className="lobby-outline">一起下象棋 <ArrowIcon /></Link></section>
    </main>
  )
}
