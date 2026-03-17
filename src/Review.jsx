import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Chess } from "chess.js"
import Game from "./Game"

// ── constants ─────────────────────────────────────────────
const FILES = ["a","b","c","d","e","f","g","h"]
const RANKS = ["8","7","6","5","4","3","2","1"]

const STORAGE_KEYS = {
  completedGames: "castl_completed_games",
  importedGames:  "castl_imported_games",
}

const CLASS = {
  book:       { label: "Book",       emoji: "📘", color: "#8b9dc3" },
  brilliant:  { label: "Brilliant",  emoji: "✨", color: "#21d4b0" },
  best:       { label: "Best",       emoji: "✅", color: "#8db87a" },
  excellent:  { label: "Excellent",  emoji: "🟢", color: "#a8cc6e" },
  good:       { label: "Good",       emoji: "👍", color: "#c9d45a" },
  inaccuracy: { label: "Inaccuracy", emoji: "💡", color: "#e8c84a" },
  mistake:    { label: "Mistake",    emoji: "⚠️",  color: "#e8964a" },
  blunder:    { label: "Blunder",    emoji: "❌", color: "#c0392b" },
}

// ── storage helpers ───────────────────────────────────────
function loadCompletedGames() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.completedGames) || "[]") } catch { return [] }
}
function loadImportedGames() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.importedGames) || "[]") } catch { return [] }
}
function saveImportedGame(game) {
  try {
    const existing = loadImportedGames()
    const updated = [game, ...existing].slice(0, 100)
    localStorage.setItem(STORAGE_KEYS.importedGames, JSON.stringify(updated))
  } catch {}
}
function saveAnalysisToGame(game, analysisData) {
  try {
    const key = game._source === "computer" ? STORAGE_KEYS.completedGames : STORAGE_KEYS.importedGames
    const list = JSON.parse(localStorage.getItem(key) || "[]")
    const idx = list.findIndex(g =>
      g.date === game.date && (g.moves?.length ?? 0) === (game.moves?.length ?? 0)
    )
    if (idx !== -1) {
      list[idx] = { ...list[idx], analysis: analysisData }
      localStorage.setItem(key, JSON.stringify(list))
    }
  } catch {}
}

function formatDate(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now - d) / 1000 / 60)
  if (diff < 60) return `${diff}m ago`
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
  if (diff < 2880) return "Yesterday"
  return d.toLocaleDateString()
}

function parsePGN(pgn) {
  try {
    const chess = new Chess()
    chess.loadPgn(pgn)
    const headers = chess.header()
    const history = chess.history()
    return {
      _source: "external",
      moves: history,
      white: headers.White || "White",
      black: headers.Black || "Black",
      event: headers.Event || "Imported Game",
      date:  headers.Date  || new Date().toISOString(),
      result: headers.Result || "*",
      pgn,
    }
  } catch { return null }
}

// ── classification ────────────────────────────────────────
function classifyMove(cpLoss, moveIndex) {
  if (moveIndex < 10 && cpLoss <= 15) return "book"
  if (cpLoss < 0)    return "brilliant"
  if (cpLoss <= 10)  return "best"
  if (cpLoss <= 25)  return "excellent"
  if (cpLoss <= 50)  return "good"
  if (cpLoss <= 100) return "inaccuracy"
  if (cpLoss <= 250) return "mistake"
  return "blunder"
}

// ── Lichess accuracy ──────────────────────────────────────
function winPercent(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}
function moveAccuracy(wpBefore, wpAfter) {
  const loss = Math.max(0, wpBefore - wpAfter)
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669))
}
function stdDev(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  return Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length)
}
function calcAccuracy(moveAccs) {
  if (!moveAccs.length) return null
  const windowSize = Math.max(2, Math.min(8, Math.floor(moveAccs.length / 5)))
  const weights = moveAccs.map((_, i) => {
    const window = moveAccs.slice(Math.max(0, i - windowSize + 1), i + 1)
    const sd = window.length > 1 ? stdDev(window) : 0
    return Math.max(0.5, Math.min(12, sd))
  })
  const weightSum    = weights.reduce((a, b) => a + b, 0)
  const weightedMean = weights.reduce((s, w, i) => s + w * moveAccs[i], 0) / weightSum
  const valid        = moveAccs.filter(a => a > 0.1)
  const harmonicMean = valid.length > 0 ? valid.length / valid.reduce((s, a) => s + 1 / a, 0) : 0
  return Math.round((weightedMean + harmonicMean) / 2)
}

