import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Chess } from "chess.js"
import Board from "./Board"
import CoachOverlay, { preComputeLegalMoves } from "./CoachOverlay"

function useOrientation() {
  const [orientation, setOrientation] = useState(
    window.innerWidth > window.innerHeight ? "landscape" : "portrait"
  )
  useEffect(() => {
    const update = () => setOrientation(window.innerWidth > window.innerHeight ? "landscape" : "portrait")
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])
  return orientation
}

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

function buildCache(fen, results, preScore, preBestMove, moveIdx) {
  const chess = new Chess(); chess.load(fen)
  const turn = chess.turn()
  const cache = {}
  results.forEach((data, san) => {
    const moverBefore = turn === "w" ? preScore       : -preScore
    const moverAfter  = turn === "w" ? data.postScore : -data.postScore
    const cpLoss = Math.max(0, moverBefore - moverAfter)
    const bm = preBestMove || null
    let bmSan = null
    try {
      if (bm?.length >= 4) {
        const c = new Chess(); c.load(fen)
        const m = c.move({ from: bm.slice(0,2), to: bm.slice(2,4), promotion: bm[4] || undefined })
        bmSan = m?.san || null
      }
    } catch {}
    cache[san] = { classification: classifyMove(cpLoss, moveIdx), bestMove: bm, bestMoveSan: bmSan }
  })
  return cache
}

const DIFFICULTY = [
  { label: "Beginner",     elo: 800  },
  { label: "Casual",       elo: 1200 },
  { label: "Intermediate", elo: 1600 },
  { label: "Advanced",     elo: 2000 },
  { label: "Master",       elo: 2500 },
]

const PIECE_SYMBOLS = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛" }

function getCaptured(game, color) {
  const start = { p:8, n:2, b:2, r:2, q:1 }
  const counts = { p:0, n:0, b:0, r:0, q:0 }
  game.board().flat().forEach(sq => {
    if (sq && sq.color === color) counts[sq.type] = (counts[sq.type] || 0) + 1
  })
  const captured = []
  for (const type of ["q","r","b","n","p"]) {
    const diff = start[type] - (counts[type] || 0)
    for (let i = 0; i < diff; i++) captured.push(PIECE_SYMBOLS[type])
  }
  return captured
}

