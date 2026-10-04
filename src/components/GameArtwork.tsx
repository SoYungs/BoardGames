import { useId } from 'react'
import type { GameId } from '../gameCatalog'

export function GameArtwork({ game, hero = false }: { game: GameId; hero?: boolean }) {
  const id = useId().replace(/:/g, '')
  const isChess = game === 'chess'
  const isJunqi = game === 'junqi'
  const isGo = game === 'go'
  if (game === 'sokoban' || game === 'huarong') return (
    <svg className="game-artwork" viewBox="0 0 420 290" fill="none" aria-hidden="true">
      <defs><filter id={`${id}-puzzle-shadow`} x="-25%" y="-25%" width="160%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#263d32" floodOpacity=".16" /></filter><linearGradient id={`${id}-crate`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop stopColor="#e3bf81" /><stop offset="1" stopColor="#b88b50" /></linearGradient></defs>
      <g transform={game === 'sokoban' ? 'translate(80 40) rotate(-8 132 105)' : 'translate(126 30) rotate(-8 84 115)'} filter={`url(#${id}-puzzle-shadow)`}>
        {game === 'sokoban' ? <>
          <rect y="7" width="264" height="210" rx="12" fill="#b2b5a0" /><rect width="264" height="210" rx="12" fill="#e4e4d5" />
          {['######','# .  #','# $$ #','# @ .#','######'].map((row,r) => row.split('').map((cell,c) => <g key={`${r}-${c}`} transform={`translate(${8+c*41} ${6+r*39})`}>
            <rect width="39" height="37" rx="4" fill={cell === '#' ? '#738b71' : '#f6f1df'} stroke={cell === '#' ? '#60795d' : '#dbd7c2'} />
            {cell === '.' && <><circle cx="19.5" cy="18.5" r="10" stroke="#a4784c" strokeWidth="2" /><circle cx="19.5" cy="18.5" r="3" fill="#a4784c" /></>}
            {cell === '$' && <><rect x="2" y="1" width="35" height="35" rx="4" fill={`url(#${id}-crate)`} stroke="#ad8048" /><path d="m7 6 25 25M32 6 7 31M7 6h25v25H7Z" stroke="#9d743e" strokeWidth="2" /></>}
            {cell === '@' && <><circle cx="19.5" cy="13" r="7" fill="#ba7154" /><path d="M8 31c0-14 23-14 23 0" fill="#315d49" /></>}
          </g>))}
        </> : <>
          <rect y="7" width="168" height="224" rx="11" fill="#a98e66" /><rect width="168" height="224" rx="11" fill="#d8c39b" />
          {[[0,0,1,2,'張飛'],[1,0,2,2,'曹操'],[3,0,1,2,'趙雲'],[0,2,1,2,'馬超'],[1,2,2,1,'關羽'],[3,2,1,2,'黃忠'],[1,3,1,1,'卒'],[2,3,1,1,'卒'],[0,4,1,1,'卒'],[3,4,1,1,'卒']].map(([c,r,w,h,label],n) => <g key={n} transform={`translate(${5+Number(c)*40} ${5+Number(r)*42})`}>
            <rect width={Number(w)*40-3} height={Number(h)*42-3} rx="5" fill={n === 1 ? '#a85f48' : n === 4 ? '#66805c' : '#f1dfb8'} stroke={n === 1 ? '#934e3d' : '#b2996d'} />
            <text x={(Number(w)*40-3)/2} y={(Number(h)*42-3)/2} textAnchor="middle" dominantBaseline="central" fontFamily="serif" fontSize={n === 1 ? 23 : 13} fill={n === 1 || n === 4 ? '#fff0d3' : '#665836'} style={Number(w) === 1 && Number(h) === 2 ? {writingMode:'vertical-rl'} : {}}>{label}</text>
          </g>)}
          <path d="M58 222h52" stroke="#698357" strokeWidth="4" strokeLinecap="round" />
        </>}
      </g>
    </svg>
  )
  return (
    <svg className={`game-artwork ${hero ? 'game-artwork--hero' : ''}`} viewBox="0 0 420 290" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-wood`} x1="40" y1="0" x2="380" y2="290" gradientUnits="userSpaceOnUse"><stop stopColor={isJunqi ? '#426858' : '#e6cfa2'} /><stop offset="1" stopColor={isJunqi ? '#244237' : '#c4a475'} /></linearGradient>
        <radialGradient id={`${id}-black`} cx=".32" cy=".2"><stop stopColor="#58645a" /><stop offset="1" stopColor="#172720" /></radialGradient>
        <radialGradient id={`${id}-white`} cx=".32" cy=".2"><stop stopColor="#fffefa" /><stop offset="1" stopColor="#dddacf" /></radialGradient>
        <filter id={`${id}-shadow`} x="-30%" y="-30%" width="170%" height="180%"><feDropShadow dx="0" dy="9" stdDeviation="7" floodColor="#172b20" floodOpacity=".17" /></filter>
      </defs>
      <g transform="translate(54 32) rotate(-8 156 112)" filter={`url(#${id}-shadow)`}>
        <rect x="0" y="8" width="312" height="224" rx="12" fill={isJunqi ? '#243f33' : '#aa895b'} />
        <rect width="312" height="224" rx="12" fill={`url(#${id}-wood)`} />
        <rect x="12" y="12" width="288" height="200" rx="4" stroke={isJunqi ? '#83a28d' : '#a48a60'} strokeOpacity=".6" />
        {isChess ? Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => <rect key={`${r}-${c}`} x={24 + c * 33} y={13 + r * 25} width="33" height="25" fill={(r + c) % 2 ? '#557362' : '#eee5cf'} />)) : (
          <g stroke={isJunqi ? '#9cbc9f' : '#8d744f'} strokeWidth=".9" opacity=".7">
            {Array.from({ length: 9 }, (_, n) => <path key={`v${n}`} d={isGo ? `M${60 + n * 24} 16v192` : `M${28 + n * 32} 22v180`} />)}
            {Array.from({ length: isGo ? 9 : 7 }, (_, n) => <path key={`h${n}`} d={isGo ? `M60 ${16+n*24}h192` : `M28 ${22 + n * 30}h256`} />)}
          </g>
        )}
        {game === 'gomoku' && <g>{[[4,3,0],[3,3,1],[5,2,0],[4,4,1],[3,5,0],[5,4,1],[6,3,0]].map(([c,r,white], n) => <circle className={hero && n === 4 ? 'art-stone-float' : ''} key={n} cx={28 + c * 32} cy={22 + r * 30} r="13" fill={`url(#${id}-${white ? 'white' : 'black'})`} stroke={white ? '#c9c3b5' : '#152b22'} strokeWidth=".6" />)}</g>}
        {isGo && <g>{[[2,2,0],[3,2,0],[2,3,0],[3,3,1],[4,2,1],[4,3,1],[3,4,1],[6,6,0],[6,5,1],[5,6,0],[6,7,0],[2,6,1]].map(([c,r,white],n) => <circle key={n} cx={60+c*24} cy={16+r*24} r="10.5" fill={`url(#${id}-${white ? 'white' : 'black'})`} stroke={white ? '#c9c3b5' : '#152b22'} strokeWidth=".6" />)}{[[2,2],[4,4],[6,6]].map(([c,r]) => <circle key={`${c}-${r}`} cx={60+c*24} cy={16+r*24} r="2" fill="#8d744f" />)}</g>}
        {game === 'xiangqi' && <g>{[[2,2,'馬',0],[6,1,'車',1],[4,5,'帥',1],[3,4,'炮',1],[5,3,'卒',0]].map(([c,r,label,red], n) => <g key={n} transform={`translate(${28 + Number(c)*32} ${22 + Number(r)*30})`}><circle r="17" fill="#f6ead3" stroke={red ? '#a14e3d' : '#394337'} strokeWidth="1.5" /><circle r="13.5" stroke={red ? '#a14e3d' : '#394337'} strokeWidth=".5" /><text textAnchor="middle" dominantBaseline="central" fill={red ? '#a14e3d' : '#394337'} fontSize="21" fontFamily="serif">{label}</text></g>)}</g>}
        {game === 'shogi' && <g>{[[2,4,'飛'],[4,3,'銀'],[5,1,'王'],[6,4,'歩'],[3,1,'角']].map(([c,r,label], n) => <g key={n} transform={`translate(${28 + Number(c)*32} ${22 + Number(r)*30})`}><path d="M0-19 14-12 17 18h-34l3-30Z" fill="#f4e5bf" stroke="#9d814f" /><text textAnchor="middle" dominantBaseline="central" fill={n===2 ? '#9c4d3c' : '#374133'} fontSize="23" fontFamily="serif">{label}</text></g>)}</g>}
        {isChess && <g fontSize="55" fontFamily="Georgia, serif" textAnchor="middle">{[[3,5,'♞',0],[5,2,'♜',0],[2,3,'♙',1],[6,5,'♔',1]].map(([c,r,label,white], n) => <text key={n} x={40 + Number(c)*33} y={35 + Number(r)*25} fill={white ? '#fffdf3' : '#253c31'} stroke={white ? '#8c9a80' : '#172a21'} strokeWidth=".5">{label}</text>)}</g>}
        {isJunqi && <g>{[[2,2,'工兵',1],[4,4,'司令',1],[6,3,'?',0],[4,1,'?',0],[6,5,'軍旗',1]].map(([c,r,label,red], n) => <g key={n} transform={`translate(${28 + Number(c)*32} ${22 + Number(r)*30})`}><rect x="-24" y="-14" width="48" height="28" rx="5" fill={red ? '#a46450' : '#d8decf'} stroke={red ? '#d9ac90' : '#b0bdac'} /><text textAnchor="middle" dominantBaseline="central" fill={red ? '#fff2db' : '#3b584b'} fontSize="14" fontFamily="serif">{label}</text></g>)}</g>}
      </g>
      {hero && <g className="art-piece-float" transform="translate(325 209)"><circle r="39" fill="#f7edda" stroke="#b58757" strokeWidth="2" /><circle r="32" stroke="#ac5945" /><text y="2" textAnchor="middle" dominantBaseline="central" fontFamily="serif" fontSize="42" fill="#a6523e">弈</text></g>}
    </svg>
  )
}
