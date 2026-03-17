import { useState, useEffect, useRef } from "react"
import { Chess } from "chess.js"

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

function uciToSan(fen, uci) {
  try {
    if (!uci || uci.length < 4) return null
    const c = new Chess(); c.load(fen)
    const move = c.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] || undefined })
    return move?.san || null
  } catch { return null }
}

function sanToHuman(san) {
  if (!san) return null
  const pieceNames = { N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" }
  const clean = san.replace(/[+#!?]/g, "")
  if (clean === "O-O-O") return "queenside castle"
  if (clean === "O-O")   return "kingside castle"
  const pieceMatch = clean.match(/^([NBRQK])/)
  if (pieceMatch) {
    const piece = pieceNames[pieceMatch[1]]
    const sq = clean.slice(-2)
    const capture = clean.includes("x") ? " takes " : " to "
    return `${piece}${capture}${sq}`
  }
  const sq = clean.slice(-2)
  const capture = clean.includes("x") ? "takes " : ""
  return `pawn ${capture}to ${sq}`
}

// Analyse one FEN with a fresh worker — white-relative score
export function analyseOnce(fen, movetime = 500) {
  return new Promise((resolve) => {
    const isLocal = window.location.hostname === "localhost"
    const path = isLocal ? "/stockfish.js" : "/castl/stockfish.js"
    const worker = new Worker(path)
    let score = 0
    let ready = false

    worker.onmessage = (e) => {
      const line = typeof e.data === "string" ? e.data : ""
      if (!ready) {
        if (line.includes("uciok"))   { worker.postMessage("isready"); return }
        if (line.includes("readyok")) {
          ready = true
          worker.postMessage(`position fen ${fen}`)
          worker.postMessage(`go movetime ${movetime}`)
        }
        return
      }
      const cpMatch   = line.match(/score cp (-?\d+)/)
      const mateMatch = line.match(/score mate (-?\d+)/)
      if (cpMatch)   score = parseInt(cpMatch[1])
      if (mateMatch) score = parseInt(mateMatch[1]) > 0 ? 9999 : -9999
      const bmMatch = line.match(/^bestmove (\S+)/)
      if (bmMatch) {
        const bestMove = bmMatch[1] === "(none)" ? null : bmMatch[1]
        worker.terminate()
        const c = new Chess(); c.load(fen)
        const whiteScore = c.turn() === "b" ? -score : score
        resolve({ score: whiteScore, bestMove })
      }
    }
    worker.postMessage("uci")
  })
}

// One worker processing a subset of positions sequentially
function runWorkerQueue(jobs) {
  return new Promise((resolve) => {
    const isLocal = window.location.hostname === "localhost"
    const path = isLocal ? "/stockfish.js" : "/castl/stockfish.js"
    const worker = new Worker(path)
    const results = []
    let idx = 0
    let score = 0
    let ready = false

    const sendNext = () => {
      if (idx >= jobs.length) { worker.terminate(); resolve(results); return }
      score = 0
      worker.postMessage(`position fen ${jobs[idx].fen}`)
      worker.postMessage("go depth 1")
    }

    worker.onmessage = (e) => {
      const line = typeof e.data === "string" ? e.data : ""
      if (!ready) {
        if (line.includes("uciok"))   { worker.postMessage("isready"); return }
        if (line.includes("readyok")) { ready = true; sendNext() }
        return
      }
      const cpMatch   = line.match(/score cp (-?\d+)/)
      const mateMatch = line.match(/score mate (-?\d+)/)
      if (cpMatch)   score = parseInt(cpMatch[1])
      if (mateMatch) score = parseInt(mateMatch[1]) > 0 ? 9999 : -9999
      const bmMatch = line.match(/^bestmove (\S+)/)
      if (bmMatch) {
        const bm = bmMatch[1] === "(none)" ? null : bmMatch[1]
        const c = new Chess(); c.load(jobs[idx].fen)
        const whiteScore = c.turn() === "b" ? -score : score
        results.push({ key: jobs[idx].key, fen: jobs[idx].fen, score: whiteScore, bestMove: bm })
        idx++
        sendNext()
      }
    }
    worker.postMessage("uci")
  })
}

// Pre-compute evals for all legal moves using N parallel workers
// Returns { results: Map<san, {postScore}>, preScore, preBestMove }
export function preComputeLegalMoves(fen, numWorkers = 2) {
  const chess = new Chess(); chess.load(fen)
  const legalMoves = chess.moves({ verbose: true })

  // Build full job list — preFen first, then all resulting positions
  const allJobs = [{ key: "__pre__", fen }]
  for (const m of legalMoves) {
    const c = new Chess(); c.load(fen)
    const moved = c.move({ from: m.from, to: m.to, promotion: m.promotion || undefined })
    if (moved) allJobs.push({ key: moved.san, fen: c.fen() })
  }

  // Split jobs evenly across workers
  const chunks = Array.from({ length: numWorkers }, () => [])
  allJobs.forEach((job, i) => chunks[i % numWorkers].push(job))

  // Run all workers in parallel, flatten results
  return Promise.all(chunks.filter(c => c.length > 0).map(runWorkerQueue))
    .then(workerResults => {
      const flat = workerResults.flat()
      const results = new Map()
      let preScore = 0
      let preBestMove = null

      for (const r of flat) {
        if (r.key === "__pre__") {
          preScore    = r.score
          preBestMove = r.bestMove
        } else {
          results.set(r.key, { postScore: r.score })
        }
      }

      return { results, preScore, preBestMove }
    })
}

// CoachOverlay
// preFen:       position BEFORE player's move
// moveSan:      SAN of player's move (null = no move yet)
// moveIndex:    half-move index (for book detection)
// cachedResult: pre-computed { classification, bestMove, bestMoveSan } — if set, show instantly
// onBestMove:   callback(uciString | null) for arrow
export default function CoachOverlay({ preFen, moveSan, moveIndex, cachedResult, onBestMove }) {
  const [status,         setStatus]         = useState("idle")
  const [classification, setClassification] = useState(null)
  const [bestMove,       setBestMove]       = useState(null)
  const [bestMoveSan,    setBestMoveSan]    = useState(null)
  const [bestRevealed,   setBestRevealed]   = useState(false)
  const lastAnalysedMove = useRef(null)

  // If we have a cached result, show it immediately
  useEffect(() => {
    if (!moveSan) {
      setStatus("idle")
      setClassification(null)
      setBestMove(null)
      setBestMoveSan(null)
      setBestRevealed(false)
      onBestMove?.(null)
      lastAnalysedMove.current = null
      return
    }

    if (moveSan === lastAnalysedMove.current) return
    lastAnalysedMove.current = moveSan

    setBestRevealed(false)
    onBestMove?.(null)

    if (cachedResult) {
      // Instant — use pre-computed result
      setClassification(cachedResult.classification)
      setBestMove(cachedResult.bestMove)
      setBestMoveSan(cachedResult.bestMoveSan)
      setStatus("done")
      return
    }

    // Fallback — compute now
    if (!preFen) { setStatus("idle"); return }
    setStatus("thinking")

    let cancelled = false
    ;(async () => {
      let postFen = null
      try {
        const c = new Chess(); c.load(preFen); c.move(moveSan)
        postFen = c.fen()
      } catch { setStatus("idle"); return }

      const [preRes, postRes] = await Promise.all([
        analyseOnce(preFen,  500),
        analyseOnce(postFen, 500),
      ])

      if (cancelled) return

      const preChess = new Chess(); preChess.load(preFen)
      const turn = preChess.turn()
      const moverBefore = turn === "w" ? preRes.score  : -preRes.score
      const moverAfter  = turn === "w" ? postRes.score : -postRes.score
      const cpLoss = Math.max(0, moverBefore - moverAfter)

      const cls = classifyMove(cpLoss, moveIndex ?? 0)
      const bm  = preRes.bestMove || null
      const san = uciToSan(preFen, bm)

      setClassification(cls)
      setBestMove(bm)
      setBestMoveSan(san)
      setStatus("done")
    })()

    return () => { cancelled = true }
  }, [moveSan, cachedResult])

  const handleReveal = () => {
    if (bestRevealed) { setBestRevealed(false); onBestMove?.(null) }
    else              { setBestRevealed(true);  onBestMove?.(bestMove) }
  }

  const classInfo     = classification ? CLASS[classification] : null
  const showRevealBtn = status === "done" && bestMove &&
    ["inaccuracy", "mistake", "blunder"].includes(classification)

  return (
    <div style={{
      padding: "10px 16px",
      borderBottom: "1px solid var(--border)",
      display: "flex", alignItems: "flex-start", gap: 10,
      minHeight: 52, flexShrink: 0, background: "var(--bg)",
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: "50%", flexShrink: 0, marginTop: 5,
        background: status === "thinking" ? "var(--gold)"
          : classInfo ? classInfo.color : "rgba(255,255,255,0.12)",
        transition: "background 0.3s",
        boxShadow: status === "done" && classInfo ? `0 0 6px ${classInfo.color}66` : "none",
      }} />

      <div style={{ flex: 1 }}>
        {status === "idle" && (
          <div style={{ fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: 13, color: "var(--text-muted)" }}>
            Make a move to get feedback.
          </div>
        )}
        {status === "thinking" && (
          <div style={{ fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: 13, color: "var(--text-muted)" }}>
            Analysing...
          </div>
        )}
        {status === "done" && classInfo && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: classInfo.color }}>
                {classInfo.emoji} {classInfo.label}
              </div>
              {showRevealBtn && (
                <button onClick={handleReveal} style={{
                  background: bestRevealed ? "rgba(201,169,110,0.12)" : "var(--bg2)",
                  border: `1px solid ${bestRevealed ? "rgba(201,169,110,0.3)" : "var(--border)"}`,
                  borderRadius: 10, padding: "3px 9px", fontSize: 10,
                  color: bestRevealed ? "var(--gold)" : "var(--text-muted)",
                  fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em", cursor: "pointer",
                }}>
                  {bestRevealed ? "Hide" : "Best move?"}
                </button>
              )}
            </div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5, marginTop: 2 }}>
              {classification === "brilliant" ? "Exceptional — stronger than the engine's top choice."
               : classification === "book"    ? "Known opening theory."
               : classification === "best" || classification === "excellent" ? "Strong continuation."
               : bestMoveSan
               ? `Best was ${sanToHuman(bestMoveSan)} (${bestMoveSan}).`
               : "Keep going."}
            </div>
          </>
        )}
      </div>
    </div>
  )
}