function pieceUrl(color, type) {
  return `https://lichess1.org/assets/piece/cburnett/${color}${type.toUpperCase()}.svg`
}
function sqToCoords(sq, flipped = false) {
  const file = FILES.indexOf(sq[0])
  const rank = RANKS.indexOf(sq[1])
  return { col: flipped ? 7 - file : file, row: flipped ? 7 - rank : rank }
}

// ── useOrientation ────────────────────────────────────────
function useOrientation() {
  const [o, setO] = useState(window.innerWidth > window.innerHeight ? "landscape" : "portrait")
  useEffect(() => {
    const upd = () => setO(window.innerWidth > window.innerHeight ? "landscape" : "portrait")
    window.addEventListener("resize", upd)
    return () => window.removeEventListener("resize", upd)
  }, [])
  return o
}

// ── Stockfish worker ──────────────────────────────────────
function useStockfish() {
  const workerRef  = useRef(null)
  const pendingRef = useRef(null)

  useEffect(() => {
    const isLocal = window.location.hostname === "localhost"
    const path = isLocal ? "/stockfish.js" : "/castl/stockfish.js"
    const worker = new Worker(path)
    worker.onmessage = (e) => {
      const line = e.data
      if (!pendingRef.current) return
      const cpMatch   = line.match(/score cp (-?\d+)/)
      const mateMatch = line.match(/score mate (-?\d+)/)
      if (cpMatch)   pendingRef.current.score = parseInt(cpMatch[1])
      if (mateMatch) pendingRef.current.score = parseInt(mateMatch[1]) > 0 ? 9999 : -9999
      const bmMatch = line.match(/^bestmove (\S+)/)
      if (bmMatch) {
        const { resolve, score } = pendingRef.current
        const bestMove = bmMatch[1] === "(none)" ? null : bmMatch[1]
        pendingRef.current = null
        resolve({ bestMove, score: score ?? 0 })
      }
    }
    worker.postMessage("uci")
    workerRef.current = worker
    return () => worker.terminate()
  }, [])

  const analyse = useCallback((fen, depth = 16) => {
    return new Promise((resolve) => {
      const worker = workerRef.current
      if (!worker) return resolve({ bestMove: null, score: 0 })
      pendingRef.current = { resolve, score: 0 }
      worker.postMessage("ucinewgame")
      worker.postMessage(`position fen ${fen}`)
      worker.postMessage(`go depth ${depth}`)
    })
  }, [])

  return { analyse }
}

// ── MoveArrow ─────────────────────────────────────────────
function MoveArrow({ from, to, flipped, color = "rgba(201,169,110,0.88)" }) {
  if (!from || !to || from.length < 2 || to.length < 2) return null
  const fromC = sqToCoords(from.slice(0,2), flipped)
  const toC   = sqToCoords(to.slice(0,2), flipped)
  if (fromC.col < 0 || fromC.row < 0 || toC.col < 0 || toC.row < 0) return null
  const size = 800, sq = size / 8
  const x1 = fromC.col * sq + sq / 2, y1 = fromC.row * sq + sq / 2
  const x2 = toC.col   * sq + sq / 2, y2 = toC.row   * sq + sq / 2
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return null
  const shorten = 32
  const ex = x2 - (dx / len) * shorten, ey = y2 - (dy / len) * shorten
  const id = `arr-${from}-${to}`
  return (
    <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:5 }}
      viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="none">
      <defs>
        <marker id={id} markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 Z" fill={color} />
        </marker>
      </defs>
      <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={color} strokeWidth="22" strokeLinecap="round"
        markerEnd={`url(#${id})`} opacity="0.82"
        style={{ filter:"drop-shadow(0 1px 5px rgba(201,169,110,0.25))" }} />
    </svg>
  )
}

// ── ClassBadge ────────────────────────────────────────────
function ClassBadge({ classification }) {
  if (!classification || ["best","book","excellent"].includes(classification)) return null
  const c = CLASS[classification]
  if (!c) return null
  return (
    <div style={{ position:"absolute", top:-4, right:-4, width:16, height:16, borderRadius:"50%",
      background:c.color, display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:8, zIndex:10, border:"1.5px solid #141412", boxShadow:"0 1px 4px rgba(0,0,0,0.6)" }}>
      {c.emoji}
    </div>
  )
}

