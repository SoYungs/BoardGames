import { GameResult } from '../../components/GameResult'
import { GameStatus } from '../../components/GameStatus'
import { BoardEffects } from '../../components/BoardEffects'
import { InteractionHint } from '../../components/InteractionHint'
import '../../styles/moving-games.css'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { AnimatePresence, motion, useReducedMotion, useIsPresent } from 'framer-motion'
import { ResponsiveBoard } from '../../components/ResponsiveBoard'
import { scheduleAiMove, type AiFailure } from '../../workers/scheduleAiMove'
import { getUndoIndex } from '../undo'
import { applyMove, createInitialBoard, snapshotBoard } from './xiangqiBoard'
import type { XiangqiAnalysis } from './xiangqiAi'
import type { Board, Move, Side } from './xiangqiTypes'
import { pieceChar } from './xiangqiTypes'
import { getXiangqiRepetitionResult, getXiangqiRepetitionWarning } from './xiangqiRepetition'
import {
  clearXiangqiSession,
  loadXiangqiSession,
  parseXiangqiSession,
  saveXiangqiSession,
  serializeXiangqiSession,
  type XiangqiDepth,
  type XiangqiSnap,
} from './xiangqiSession'
import {
  getXiangqiWinner,
  inCheck,
  legalMovesFromChecked,
} from './xiangqiMoves'

type Mode = 'local' | 'ai'

const CELL = 44
const PAD = 28