function PlayerBar({ avatar, name, rating, isActive, captured }) {
  return (
    <div style={{ padding:"8px 16px", display:"flex", alignItems:"center", gap:10, flexShrink:0, background:isActive?"var(--bg2)":"transparent", borderBottom:"1px solid var(--border)", transition:"background 0.2s" }}>
      <div style={{ width:34, height:34, borderRadius:"50%", background:"var(--bg3)", border:`2px solid ${isActive?"var(--gold)":"var(--border)"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0, transition:"border-color 0.2s" }}>{avatar}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:500 }}>{name}</div>
        <div style={{ fontSize:10, color:"var(--text-muted)", fontFamily:"monospace" }}>{rating}&nbsp;<span style={{ fontSize:11, letterSpacing:1 }}>{captured.join("")}</span></div>
      </div>
    </div>
  )
}

function GameOverModal({ result, moves, onRematch, onNewGame, onStop, trainingMode }) {
  const icon  = result==="win" ? "♔" : result==="loss" ? "♚" : "½"
  const title = result==="win" ? "You won!" : result==="loss" ? "You lost" : "Draw"
  const sub   = result==="draw" ? `Draw · ${moves} moves` : `Checkmate · ${moves} moves`
  return (
    <div style={{ position:"absolute", inset:0, background:"rgba(14,14,12,0.85)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}>
      <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:24, padding:"28px 24px", width:"min(300px,90%)", textAlign:"center", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:"linear-gradient(90deg,transparent,rgba(201,169,110,0.5),transparent)" }} />
        <div style={{ fontSize:48, marginBottom:12 }}>{icon}</div>
        <div style={{ fontFamily:"'DM Serif Display',serif", fontStyle:"italic", fontSize:28, marginBottom:4 }}>{title}</div>
        <div style={{ fontSize:13, color:"var(--text-muted)", marginBottom:24 }}>{sub}</div>
        <div style={{ display:"flex", gap:10 }}>
          {trainingMode ? (
            <button onClick={onStop} style={{ flex:1, padding:13, borderRadius:14, border:"none", background:"var(--text)", color:"var(--bg)", fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:500, cursor:"pointer" }}>Back to Review</button>
          ) : (
            <>
              <button onClick={onNewGame} style={{ flex:1, padding:13, borderRadius:14, border:"1px solid var(--border)", background:"var(--bg3)", color:"var(--text-dim)", fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:500, cursor:"pointer" }}>New game</button>
              <button onClick={onRematch} style={{ flex:1, padding:13, borderRadius:14, border:"none", background:"var(--text)", color:"var(--bg)", fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:500, cursor:"pointer" }}>Rematch</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CtrlBtn({ icon, label, onClick, danger }) {
  return (
    <div onClick={onClick} style={{ flex:1, background:"var(--bg2)", border:`1px solid ${danger?"rgba(192,57,43,0.3)":"var(--border)"}`, borderRadius:12, padding:"10px 8px", display:"flex", flexDirection:"column", alignItems:"center", gap:3, cursor:"pointer" }}>
      <div style={{ fontSize:18, color:danger?"var(--red)":"var(--text-dim)" }}>{icon}</div>
      <div style={{ fontSize:9, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--text-muted)" }}>{label}</div>
    </div>
  )
}

export default function Game({ onBack, onGameProgress, onGameComplete, resumeData, trainingMode, onStop }) {
  const isTraining = !!trainingMode

  const [moveHistory,   setMoveHistory]   = useState([])
  const [playerColor,   setPlayerColor]   = useState(trainingMode?.playerColor || "w")
  const [difficulty,    setDifficulty]    = useState(trainingMode?.difficultyIndex ?? 1)
  const [coached,       setCoached]       = useState(isTraining)
  const [thinking,      setThinking]      = useState(false)
  const [started,       setStarted]       = useState(isTraining)
  const [sfReady,       setSfReady]       = useState(false)
  const [lastMove,      setLastMove]      = useState(null)
  const [gameOver,      setGameOver]      = useState(null)
  const [flipped,       setFlipped]       = useState((trainingMode?.playerColor || "w") === "b")
  const [resignConfirm, setResignConfirm] = useState(false)
  const [selectedSq,    setSelectedSq]    = useState(null)
  const [legalMoves,    setLegalMoves]    = useState([])
  const [coachBestMove, setCoachBestMove] = useState(null)

  // Coaching display state
  const [coachPreFen,  setCoachPreFen]  = useState(null)
  const [coachMoveSan, setCoachMoveSan] = useState(null)
  const [coachMoveIdx, setCoachMoveIdx] = useState(0)
  const [cachedResult, setCachedResult] = useState(null)

  // Coaching refs — all timing logic lives here, no React state
  const moveCacheRef         = useRef({})   // { [san]: { classification, bestMove, bestMoveSan } }
  const computingFenRef      = useRef(null) // which FEN is currently being computed
  const pendingEngineMoveRef = useRef(null) // engine bestmove waiting for precompute to finish
  const coachedRef           = useRef(coached)
  const playerColorRef       = useRef(playerColor)
  useEffect(() => { coachedRef.current = coached },       [coached])
  useEffect(() => { playerColorRef.current = playerColor }, [playerColor])

  const stockfishRef = useRef(null)
  const orientation  = useOrientation()
  const startFen     = trainingMode?.startFen || null

  // ── startPrecompute ─────────────────────────────────────
  // Call this whenever the position the user will move from changes.
  // Computes all legal move evals, stores in moveCacheRef.
  // If there's a pending engine move, applies it when done.
  const startPrecompute = useCallback((fen, moveIdx) => {
    if (!fen) return
    if (computingFenRef.current === fen) { console.log("[PC] already computing", fen.slice(0,20)); return }
    console.log("[PC] starting precompute for fen:", fen.slice(0,20), "moveIdx:", moveIdx)
    computingFenRef.current = fen
    moveCacheRef.current = {}

    preComputeLegalMoves(fen, 1).then(({ results, preScore, preBestMove }) => {
      if (computingFenRef.current !== fen) { console.log("[PC] stale — discarding"); return }
      moveCacheRef.current = buildCache(fen, results, preScore, preBestMove, moveIdx)
      console.log("[PC] done — cache size:", Object.keys(moveCacheRef.current).length, "| pending engine move:", pendingEngineMoveRef.current)

      const pending = pendingEngineMoveRef.current
      if (pending) {
        console.log("[PC] applying pending engine move:", pending)
        pendingEngineMoveRef.current = null
        makeMoveRef.current(pending.from, pending.to, pending.prom)
        setThinking(false)
      }
    })
  }, [])

  // restore saved game on mount
  useEffect(() => {
    if (isTraining || !resumeData) return
    setPlayerColor(resumeData.playerColor)
    setFlipped(resumeData.playerColor === "b")
    setDifficulty(resumeData.difficultyIndex ?? 1)
    setMoveHistory(resumeData.moves || [])
    setStarted(true)
  }, [])

  const game = useMemo(() => {
    const g = new Chess()
    if (startFen) { try { g.load(startFen) } catch {} }
    for (const san of moveHistory) { try { g.move(san) } catch { break } }
    return g
  }, [moveHistory, startFen])

  const completedGame = useMemo(() => {
    if (!gameOver || isTraining) return null
    return { pgn:game.pgn(), fen:game.fen(), moves:moveHistory, result:gameOver, difficulty:DIFFICULTY[difficulty].label, elo:DIFFICULTY[difficulty].elo, playerColor, date:new Date().toISOString() }
  }, [gameOver])

  useEffect(() => {
    if (completedGame && onGameComplete) onGameComplete(completedGame)
  }, [completedGame])

  const makeMove = useCallback((from, to, promotion = "q") => {
    const tempGame = new Chess()
    if (startFen) { try { tempGame.load(startFen) } catch {} }
    for (const san of moveHistory) { try { tempGame.move(san) } catch {} }

    const preFen = tempGame.fen()
    const result = tempGame.move({ from, to, promotion })
    if (!result) return
    const postFen = tempGame.fen()

    const moverWasPlayer = (() => {
      try { const c = new Chess(); c.load(preFen); return c.turn() === playerColorRef.current } catch { return false }
    })()

    if (coachedRef.current && moverWasPlayer) {
      // Show cached result instantly
      const cached = moveCacheRef.current[result.san] || null
      setCoachPreFen(preFen)
      setCoachMoveSan(result.san)
      setCoachMoveIdx(moveHistory.length)
      setCoachBestMove(null)
      setCachedResult(cached)
      // Clear cache — will be rebuilt for postFen via startPrecompute below
      moveCacheRef.current = {}
      computingFenRef.current = null
      pendingEngineMoveRef.current = null
      // Start precomputing the engine's new position (postFen)
      console.log("[MOVE] player moved", result.san, "— starting precompute on postFen")
      startPrecompute(postFen, moveHistory.length + 1)
    }

    const newHistory = [...moveHistory, result.san]
    if (!isTraining && onGameProgress) {
      onGameProgress({ moves:newHistory, playerColor, difficulty:DIFFICULTY[difficulty].label, difficultyIndex:difficulty, date:new Date().toISOString() })
    }
    setMoveHistory(newHistory)
    setLastMove({ from, to })
    if (tempGame.isCheckmate()) setGameOver(tempGame.turn() === playerColor ? "loss" : "win")
    else if (tempGame.isDraw()) setGameOver("draw")
  }, [game, playerColor, difficulty, onGameProgress, moveHistory, startFen, isTraining, startPrecompute])

  const makeMoveRef = useRef(makeMove)
  useEffect(() => { makeMoveRef.current = makeMove }, [makeMove])

  // Main Stockfish worker
  useEffect(() => {
    const isLocal = window.location.hostname === "localhost"
    const path = isLocal ? "/stockfish.js" : "/castl/stockfish.js"
    const sf = new Worker(path)
    sf.postMessage("uci")
    sf.postMessage("isready")
    stockfishRef.current = sf
    sf.onmessage = (e) => {
      const msg = typeof e.data === "string" ? e.data : e.data?.toString()
      if (msg === "readyok") { console.log("[SF] ready"); setSfReady(true) }
      if (msg?.startsWith("bestmove")) {
        const move = msg.split(" ")[1]
        console.log("[SF] bestmove received:", move, "| coached:", coachedRef.current, "| cache size:", Object.keys(moveCacheRef.current).length, "| pending:", pendingEngineMoveRef.current)
        if (move && move !== "(none)") {
          const from = move.slice(0,2), to = move.slice(2,4), prom = move.slice(4) || undefined
          if (coachedRef.current) {
            if (Object.keys(moveCacheRef.current).length > 0) {
              console.log("[SF] cache ready — applying engine move immediately")
              makeMoveRef.current(from, to, prom)
              setThinking(false)
            } else {
              console.log("[SF] cache not ready — storing engine move as pending")
              pendingEngineMoveRef.current = { from, to, prom }
            }
          } else {
            console.log("[SF] coaching off — applying engine move directly")
            makeMoveRef.current(from, to, prom)
            setThinking(false)
          }
        } else {
          setThinking(false)
        }
      }
    }
    return () => sf.terminate()
  }, [])

  useEffect(() => {
    if (!selectedSq) { setLegalMoves([]); return }
    setLegalMoves(game.moves({ square:selectedSq, verbose:true }).map(m => m.to))
  }, [selectedSq, game])

  // Engine turn
  useEffect(() => {
    if (!started || gameOver || game.isGameOver()) return
    if (game.turn() === playerColor) return
    setThinking(true)
    const sf = stockfishRef.current
    if (!sf) return
    sf.postMessage("setoption name UCI_LimitStrength value true")
    sf.postMessage(`setoption name UCI_Elo value ${DIFFICULTY[difficulty].elo}`)
    sf.postMessage(`position fen ${game.fen()}`)
    sf.postMessage("go movetime 1500")
  }, [game, playerColor, difficulty, started, gameOver])

  const handleMove = (from, to) => {
    if (game.turn() !== playerColor || thinking || gameOver) return
    makeMove(from, to)
  }

  const handleTakeback = () => {
    if (moveHistory.length < 2) return
    const updated = moveHistory.slice(0, -2)
    if (!isTraining && onGameProgress) {
      onGameProgress({ moves:updated, playerColor, difficulty:DIFFICULTY[difficulty].label, difficultyIndex:difficulty, date:new Date().toISOString() })
    }
    setMoveHistory(updated)
    setLastMove(null)
    setSelectedSq(null)
    setLegalMoves([])
    setGameOver(null)
    setCoachBestMove(null)
    // Clear cache and recompute for the new position
    if (coached) {
      moveCacheRef.current = {}
      computingFenRef.current = null
      pendingEngineMoveRef.current = null
      // Recompute after state settles
      setTimeout(() => {
        const g = new Chess()
        if (startFen) { try { g.load(startFen) } catch {} }
        for (const san of updated) { try { g.move(san) } catch {} }
        startPrecompute(g.fen(), updated.length)
      }, 0)
    }
  }

  const handleResign = () => {
    if (!resignConfirm) { setResignConfirm(true); setTimeout(() => setResignConfirm(false), 3000); return }
    setGameOver("loss"); setResignConfirm(false)
  }

  const handleStart = (color) => {
    setPlayerColor(color)
    setFlipped(color === "b")
    setStarted(true)
    setMoveHistory([])
    setLastMove(null)
    setGameOver(null)
    setCoachPreFen(null)
    setCoachMoveSan(null)
    setCoachBestMove(null)
    setCachedResult(null)
    moveCacheRef.current = {}
    computingFenRef.current = null
    pendingEngineMoveRef.current = null
    // If user is white, precompute starting position immediately
    if (coached && color === "w") {
      const fen = startFen || new Chess().fen()
      startPrecompute(fen, 0)
    }
  }

  const handleRematch = () => {
    setMoveHistory([])
    setLastMove(null)
    setSelectedSq(null)
    setLegalMoves([])
    setGameOver(null)
    setCoachPreFen(null)
    setCoachMoveSan(null)
    setCoachBestMove(null)
    setCachedResult(null)
    moveCacheRef.current = {}
    computingFenRef.current = null
    pendingEngineMoveRef.current = null
    if (coached && playerColor === "w") {
      const fen = startFen || new Chess().fen()
      startPrecompute(fen, 0)
    }
  }

  const handleNewGame = () => {
    setStarted(false)
    setMoveHistory([])
    setSelectedSq(null)
    setLegalMoves([])
    setLastMove(null)
    setGameOver(null)
    setCoachPreFen(null)
    setCoachMoveSan(null)
    setCoachBestMove(null)
    setCachedResult(null)
    moveCacheRef.current = {}
    computingFenRef.current = null
    pendingEngineMoveRef.current = null
  }

  // ── When engine plays (game.turn flips to playerColor), precompute for user ──
  // This handles: user is black (engine plays first), and every subsequent engine move
  useEffect(() => {
    if (!coached || !started || gameOver) return
    if (game.turn() !== playerColor) return
    // It's now the player's turn — precompute their legal moves
    console.log("[EFFECT] player's turn — startPrecompute", game.fen().slice(0,20))
    startPrecompute(game.fen(), game.history().length)
  }, [game, playerColor, coached, started, gameOver, startPrecompute])

  // ── setup screen ──────────────────────────────────────
  if (!started) {
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:24, overflowY:"auto" }}>
        <div style={{ fontFamily:"'DM Serif Display',serif", fontStyle:"italic", fontSize:28 }}>vs Computer</div>
        <div style={{ width:"100%", maxWidth:400 }}>
          <div style={{ fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--text-muted)", marginBottom:12 }}>Difficulty</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {DIFFICULTY.map((d,i) => (
              <div key={d.label} onClick={() => setDifficulty(i)}
                style={{ background:difficulty===i?"var(--text)":"var(--bg2)", color:difficulty===i?"var(--bg)":"var(--text)", border:`1px solid ${difficulty===i?"var(--text)":"var(--border)"}`, borderRadius:14, padding:"14px 18px", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:15 }}>{d.label}</span>
                <span style={{ fontSize:12, opacity:0.5 }}>{d.elo}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ width:"100%", maxWidth:400 }}>
          <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}
            onClick={() => setCoached(c => !c)}>
            <div>
              <div style={{ fontSize:15 }}>Coaching</div>
              <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>Live feedback after each move</div>
            </div>
            <div style={{ width:40, height:22, borderRadius:11, background:coached?"var(--gold)":"var(--bg3)", border:"1px solid var(--border)", position:"relative", transition:"background 0.2s", flexShrink:0 }}>
              <div style={{ position:"absolute", top:2, left:coached?20:2, width:16, height:16, borderRadius:"50%", background:coached?"var(--bg)":"var(--text-muted)", transition:"left 0.2s" }} />
            </div>
          </div>
        </div>
        <div style={{ width:"100%", maxWidth:400 }}>
          <div style={{ fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--text-muted)", marginBottom:12 }}>Play as</div>
          {!sfReady && <div style={{ fontSize:12, color:"var(--gold)", textAlign:"center", marginBottom:12 }}>⏳ Loading engine...</div>}
          <div style={{ display:"flex", gap:12 }}>
            {[["w","♔","White"],["b","♚","Black"]].map(([color,icon,label]) => (
              <div key={color} onClick={() => sfReady && handleStart(color)}
                style={{ flex:1, background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:20, display:"flex", flexDirection:"column", alignItems:"center", gap:8, cursor:sfReady?"pointer":"wait", opacity:sfReady?1:0.4, transition:"opacity 0.3s" }}>
                <span style={{ fontSize:36 }}>{icon}</span>
                <span style={{ fontSize:13 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:13, cursor:"pointer", marginTop:8 }}>← Back</button>
      </div>
    )
  }

  // ── derived state ─────────────────────────────────────
  const isPlayerTurn     = game.turn() === playerColor
  const computerColor    = playerColor === "w" ? "b" : "w"
  const playerCaptured   = getCaptured(game, computerColor)
  const computerCaptured = getCaptured(game, playerColor)
  const title = isTraining ? "Training" : "vs Computer"

  const computerBar = <PlayerBar avatar="🤖" name="Stockfish" rating={DIFFICULTY[difficulty].label} isActive={!isPlayerTurn && !gameOver} captured={computerCaptured} />
  const playerBar   = <PlayerBar avatar="🧑🏻" name="You" rating="—" isActive={isPlayerTurn && !gameOver} captured={playerCaptured} />

  const coachBox = coached ? (
    <CoachOverlay
      preFen={coachPreFen}
      moveSan={coachMoveSan}
      moveIndex={coachMoveIdx}
      cachedResult={cachedResult}
      onBestMove={setCoachBestMove}
    />
  ) : null

  const boardEl = (
    <Board game={game} onMove={handleMove} selectedSq={selectedSq} setSelectedSq={setSelectedSq}
      legalMoves={legalMoves} flipped={flipped} lastMove={lastMove} bestMove={coachBestMove} />
  )

  const controls = (
    <div style={{ display:"flex", gap:8, padding:"8px 16px", flexShrink:0 }}>
      <CtrlBtn icon="↩" label="Takeback" onClick={handleTakeback} />
      <CtrlBtn icon="⇄" label="Flip" onClick={() => setFlipped(f => !f)} />
      {isTraining
        ? <CtrlBtn icon="■" label="Stop" onClick={onStop} danger />
        : <CtrlBtn icon="⚑" label={resignConfirm?"Confirm?":"Resign"} onClick={handleResign} danger />}
    </div>
  )

  const movesEl = (
    <div style={{ flex:1, overflowY:"auto", padding:"0 16px 16px", scrollbarWidth:"none" }}>
      <div style={{ fontSize:9, letterSpacing:"0.14em", textTransform:"uppercase", color:"var(--text-muted)", padding:"8px 0", borderBottom:"1px solid var(--border)", marginBottom:8 }}>Moves</div>
      {moveHistory.length === 0 && <div style={{ fontSize:12, color:"var(--text-muted)" }}>No moves yet</div>}
      <div style={{ display:"grid", gridTemplateColumns:"28px 1fr 1fr", gap:"2px 8px" }}>
        {Array.from({ length:Math.ceil(moveHistory.length/2) }).map((_,i) => {
          const isLastWhite = i===Math.ceil(moveHistory.length/2)-1 && moveHistory.length%2===1
          const isLastBlack = i===Math.ceil(moveHistory.length/2)-1 && moveHistory.length%2===0 && !!moveHistory[i*2+1]
          return (
            <div key={i} style={{ display:"contents" }}>
              <span style={{ fontSize:11, color:"var(--text-muted)", fontFamily:"monospace", padding:"3px 0" }}>{i+1}.</span>
              <span style={{ fontSize:12, fontFamily:"monospace", padding:"3px 6px", borderRadius:4, background:isLastWhite?"var(--bg3)":"transparent" }}>{moveHistory[i*2]}</span>
              <span style={{ fontSize:12, fontFamily:"monospace", color:"var(--text-dim)", padding:"3px 6px", borderRadius:4, background:isLastBlack?"var(--bg3)":"transparent" }}>{moveHistory[i*2+1]||""}</span>
            </div>
          )
        })}
      </div>
    </div>
  )

  const header = (
    <div style={{ padding:"10px 16px", display:"flex", alignItems:"center", gap:10, borderBottom:"1px solid var(--border)", flexShrink:0 }}>
      <button onClick={isTraining?onStop:onBack} style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:18, cursor:"pointer", lineHeight:1 }}>←</button>
      <div style={{ fontFamily:"'DM Serif Display',serif", fontStyle:"italic", fontSize:18 }}>{title}</div>
      <div style={{ marginLeft:"auto", fontSize:11, color:"var(--text-muted)" }}>{DIFFICULTY[difficulty].label}</div>
    </div>
  )

  if (orientation === "landscape") {
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", position:"relative" }}>
        {header}
        <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            {flipped ? playerBar : computerBar}
            {flipped ? null : coachBox}
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"8px 12px" }}>
              <div style={{ width:"min(100%,calc(100vh - 140px))", aspectRatio:"1" }}>{boardEl}</div>
            </div>
            {flipped ? coachBox : null}
            {flipped ? computerBar : playerBar}
          </div>
          <div style={{ width:240, borderLeft:"1px solid var(--border)", display:"flex", flexDirection:"column", overflow:"hidden" }}>
            {controls}{movesEl}
          </div>
        </div>
        {gameOver && <GameOverModal result={gameOver} moves={moveHistory.length} onRematch={handleRematch} onNewGame={handleNewGame} onStop={onStop} trainingMode={isTraining} />}
      </div>
    )
  }

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", position:"relative" }}>
      {header}
      {flipped ? playerBar : computerBar}
      {flipped ? null : coachBox}
      <div style={{ padding:"0 12px", flexShrink:0 }}>{boardEl}</div>
      {flipped ? coachBox : null}
      {flipped ? computerBar : playerBar}
      {controls}{movesEl}
      {gameOver && <GameOverModal result={gameOver} moves={moveHistory.length} onRematch={handleRematch} onNewGame={handleNewGame} onStop={onStop} trainingMode={isTraining} />}
    </div>
  )
}