// ── ReviewBoard ───────────────────────────────────────────
function ReviewBoard({ fen, lastMove, flipped, bestMove, currentMoveIdx, classifications }) {
  const chess = useMemo(() => {
    try { const c = new Chess(); c.load(fen); return c } catch { return new Chess() }
  }, [fen])
  const files = flipped ? [...FILES].reverse() : FILES
  const ranks = flipped ? [...RANKS].reverse() : RANKS
  const isLight = (f, r) => (FILES.indexOf(f) + RANKS.indexOf(r)) % 2 === 0
  return (
    <div style={{ position:"relative", width:"100%", aspectRatio:"1", userSelect:"none" }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gridTemplateRows:"repeat(8,1fr)",
        width:"100%", height:"100%", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, overflow:"hidden" }}>
        {ranks.map(rank => files.map(file => {
          const sq = file + rank, piece = chess.get(sq), light = isLight(file, rank)
          const isFrom = lastMove?.from === sq, isTo = lastMove?.to === sq
          const bg = (isFrom || isTo) ? (light ? "#cdd26a" : "#aaa23a") : (light ? "#d9d9d9" : "#1e1e1c")
          const showBadge = isTo && currentMoveIdx > 0 && classifications[currentMoveIdx - 1]
          return (
            <div key={sq} style={{ background:bg, display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
              {file==="a" && <span style={{ position:"absolute", top:1, left:2, fontSize:7, opacity:0.38, fontFamily:"monospace", color:light?"#333":"#bbb", pointerEvents:"none" }}>{rank}</span>}
              {rank==="1" && <span style={{ position:"absolute", bottom:1, right:2, fontSize:7, opacity:0.38, fontFamily:"monospace", color:light?"#333":"#bbb", pointerEvents:"none" }}>{file}</span>}
              {showBadge && <ClassBadge classification={classifications[currentMoveIdx - 1]} />}
              {piece && <img src={pieceUrl(piece.color, piece.type)} draggable={false}
                style={{ width:"90%", height:"90%", objectFit:"contain", pointerEvents:"none", zIndex:2 }} />}
            </div>
          )
        }))}
      </div>
      {bestMove && bestMove.length >= 4 && (
        <MoveArrow from={bestMove.slice(0,2)} to={bestMove.slice(2,4)} flipped={flipped} />
      )}
    </div>
  )
}

// ── EvalBar ───────────────────────────────────────────────
function EvalBar({ score, flipped }) {
  const clamped = Math.max(-600, Math.min(600, score ?? 0))
  const whitePct = 50 + (clamped / 600) * 40
  const topPct = flipped ? whitePct : 100 - whitePct
  return (
    <div style={{ width:7, borderRadius:5, overflow:"hidden", background:"#1e1e1c", border:"1px solid rgba(255,255,255,0.07)", display:"flex", flexDirection:"column", flexShrink:0, alignSelf:"stretch" }}>
      <div style={{ width:"100%", height:`${topPct}%`, background: flipped ? "#e8e8e4" : "#2a2a28", transition:"height 0.45s ease" }} />
    </div>
  )
}

// ── MiniBoard thumbnail ───────────────────────────────────
function MiniBoard() {
  const p = ["d","l","d","l","l","d","l","d","d","l","d","l","l","d","l","d"]
  return (
    <div style={{ width:48, height:48, borderRadius:8, overflow:"hidden", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gridTemplateRows:"repeat(4,1fr)", flexShrink:0, border:"1px solid rgba(255,255,255,0.07)" }}>
      {p.map((c,i) => <div key={i} style={{ background: c==="l" ? "#3a3830" : "#252420" }} />)}
    </div>
  )
}

// ── ImportModal ───────────────────────────────────────────
function ImportModal({ onClose, onImport }) {
  const [pgn, setPgn] = useState("")
  const [error, setError] = useState("")
  const handleImport = () => {
    if (!pgn.trim()) { setError("Paste a PGN first"); return }
    const game = parsePGN(pgn.trim())
    if (!game) { setError("Invalid PGN — couldn't parse"); return }
    onImport(game)
  }
  return (
    <div style={{ position:"absolute", inset:0, background:"rgba(14,14,12,0.88)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
      <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:24, padding:"24px 22px", width:"min(340px,90%)", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:"linear-gradient(90deg,transparent,rgba(201,169,110,0.4),transparent)" }} />
        <div style={{ fontFamily:"'DM Serif Display',serif", fontStyle:"italic", fontSize:20, marginBottom:4 }}>Import PGN</div>
        <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:14 }}>Paste a PGN from Chess.com, Lichess, or any source</div>
        <textarea value={pgn} onChange={e => { setPgn(e.target.value); setError("") }}
          placeholder={'[Event "Casual Game"]\n[White "You"]\n\n1. e4 e5 2. Nf3 ...'}
          style={{ width:"100%", height:110, background:"var(--bg3)", border:`1px solid ${error?"var(--red)":"var(--border)"}`, borderRadius:12, padding:"10px 12px", color:"var(--text)", fontFamily:"monospace", fontSize:11, resize:"none", outline:"none" }} />
        {error && <div style={{ fontSize:11, color:"var(--red)", marginTop:4 }}>{error}</div>}
        <div style={{ display:"flex", gap:10, marginTop:12 }}>
          <button onClick={onClose} style={{ flex:1, padding:12, borderRadius:14, border:"1px solid var(--border)", background:"var(--bg3)", color:"var(--text-dim)", fontFamily:"'DM Sans',sans-serif", fontSize:13, cursor:"pointer" }}>Cancel</button>
          <button onClick={handleImport} style={{ flex:1, padding:12, borderRadius:14, border:"none", background:"var(--text)", color:"var(--bg)", fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:500, cursor:"pointer" }}>Import</button>
        </div>
      </div>
    </div>
  )
}