export function XiangqiGame({ mode }: { mode: Mode }) {
  const [initial] = useState(() => {
    const saved = loadXiangqiSession(mode)
    const state = saved.state ?? { board: createInitialBoard(), turn: 'red' as Side, selected: null, winner: null, lastMove: null, history: [], depth: 8 as XiangqiDepth, repetitionResult: null }
    // Re-evaluate unfinished saves, including versions written before repetition adjudication.
    const repetitionResult = state.repetitionResult ?? (!state.winner ? getXiangqiRepetitionResult(state.history, state.board, state.turn) : null)
    return { kind: saved.kind, state: { ...state, selected: mode === 'ai' && state.turn === 'black' ? null : state.selected, repetitionResult, winner: repetitionResult?.kind === 'perpetual-check' ? repetitionResult.winner : state.winner } }
  })
  const [board, setBoard] = useState<Board>(initial.state.board)
  const [turn, setTurn] = useState<Side>(initial.state.turn)
  const [selected, setSelected] = useState<[number, number] | null>(initial.state.selected)
  const [winner, setWinner] = useState<Side | null>(initial.state.winner)
  const [lastMove, setLastMove] = useState<Move | null>(initial.state.lastMove)
  const [history, setHistory] = useState<XiangqiSnap[]>(initial.state.history)
  const [repetitionResult, setRepetitionResult] = useState(initial.state.repetitionResult)
  const [aiError, setAiError] = useState<AiFailure | null>(null)
  const [depth, setDepth] = useState<XiangqiDepth>(initial.state.depth)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'pending' | 'quota' | 'unavailable'>(initial.kind === 'restored' ? 'saved' : initial.kind === 'unavailable' ? 'unavailable' : 'pending')
  const [transferMessage, setTransferMessage] = useState(initial.kind === 'restored' ? '已恢复本标签页的棋局和悔棋记录。' : initial.kind === 'invalid' ? '保存的棋局数据损坏，无法恢复；已开启新局。' : '')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteJson, setPasteJson] = useState('')
  const [analysis, setAnalysis] = useState<XiangqiAnalysis | null>(null)
  const [moveEffect, setMoveEffect] = useState<{ move: Move; eventKey: number; kind: 'move' | 'capture' | 'place' } | null>(null)
  const [boardEpoch, setBoardEpoch] = useState(0)
  const effectSequence = useRef(0)
  const aiCancelRef = useRef<(() => void) | null>(null)
  const importSequence = useRef(0)
  const positionRevision = useRef(0)
  const importMounted = useRef(true)
  const reduceMotion = useReducedMotion()
  const present = useIsPresent()
  const presentRef = useRef(present)
  const gameOver = winner !== null || repetitionResult?.kind === 'repetition-draw'

  useLayoutEffect(() => { presentRef.current = present }, [present])
  useEffect(() => {
    const mounted = importMounted
    const sequence = importSequence
    mounted.current = true
    return () => { mounted.current = false; sequence.current++ }
  }, [])

  useLayoutEffect(() => {
    positionRevision.current++
    // Write synchronously with the committed position, before a refresh or route change.
    const result = saveXiangqiSession(mode, { board, turn, selected, winner, lastMove, history, depth, repetitionResult })
    let active = true
    // Saving is an external effect; report its result after this commit without a synchronous render loop.
    queueMicrotask(() => { if (active) setSaveStatus(result.ok ? 'saved' : result.reason) })
    return () => { active = false }
  }, [mode, board, turn, selected, winner, lastMove, history, depth, repetitionResult])

  const boardForAiRef = useRef(board)
  useLayoutEffect(() => {
    boardForAiRef.current = board
  }, [board])

  const humanSide: Side = 'red'
  const aiSide: Side = 'black'

  const targets = useMemo(() => {
    if (!selected) return [] as Move[]
    const [r, c] = selected
    if (board[r][c]?.side !== turn) return [] as Move[]
    return legalMovesFromChecked(board, r, c)
  }, [board, selected, turn])

  const isCheck = useMemo(() => !gameOver && inCheck(board, turn), [gameOver, board, turn])
  const repetitionWarning = useMemo(() => gameOver ? null : getXiangqiRepetitionWarning(history, board, turn), [gameOver, history, board, turn])

  const status = useMemo(() => {
    if (repetitionResult?.kind === 'perpetual-check') return `${repetitionResult.offender === 'red' ? '红方' : '黑方'}长将判负 · ${repetitionResult.winner === 'red' ? '红方' : '黑方'}胜`
    if (repetitionResult?.kind === 'repetition-draw') return '重复局面 · 和棋'
    if (winner) return `${winner === 'red' ? '红方' : '黑方'} 胜`
    if (aiError) return `${aiError.kind === 'timeout' ? '电脑计算超时' : '电脑计算遇到问题'} · ${saveStatus === 'saved' ? '棋局已保留' : '棋局仍在本页'}`
    if (mode === 'ai' && turn === aiSide) return '电脑思考中…'
    const sideLabel = turn === 'red' ? '红方' : '黑方'
    const chk = isCheck ? ' · 将军！' : ''
    return `${sideLabel} 行棋${chk}`
  }, [winner, repetitionResult, mode, turn, aiSide, isCheck, aiError, saveStatus])

  const reset = useCallback(() => {
    importSequence.current++
    aiCancelRef.current?.()
    aiCancelRef.current = null
    clearXiangqiSession(mode)
    setBoard(createInitialBoard())
    setTurn('red')
    setSelected(null)
    setWinner(null)
    setLastMove(null)
    setHistory([])
    setRepetitionResult(null)
    setAiError(null)
    setTransferMessage('')
    setPasteOpen(false)
    setPasteJson('')
    setAnalysis(null)
    setMoveEffect(null)
    setBoardEpoch(epoch => epoch + 1)
  }, [mode])

  const retryAi = useCallback(() => {
    if (gameOver || mode !== 'ai' || turn !== aiSide) return
    aiCancelRef.current?.()
    aiCancelRef.current = null
    setAnalysis(null)
    setAiError(null)
  }, [gameOver, mode, turn, aiSide])

  const exportGame = () => {
    try {
      const json = serializeXiangqiSession(mode, { board, turn, selected, winner, lastMove, history, depth, repetitionResult })
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `boardgames-xiangqi-${mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setTransferMessage('已导出当前棋局和完整悔棋记录。')
    } catch {
      setTransferMessage('棋局导出失败，请重试，并保持本页面。')
    }
  }

  const restoreGame = (raw: string): boolean => {
    const state = parseXiangqiSession(raw, mode)
    if (!state) {
      setTransferMessage('内容不是有效的当前模式象棋棋局，未改变正在进行的对局。')
      return false
    }
    const repeated = state.repetitionResult ?? (!state.winner ? getXiangqiRepetitionResult(state.history, state.board, state.turn) : null)
    aiCancelRef.current?.()
    aiCancelRef.current = null
    setBoard(state.board)
    setTurn(state.turn)
    setSelected(mode === 'ai' && state.turn === 'black' ? null : state.selected)
    setWinner(repeated?.kind === 'perpetual-check' ? repeated.winner : state.winner)
    setLastMove(state.lastMove)
    setHistory(state.history)
    setDepth(state.depth)
    setRepetitionResult(repeated)
    setAiError(null)
    setAnalysis(null)
    setMoveEffect(null)
    setBoardEpoch(epoch => epoch + 1)
    setTransferMessage(`已导入棋局及 ${state.history.length} 手悔棋记录。${state.history.length === 0 ? '此文件不含此前悔棋记录。' : ''}`)
    return true
  }

  const importGame = async (input: HTMLInputElement) => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const request = ++importSequence.current
    const revision = positionRevision.current
    const isCurrent = () => importMounted.current && presentRef.current && request === importSequence.current
    setTransferMessage('正在读取棋局文件…')
    try {
      const raw = await file.text()
      if (!isCurrent()) return
      if (revision !== positionRevision.current) {
        setTransferMessage('读取期间棋局已改变，本次导入已取消；请重新选择文件。')
        return
      }
      restoreGame(raw)
    } catch {
      if (isCurrent()) setTransferMessage('无法读取棋局文件，未改变正在进行的对局。')
    }
  }

  const undo = useCallback(() => {
    const index = getUndoIndex(history, mode, humanSide)
    if (index < 0) return
    importSequence.current++
    aiCancelRef.current?.()
    aiCancelRef.current = null
    const prev = history[index]
    setHistory(history.slice(0, index))
    setBoard(snapshotBoard(prev.board))
    setTurn(prev.turn)
    setLastMove(prev.lastMove)
    setWinner(prev.winner)
    setRepetitionResult(prev.repetitionResult)
    setSelected(mode === 'local' ? prev.selected : null)
    setAiError(null)
    setTransferMessage('')
    setAnalysis(null)
    setMoveEffect(null)
    setBoardEpoch(epoch => epoch + 1)
  }, [mode, history, humanSide])

  const tryMove = useCallback(
    (m: Move) => {
      const nextHistory = [
        ...history,
        {
          board: snapshotBoard(board),
          turn,
          lastMove,
          winner,
          selected,
          repetitionResult,
        },
      ]
      setHistory(nextHistory)
      const cap = board[m.toR][m.toC]
      const next = applyMove(board, m.fromR, m.fromC, m.toR, m.toC)
      setMoveEffect({ move: m, eventKey: ++effectSequence.current, kind: cap ? 'capture' : 'move' })
      setLastMove(m)
      setBoard(next)
      setSelected(null)
      const opp: Side = turn === 'red' ? 'black' : 'red'
      if (cap?.type === 'k') {
        setWinner(turn)
        return
      }
      const nextTurn = opp
      const nextWinner = getXiangqiWinner(next, nextTurn)
      if (nextWinner) {
        setWinner(nextWinner)
        return
      }
      const repeated = getXiangqiRepetitionResult(nextHistory, next, nextTurn)
      setRepetitionResult(repeated)
      if (repeated?.kind === 'perpetual-check') setWinner(repeated.winner)
      setTurn(nextTurn)
    },
    [board, turn, lastMove, winner, selected, history, repetitionResult],
  )

  useEffect(() => {
    if (!present || gameOver || aiError || mode !== 'ai' || turn !== aiSide) return
    const cur = boardForAiRef.current
    const budgetMs = depth === 4 ? 700 : depth === 6 ? 1600 : 3000
    const cancel = scheduleAiMove('xiangqi', { board: cur, side: aiSide, maxDepth: depth, budgetMs, history }, (m, result) => {
      aiCancelRef.current = null
      setSelected(null)
      setAnalysis(result ?? null)
      if (!m) {
        setWinner(humanSide)
        return
      }
      const nextHistory: XiangqiSnap[] = [...history, { board: snapshotBoard(cur), turn: aiSide, lastMove, winner: null, selected: null, repetitionResult: null }]
      setHistory(nextHistory)
      const cap = cur[m.toR][m.toC]
      const next = applyMove(cur, m.fromR, m.fromC, m.toR, m.toC)
      setMoveEffect({ move: m, eventKey: ++effectSequence.current, kind: cap ? 'capture' : 'move' })
      setLastMove(m)
      if (cap?.type === 'k') {
        setWinner(aiSide)
        setBoard(next)
        return
      }
      const nextWinner = getXiangqiWinner(next, 'red')
      if (nextWinner) {
        setWinner(nextWinner)
        setBoard(next)
        return
      }
      setBoard(next)
      const repeated = getXiangqiRepetitionResult(nextHistory, next, 'red')
      setRepetitionResult(repeated)
      if (repeated?.kind === 'perpetual-check') setWinner(repeated.winner)
      setTurn('red')
    }, 140, failure => {
      aiCancelRef.current = null
      setAiError(failure)
    })
    aiCancelRef.current = cancel
    return () => {
      cancel()
      if (aiCancelRef.current === cancel) aiCancelRef.current = null
    }
  }, [present, board, lastMove, gameOver, aiError, mode, turn, aiSide, humanSide, depth, history])

  const onCellClick = (r: number, c: number) => {
    if (gameOver) return
    if (mode === 'ai' && turn === aiSide) return
    const piece = board[r][c]
    if (selected) {
      const hit = targets.find((m) => m.toR === r && m.toC === c)
      if (hit) {
        tryMove(hit)
        return
      }
      if (piece?.side === turn) {
        setSelected([r, c])
        return
      }
      setSelected(null)
      return
    }
    if (piece?.side === turn) {
      setSelected([r, c])
    }
  }

  const thinking = mode === 'ai' && turn === aiSide && !gameOver && !aiError
  const selectedPiece = selected ? board[selected[0]][selected[1]] : null
  const detail = gameOver ? '本局结束，可悔棋继续练习或重新开始' : aiError ? '点继续计算，让电脑重新思考当前局面；已走的棋不会撤回' : selectedPiece ? `已选${pieceChar(selectedPiece)} · ${targets.length ? `${targets.length} 个落点可走` : '暂无合法走法，换一枚棋子'}`
    : thinking ? '电脑正在思考，也可悔棋重新尝试' : '先选自己的棋子，再点击标记的落点'

  const w = PAD * 2 + CELL * (9 - 1)
  const h = PAD * 2 + CELL * (10 - 1)

  /** 人机：沿用原基线位置；双人：河在第四、五横线之间取竖直中线，左右以棋盘竖中线对称 */
  const riverY = PAD + 4.55 * CELL
  const dualRiver = mode === 'local'
  const gridMidX = PAD + 4 * CELL
  const riverMidY = PAD + 4.5 * CELL
  const riverSideOffset = 2 * CELL
  const riverChuX = dualRiver ? gridMidX - riverSideOffset : PAD + 1.5 * CELL
  const riverHanX = dualRiver ? gridMidX + riverSideOffset : PAD + 5.2 * CELL

  return (
    <div className="xiangqi-wrap moving-game">
      <div className="xiangqi-toolbar">
        <GameStatus status={status} thinking={thinking} sideLabel={turn === 'red' ? '红方' : '黑方'} sideTone={turn === 'red' ? 'red' : 'dark'} detail={detail} />
        <div className="xiangqi-actions">
          {aiError && !gameOver && <button type="button" className="xiangqi-reset" onClick={retryAi}>继续计算</button>}
          <button type="button" className="xiangqi-undo" onClick={undo} disabled={getUndoIndex(history, mode, humanSide) < 0} title={mode === 'ai' ? '不限次数，撤回到你上一次行棋前' : '撤回上一手，可连续悔棋'}>
            悔棋
          </button>
          <button type="button" className="xiangqi-reset" onClick={reset}>
            重新开始
          </button>
          <button type="button" className="xiangqi-undo" onClick={exportGame}>导出棋局</button>
          <label className="xiangqi-undo xiangqi-import">
            导入棋局
            <input type="file" accept=".json,application/json" aria-label="象棋棋局文件" onChange={event => { void importGame(event.currentTarget) }} />
          </label>
          <button type="button" className="xiangqi-undo" aria-expanded={pasteOpen} aria-controls="xiangqi-paste-panel" onClick={() => { importSequence.current++; setPasteOpen(open => !open) }}>粘贴棋局</button>
        </div>
      </div>
      {pasteOpen && <div className="xiangqi-paste-panel" id="xiangqi-paste-panel">
        <label htmlFor="xiangqi-paste-json">粘贴导出的棋局内容</label>
        <textarea id="xiangqi-paste-json" aria-label="棋局 JSON" rows={5} value={pasteJson} onChange={event => setPasteJson(event.target.value)} />
        <button type="button" className="xiangqi-reset" onClick={() => { importSequence.current++; if (restoreGame(pasteJson)) { setPasteOpen(false); setPasteJson('') } }}>载入棋局</button>
      </div>}
      {mode === 'ai' && (
        <div className="xiangqi-ai-settings">
          <label className="xiangqi-ai-depth">
            <span>电脑思考深度</span>
            <select value={depth} onChange={event => setDepth(Number(event.target.value) as XiangqiDepth)} disabled={thinking} aria-label="电脑思考深度" aria-describedby="xiangqi-ai-depth-note">
              <option value={4}>4 层 · 快速 · 最多 0.7 秒</option>
              <option value={6}>6 层 · 进阶 · 最多 1.6 秒</option>
              <option value={8}>8 层 · 高难度 · 最多 3 秒</option>
            </select>
          </label>
          {analysis && <p className="xiangqi-ai-analysis" aria-live="polite">上一手完成 {analysis.depth} 层 · {(analysis.elapsedMs / 1000).toFixed(2)} 秒</p>}
          <p id="xiangqi-ai-depth-note" className="xiangqi-ai-depth-note">每层代表一方走一步；目标层数受时间上限限制，实际完成深度以上一手结果为准。</p>
        </div>
      )}
      <p className="xiangqi-ai-depth-note xiangqi-session-note" role="status" aria-live="polite">
        {saveStatus === 'saved' ? '棋局和悔棋记录已保存在本标签页，刷新或离开后返回可继续；关闭前可导出备份。' : saveStatus === 'quota' ? '浏览器存储空间不足，当前棋局无法自动保存；请导出备份，并保持本页。' : saveStatus === 'unavailable' ? '当前浏览器无法自动保存棋局；请导出备份，并保持本页。' : '正在保存棋局…'}
      </p>
      {transferMessage && <p className="xiangqi-ai-depth-note" role="status" aria-live="polite">{transferMessage}</p>}
      {repetitionWarning && <p className="xiangqi-ai-depth-note xiangqi-repetition-warning" role="status" aria-live="polite">{repetitionWarning.kind === 'perpetual-check' ? `${repetitionWarning.offender === 'red' ? '红方' : '黑方'}正在长将，再重复相同局面将判负，请变招。` : '局面已重复一次，再次重复将判和棋；变招可避免循环。'}</p>}
      <GameResult result={gameOver ? status : null} onRestart={reset} />
      <InteractionHint steps={['选己方子', '查看落点', '点击走子']} activeStep={selected ? 1 : 0} note={gameOver ? '本局结束。可悔棋继续练习，或重新开始。' : isCheck ? '正在被将军：先化解对将帅的威胁。' : mode === 'ai' ? '你执红方先手；绿点可走，金圈可吃。悔棋不限次数，每次回到你上一手行棋前。' : '绿点可走，金圈可吃；点击另一枚己方棋子可重新选择。'} />
      <ResponsiveBoard width={w + 22} height={h + 22}>
      <div
        className="xiangqi-board-outer"
        style={
          {
            ['--xq-w' as string]: `${w}px`,
            ['--xq-h' as string]: `${h}px`,
          } as CSSProperties
        }
      >
        <div
          className={`xiangqi-board-surface${mode === 'local' ? ' xiangqi-board-surface--dual' : ''}`}
          style={{ width: w, height: h }}
        >
          {isCheck && (
            <div className="xiangqi-check-banner" role="status" aria-live="polite" data-thinking={thinking}>
              将军
            </div>
          )}
          <BoardEffects key={boardEpoch} width={w} height={h} eventKey={moveEffect?.eventKey ?? ''} from={moveEffect ? { x: PAD + moveEffect.move.fromC * CELL, y: PAD + moveEffect.move.fromR * CELL } : undefined} to={moveEffect ? { x: PAD + moveEffect.move.toC * CELL, y: PAD + moveEffect.move.toR * CELL } : undefined} kind={moveEffect?.kind} />
          <svg
            className="xiangqi-svg"
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            role="img"
            aria-label="中国象棋棋盘"
          >
          <rect x={0} y={0} width={w} height={h} className="xiangqi-bg" rx={10} />
          {Array.from({ length: 10 }, (_, j) => (
            <line
              key={`h${j}`}
              x1={PAD}
              y1={PAD + j * CELL}
              x2={PAD + 8 * CELL}
              y2={PAD + j * CELL}
              className="xiangqi-line"
            />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={PAD + i * CELL}
              y1={PAD}
              x2={PAD + i * CELL}
              y2={PAD + 4 * CELL}
              className="xiangqi-line"
            />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <line
              key={`v2${i}`}
              x1={PAD + i * CELL}
              y1={PAD + 5 * CELL}
              x2={PAD + i * CELL}
              y2={PAD + 9 * CELL}
              className="xiangqi-line"
            />
          ))}
          <line
            x1={PAD + 3 * CELL}
            y1={PAD}
            x2={PAD + 5 * CELL}
            y2={PAD + 2 * CELL}
            className="xiangqi-line"
          />
          <line
            x1={PAD + 5 * CELL}
            y1={PAD}
            x2={PAD + 3 * CELL}
            y2={PAD + 2 * CELL}
            className="xiangqi-line"
          />
          <line
            x1={PAD + 3 * CELL}
            y1={PAD + 7 * CELL}
            x2={PAD + 5 * CELL}
            y2={PAD + 9 * CELL}
            className="xiangqi-line"
          />
          <line
            x1={PAD + 5 * CELL}
            y1={PAD + 7 * CELL}
            x2={PAD + 3 * CELL}
            y2={PAD + 9 * CELL}
            className="xiangqi-line"
          />
          <text
            x={riverChuX}
            y={dualRiver ? riverMidY : riverY}
            className="xiangqi-river"
            textAnchor={dualRiver ? 'middle' : 'start'}
            dominantBaseline={dualRiver ? 'middle' : undefined}
          >
            楚 河
          </text>
          {dualRiver ? (
            <g transform={`translate(${riverHanX}, ${riverMidY})`}>
              <text
                x={0}
                y={0}
                className="xiangqi-river"
                textAnchor="middle"
                dominantBaseline="middle"
                transform="rotate(180)"
              >
                汉 界
              </text>
            </g>
          ) : (
            <text x={riverHanX} y={riverY} className="xiangqi-river">
              汉 界
            </text>
          )}
          </svg>
          <div className="xiangqi-grid" style={{ width: w, height: h }}>
          {Array.from({ length: 10 }, (_, r) =>
            Array.from({ length: 9 }, (_, c) => {
              const isSel = selected?.[0] === r && selected?.[1] === c
              const isTarget = targets.some((m) => m.toR === r && m.toC === c)
              const isCapture = isTarget && !!board[r][c]
              const isLastFrom = lastMove?.fromR === r && lastMove?.fromC === c
              const isLastTo = lastMove?.toR === r && lastMove?.toC === c
              const piece = board[r][c]
              const label = piece ? `${piece.side === 'red' ? '红方' : '黑方'}${pieceChar(piece)}` : '空位'
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  className={`xiangqi-cell ${isSel ? 'selected' : ''} ${isTarget ? 'target' : ''} ${isCapture ? 'capture-target' : ''} ${isLastFrom ? 'last-from' : ''} ${isLastTo ? 'last-to' : ''}`}
                  style={{
                    left: PAD + c * CELL - 22,
                    top: PAD + r * CELL - 22,
                  }}
                  aria-label={`第 ${r + 1} 行第 ${c + 1} 列，${label}${isTarget ? isCapture ? '，可吃子' : '，可走空位' : ''}`}
                  aria-pressed={isSel}
                  disabled={gameOver || (mode === 'ai' && turn === aiSide)}
                  onClick={() => onCellClick(r, c)}
                >{isTarget && <span aria-hidden="true" className={`move-target-marker ${isCapture ? 'move-target-marker--capture' : ''}`} />}</button>
              )
            }),
          )}
          <AnimatePresence key={boardEpoch} initial={false}>
          {board.flatMap((row, r) =>
            row.map((piece, c) =>
              piece ? (
                <motion.div
                  key={piece.id}
                  className={`moving-piece ${lastMove?.toR === r && lastMove?.toC === c ? 'moving-piece--last' : ''}`}
                  style={{ width: 40, height: 40 }}
                  initial={reduceMotion ? false : { x: PAD + c * CELL - 20, y: PAD + r * CELL - 20, opacity: 0, scale: .72 }}
                  animate={{ x: PAD + c * CELL - 20, y: PAD + r * CELL - 20, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: .55 }}
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 31, mass: .85 }}
                  aria-hidden="true"
                >
                  <div className={`xiangqi-piece ${piece.side}`} style={{ left: 0, top: 0 }}>
                  {pieceChar(piece)}
                  </div>
                </motion.div>
              ) : null,
            ),
          )}
          </AnimatePresence>
          </div>
        </div>
      </div>
      </ResponsiveBoard>
    </div>
  )
}