// ── GameList ──────────────────────────────────────────────
function GameList({ onSelect, onImport }) {
  const [showImport, setShowImport] = useState(false)
  const completed = loadCompletedGames()
  const imported  = loadImportedGames()
  const allGames  = [
    ...completed.map(g => ({ ...g, _source: "computer" })),
    ...imported.map(g => ({ ...g, _source: "external" })),
  ].sort((a,b) => new Date(b.date||0) - new Date(a.date||0))

  const handleImport = (game) => { saveImportedGame(game); setShowImport(false); onImport() }

  const tagStyle = (src) => {
    if (src === "computer") return { bg:"rgba(201,169,110,0.12)", color:"var(--gold)",  border:"rgba(201,169,110,0.2)", label:"Computer" }
    if (src === "external") return { bg:"rgba(91,155,213,0.12)",  color:"#7ab3e0",      border:"rgba(91,155,213,0.2)",  label:"Imported" }
    return                         { bg:"rgba(141,184,122,0.12)", color:"var(--green)", border:"rgba(141,184,122,0.2)", label:"Online"   }
  }

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", position:"relative" }}>
      <div style={{ padding:"18px 22px 8px", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
        <div style={{ fontFamily:"'DM Serif Display',serif", fontStyle:"italic", fontSize:26 }}>Review</div>
        <button onClick={() => setShowImport(true)}
          style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:20, padding:"7px 14px", fontSize:11, color:"var(--text-dim)", fontFamily:"'DM Sans',sans-serif", letterSpacing:"0.06em", cursor:"pointer" }}>
          + Import PGN
        </button>
      </div>
      <div style={{ padding:"2px 22px 10px", fontSize:9, letterSpacing:"0.14em", textTransform:"uppercase", color:"var(--text-muted)" }}>
        {allGames.length} game{allGames.length !== 1 ? "s" : ""}
      </div>
      <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", scrollbarWidth:"none", padding:"0 14px 24px" }}>
        {allGames.length === 0 ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"60px 0", gap:10, opacity:0.4 }}>
            <div style={{ fontSize:40 }}>📋</div>
            <div style={{ fontFamily:"'DM Serif Display',serif", fontStyle:"italic", fontSize:18 }}>No games yet</div>
            <div style={{ fontSize:12, color:"var(--text-muted)" }}>Play a game or import a PGN</div>
          </div>
        ) : allGames.map((g, i) => {
          const tag         = tagStyle(g._source)
          const hasAnalysis = !!g.analysis
          const result      = g._source === "external"
            ? (g.result === "1-0" ? "White wins" : g.result === "0-1" ? "Black wins" : "Draw")
            : (g.result === "win" ? "Win" : g.result === "loss" ? "Loss" : "Draw")
          const resultColor = g._source === "external"
            ? "var(--text-muted)"
            : g.result === "win" ? "var(--green)" : g.result === "loss" ? "var(--red)" : "var(--text-muted)"
          const name = g._source === "external"
            ? `${g.white || "White"} vs ${g.black || "Black"}`
            : "🤖 Stockfish"
          const meta = g._source === "external"
            ? `${g.event || "Game"} · ${g.date?.slice(0,4) || ""}`
            : `${g.difficulty || "Casual"} · ${Math.ceil((g.moves?.length||0)/2)} moves · ${formatDate(g.date)}`
          const acc = g.analysis
            ? (g._source === "computer" && g.playerColor === "b" ? g.analysis.blackAccuracy : g.analysis.whiteAccuracy)
            : null

          return (
            <div key={i} onClick={() => onSelect(g)}
              style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:18, padding:"13px 15px", marginBottom:10, cursor:"pointer", display:"flex", alignItems:"center", gap:13, position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.04),transparent)" }} />
              <div style={{ position:"relative", flexShrink:0 }}>
                <MiniBoard />
                {hasAnalysis && (
                  <div style={{ position:"absolute", top:-3, right:-3, width:10, height:10, borderRadius:"50%", background:"var(--green)", border:"2px solid var(--bg2)", boxShadow:"0 0 6px rgba(141,184,122,0.6)" }} />
                )}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                  <div style={{ fontSize:14, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{name}</div>
                  <div style={{ fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase", padding:"2px 7px", borderRadius:10, fontWeight:500, background:tag.bg, color:tag.color, border:`1px solid ${tag.border}`, flexShrink:0 }}>{tag.label}</div>
                </div>
                <div style={{ fontSize:11, color:"var(--text-muted)", fontWeight:300 }}>{meta}</div>
                {acc != null && (
                  <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:2, fontFamily:"monospace" }}>
                    Accuracy <span style={{ color:"var(--green)", fontWeight:500 }}>{acc}%</span>
                  </div>
                )}
              </div>
              <div style={{ fontSize:12, fontWeight:500, padding:"4px 10px", borderRadius:20, background:"rgba(255,255,255,0.05)", color:resultColor, flexShrink:0 }}>
                {result}
              </div>
            </div>
          )
        })}
      </div>
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={handleImport} />}
    </div>
  )
}

// ── Reviewer ──────────────────────────────────────────────
function Reviewer({ game, onBack, orientation, onTrainingStart }) {
  const { analyse } = useStockfish()
  const moves = useMemo(() => game.moves || [], [game])

  const fens = useMemo(() => {
    const chess = new Chess()
    const result = [chess.fen()]
    for (const move of moves) { try { chess.move(move) } catch {} result.push(chess.fen()) }
    return result
  }, [moves])

  const stored = game.analysis || null

  const [currentIdx,      setCurrentIdx]      = useState(0)
  const [flipped,         setFlipped]         = useState(game.playerColor === "b")
  const [analysing,       setAnalysing]       = useState(false)
  const [analysed,        setAnalysed]        = useState(!!stored)
  const [progress,        setProgress]        = useState(0)
  const [scores,          setScores]          = useState(stored?.scores          || [])
  const [bestMoves,       setBestMoves]       = useState(stored?.bestMoves       || [])
  const [classifications, setClassifications] = useState(stored?.classifications || [])
  const [cpLosses,        setCpLosses]        = useState(stored?.cpLosses        || [])
  const [moveAccuracies,  setMoveAccuracies]  = useState(stored?.moveAccuracies  || [])

  const lastMove = useMemo(() => {
    if (currentIdx === 0) return null
    try {
      const chess = new Chess()
      let result = null
      for (let i = 0; i < currentIdx; i++) { result = chess.move(moves[i]) }
      return result ? { from: result.from, to: result.to } : null
    } catch { return null }
  }, [currentIdx, moves])

  const currentScore = scores[currentIdx] ?? 0

  const whiteMoveAccuracies = moveAccuracies.filter((_, i) => i % 2 === 0)
  const blackMoveAccuracies = moveAccuracies.filter((_, i) => i % 2 === 1)
  const whiteAccuracy = calcAccuracy(whiteMoveAccuracies)
  const blackAccuracy = calcAccuracy(blackMoveAccuracies)

  const isComputer    = game._source === "computer"
  const playerLabel   = isComputer ? `You · ${game.playerColor === "w" ? "White" : "Black"}` : (game.white || "White")
  const opponentLabel = isComputer ? "🤖 Stockfish" : (game.black || "Black")

  const moveClassification = currentIdx > 0 ? classifications[currentIdx - 1] : null
  const classInfo          = moveClassification ? CLASS[moveClassification] : null
  const currentMoveSAN     = currentIdx > 0 ? moves[currentIdx - 1] : null
  const arrowBestMove      = currentIdx > 0 ? bestMoves[currentIdx - 1] : null
  const messageBestMove    = currentIdx > 0 ? bestMoves[currentIdx - 1] : null
  const showArrow          = analysed && arrowBestMove &&
    ["inaccuracy","mistake","blunder"].includes(moveClassification)

  const goTo = useCallback((idx) => setCurrentIdx(Math.max(0, Math.min(fens.length - 1, idx))), [fens.length])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft")  goTo(currentIdx - 1)
      if (e.key === "ArrowRight") goTo(currentIdx + 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [currentIdx, goTo])

  const runAnalysis = async () => {
    if (analysing || analysed) return
    setAnalysing(true)
    setProgress(0)
    const newScores = [], newBestMoves = []
    for (let i = 0; i < fens.length; i++) {
      const res = await analyse(fens[i], 16)
      const chess = new Chess(); chess.load(fens[i])
      const turn = chess.turn()
      const rawScore = res?.score ?? 0
      newScores.push(turn === "b" ? -rawScore : rawScore)
      newBestMoves.push(res?.bestMove || null)
      setProgress(Math.round((i + 1) / fens.length * 100))
    }
    const newCpLosses = [], newClassifications = [], newMoveAccuracies = []
    moves.forEach((_, i) => {
      const chess = new Chess(); chess.load(fens[i])
      const turn = chess.turn()
      const scoreBefore = newScores[i], scoreAfter = newScores[i + 1]
      const wpBefore = turn === "w" ? winPercent(scoreBefore)  : winPercent(-scoreBefore)
      const wpAfter  = turn === "w" ? winPercent(scoreAfter)   : winPercent(-scoreAfter)
      newMoveAccuracies.push(moveAccuracy(wpBefore, wpAfter))
      const moverBefore = turn === "w" ? scoreBefore : -scoreBefore
      const moverAfter  = turn === "w" ? scoreAfter  : -scoreAfter
      const cpLoss = Math.max(0, moverBefore - moverAfter)
      newCpLosses.push(cpLoss)
      newClassifications.push(classifyMove(cpLoss, i))
    })

    const wAccs = newMoveAccuracies.filter((_, i) => i % 2 === 0)
    const bAccs = newMoveAccuracies.filter((_, i) => i % 2 === 1)
    const wAcc  = calcAccuracy(wAccs)
    const bAcc  = calcAccuracy(bAccs)

    const analysisData = {
      scores: newScores, bestMoves: newBestMoves,
      classifications: newClassifications, cpLosses: newCpLosses,
      moveAccuracies: newMoveAccuracies,
      whiteAccuracy: wAcc, blackAccuracy: bAcc,
    }

    setScores(newScores); setBestMoves(newBestMoves)
    setCpLosses(newCpLosses); setClassifications(newClassifications)
    setMoveAccuracies(newMoveAccuracies)
    setAnalysing(false); setAnalysed(true)
    saveAnalysisToGame(game, analysisData)
  }

  const movePairs = []
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({ num: Math.floor(i/2)+1, white: moves[i], black: moves[i+1], wi: i, bi: i+1 })
  }
  const classColor = (i) => classifications[i] ? (CLASS[classifications[i]]?.color ?? "rgba(255,255,255,0.2)") : "rgba(255,255,255,0.2)"

  // ── UI blocks ──────────────────────────────────────────
  const boardSection = (
    <div style={{ display:"flex", gap:8, padding: orientation === "landscape" ? "0" : "0 12px", alignItems:"stretch", flexShrink:0 }}>
      <EvalBar score={currentScore} flipped={flipped} />
      <div style={{ flex:1, position:"relative" }}>
        <ReviewBoard fen={fens[currentIdx]} lastMove={lastMove} flipped={flipped}
          bestMove={showArrow ? arrowBestMove : null}
          currentMoveIdx={currentIdx} classifications={classifications} />
      </div>
    </div>
  )

  const messageSection = (
    <div style={{ margin: orientation === "landscape" ? "8px 0" : "8px 12px 0", background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:12, padding:"10px 13px", display:"flex", alignItems:"flex-start", gap:10, flexShrink:0 }}>
      <div style={{ width:7, height:7, borderRadius:"50%", background: classInfo ? classInfo.color : "rgba(255,255,255,0.15)", marginTop:5, flexShrink:0 }} />
      <div style={{ flex:1 }}>
        {classInfo ? (
          <>
            <div style={{ fontSize:10, fontWeight:500, letterSpacing:"0.1em", textTransform:"uppercase", color:classInfo.color, marginBottom:3 }}>
              {classInfo.emoji} {classInfo.label} · {currentMoveSAN}
            </div>
            <div style={{ fontFamily:"'DM Serif Display',serif", fontStyle:"italic", fontSize:12, color:"var(--text-dim)", lineHeight:1.5 }}>
              {moveClassification === "brilliant"
                ? "Exceptional — stronger than the engine's top choice."
                : moveClassification === "book"
                ? "Known opening theory."
                : messageBestMove && analysed
                ? `Best was ${messageBestMove.slice(0,2)}→${messageBestMove.slice(2,4)}.`
                : "A strong continuation."}
            </div>
          </>
        ) : (
          <div style={{ fontFamily:"'DM Serif Display',serif", fontStyle:"italic", fontSize:12, color:"var(--text-muted)", lineHeight:1.5 }}>
            {currentIdx === 0
              ? "Starting position — use arrows to step through."
              : analysed ? "Step through moves to see analysis." : "Tap Analyse to classify moves."}
          </div>
        )}
      </div>
    </div>
  )

  const insightsBar = (
    <div style={{ margin: orientation === "landscape" ? "6px 0 0" : "6px 12px 0", background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:12, padding:"9px 13px", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
      <div style={{ fontSize:13, opacity:0.4 }}>✨</div>
      <div style={{ fontFamily:"'DM Serif Display',serif", fontStyle:"italic", fontSize:12, color:"var(--text-muted)" }}>
        AI insights coming soon
      </div>
    </div>
  )

  const moveLog = (
    <div style={{ padding: orientation === "landscape" ? "8px 0 0" : "8px 12px 0", flexShrink:0 }}>
      <div style={{ fontSize:9, letterSpacing:"0.14em", textTransform:"uppercase", color:"var(--text-muted)", marginBottom:5 }}>Moves</div>
      <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:12, padding:"5px 4px" }}>
        <div style={{ display:"flex", gap:1, overflowX:"auto", padding:"0 5px", alignItems:"center", scrollbarWidth:"none" }}>
          {movePairs.map(({ num, white, black, wi, bi }) => (
            <div key={num} style={{ display:"flex", alignItems:"center", gap:1, flexShrink:0 }}>
              <span style={{ fontSize:10, color:"var(--text-muted)", padding:"3px 2px 3px 5px", fontFamily:"monospace" }}>{num}</span>
              {white && (
                <span onClick={() => goTo(wi + 1)}
                  style={{ fontSize:12, padding:"4px 5px", borderRadius:7, cursor:"pointer", display:"flex", alignItems:"center", gap:3, fontFamily:"monospace", background: currentIdx===wi+1 ? "var(--bg3)" : "transparent", color: currentIdx===wi+1 ? "var(--text)" : "var(--text-dim)" }}>
                  <span style={{ width:5, height:5, borderRadius:"50%", background:classColor(wi), flexShrink:0 }} />
                  {white}
                </span>
              )}
              {black && (
                <span onClick={() => goTo(bi + 1)}
                  style={{ fontSize:12, padding:"4px 5px", borderRadius:7, cursor:"pointer", display:"flex", alignItems:"center", gap:3, fontFamily:"monospace", background: currentIdx===bi+1 ? "var(--bg3)" : "transparent", color: currentIdx===bi+1 ? "var(--text)" : "var(--text-dim)" }}>
                  <span style={{ width:5, height:5, borderRadius:"50%", background:classColor(bi), flexShrink:0 }} />
                  {black}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const bottomBar = (
    <div style={{ padding: orientation === "landscape" ? "8px 0 4px" : "8px 12px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, borderTop:"1px solid var(--border)" }}>
      <div style={{ display:"flex", gap:5 }}>
        {[["«",0],["‹",currentIdx-1],["›",currentIdx+1],["»",fens.length-1]].map(([lbl,idx]) => (
          <div key={lbl} onClick={() => goTo(Number(idx))}
            style={{ width:34, height:34, borderRadius:"50%", background:"var(--bg2)", border:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"var(--text-dim)", cursor:"pointer", fontFamily:"monospace" }}>
            {lbl}
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        <div onClick={() => setFlipped(f => !f)}
          style={{ width:34, height:34, borderRadius:"50%", background:"var(--bg2)", border:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, cursor:"pointer" }}>⇅</div>
        {analysed && currentIdx < fens.length - 1 && (
          <button onClick={() => onTrainingStart(fens[currentIdx], game.playerColor || "w", game.difficultyIndex)}
            style={{ background:"var(--bg2)", color:"var(--text-dim)", border:"1px solid var(--border)", borderRadius:18, padding:"8px 14px", fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:500, letterSpacing:"0.06em", cursor:"pointer" }}>
            ▶ Play here
          </button>
        )}
        <button onClick={runAnalysis}
          style={{ background: analysed ? "var(--bg2)" : analysing ? "var(--bg3)" : "var(--gold)", color: analysed || analysing ? "var(--text-dim)" : "var(--bg)", border: analysed || analysing ? "1px solid var(--border)" : "none", borderRadius:18, padding:"8px 16px", fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:500, letterSpacing:"0.06em", cursor: analysed ? "default" : "pointer" }}>
          {analysing ? `${progress}%` : analysed ? "✓ Analysed" : "⚡ Analyse"}
        </button>
      </div>
    </div>
  )

  const accStrip = (
    <div style={{ margin: orientation === "landscape" ? "0 0 6px" : "8px 12px 0", background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:"10px 14px", display:"flex", alignItems:"center", flexShrink:0 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--text-muted)", marginBottom:3 }}>{playerLabel}</div>
        <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, lineHeight:1, marginBottom:2 }}>
          {analysed ? (whiteAccuracy ?? "—") : "—"}{analysed && whiteAccuracy != null && <span style={{ fontSize:12, color:"var(--text-muted)" }}>%</span>}
        </div>
      </div>
      <div style={{ width:1, height:44, background:"var(--border)", margin:"0 14px" }} />
      <div style={{ flex:1, textAlign:"right" }}>
        <div style={{ fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--text-muted)", marginBottom:3 }}>{opponentLabel}</div>
        <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, lineHeight:1, marginBottom:2 }}>
          {analysed ? (blackAccuracy ?? "—") : "—"}{analysed && blackAccuracy != null && <span style={{ fontSize:12, color:"var(--text-muted)" }}>%</span>}
        </div>
      </div>
    </div>
  )

  const progressBar = analysing && (
    <div style={{ margin: orientation === "landscape" ? "4px 0" : "4px 12px", height:3, background:"var(--bg3)", borderRadius:2, overflow:"hidden", flexShrink:0 }}>
      <div style={{ height:"100%", width:`${progress}%`, background:"var(--gold)", borderRadius:2, transition:"width 0.3s ease" }} />
    </div>
  )

  const header = (
    <div style={{ padding: orientation === "landscape" ? "8px 0 6px" : "10px 16px 8px", display:"flex", alignItems:"center", gap:10, borderBottom:"1px solid var(--border)", flexShrink:0 }}>
      <div onClick={onBack} style={{ width:30, height:30, borderRadius:"50%", background:"var(--bg2)", border:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"var(--text-dim)", cursor:"pointer" }}>←</div>
      <div style={{ fontFamily:"'DM Serif Display',serif", fontStyle:"italic", fontSize:16, flex:1 }}>
        {isComputer ? `vs Stockfish · ${game.difficulty || "Casual"}` : `${game.white || "White"} vs ${game.black || "Black"}`}
      </div>
    </div>
  )

  if (orientation === "landscape") {
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"row", overflow:"hidden" }}>
        <div style={{ flex:"0 0 50%", display:"flex", flexDirection:"column", justifyContent:"center", padding:"8px 10px", borderRight:"1px solid var(--border)" }}>
          {boardSection}
        </div>
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"0 12px", flexShrink:0 }}>{header}</div>
          <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", scrollbarWidth:"none", padding:"0 12px" }}>
            {accStrip}{progressBar}{messageSection}{insightsBar}{moveLog}
          </div>
          <div style={{ padding:"0 12px" }}>{bottomBar}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", scrollbarWidth:"none", display:"flex", flexDirection:"column" }}>
      <div style={{ flexShrink:0 }}>{header}</div>
      {accStrip}{progressBar}{boardSection}{messageSection}{insightsBar}{moveLog}{bottomBar}
      <div style={{ height:16, flexShrink:0 }} />
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────
export default function Review({ onReviewerOpen }) {
  const [selectedGame,  setSelectedGame]  = useState(null)
  const [refreshKey,    setRefreshKey]    = useState(0)
  const [trainingMode,  setTrainingMode]  = useState(null)
  const orientation = useOrientation()

  useEffect(() => { onReviewerOpen?.(!!selectedGame) }, [selectedGame])

  if (trainingMode) {
    return (
      <Game
        trainingMode={trainingMode}
        onStop={() => setTrainingMode(null)}
        onBack={() => setTrainingMode(null)}
      />
    )
  }

  if (selectedGame) {
    return (
      <Reviewer
        game={selectedGame}
        onBack={() => setSelectedGame(null)}
        orientation={orientation}
        onTrainingStart={(startFen, playerColor, difficultyIndex) =>
          setTrainingMode({ startFen, playerColor, difficultyIndex })
        }
      />
    )
  }

  return <GameList key={refreshKey} onSelect={setSelectedGame} onImport={() => setRefreshKey(k => k+1)} />
}