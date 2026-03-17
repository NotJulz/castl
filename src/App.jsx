import { useState, useEffect } from "react"
import Game from "./Game"
import Review from "./Review" 

// ── orientation hook ──────────────────────────────────────
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

// ── localStorage helpers ──────────────────────────────────
const STORAGE_KEYS = {
  activeGame: "castl_active_game",
  completedGames: "castl_completed_games",
}

function loadActiveGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.activeGame)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveActiveGame(data) {
  try {
    if (data) localStorage.setItem(STORAGE_KEYS.activeGame, JSON.stringify(data))
    else localStorage.removeItem(STORAGE_KEYS.activeGame)
  } catch {}
}

function loadCompletedGames() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.completedGames)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveCompletedGame(game) {
  try {
    const existing = loadCompletedGames()
    const updated = [game, ...existing].slice(0, 50)
    localStorage.setItem(STORAGE_KEYS.completedGames, JSON.stringify(updated))
  } catch {}
}

// ── mock data ─────────────────────────────────────────────
const MOCK_GAMES = [
  { isMock: true, avatar: "👨🏿", name: "Kwame", meta: "Blitz · 5 min",  result: "Win",  resultColor: "var(--green)" },
  { isMock: true, avatar: "👩🏻", name: "Sofia", meta: "Bullet · 1 min", result: "Loss", resultColor: "var(--red)" },
  { isMock: true, avatar: "🧔🏽", name: "Arjun", meta: "Rapid · 10 min", result: "Draw", resultColor: "var(--text-muted)" },
]

function formatDate(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now - d) / 1000 / 60)
  if (diff < 60) return `${diff}m ago`
  if (diff < 60 * 24) return `${Math.floor(diff / 60)}h ago`
  if (diff < 60 * 24 * 2) return "Yesterday"
  return d.toLocaleDateString()
}

function gameToRow(g) {
  return {
    isMock: false,
    avatar: "🤖",
    name: "Stockfish",
    meta: `${g.difficulty} · ${Math.ceil(g.moves.length / 2)} moves · ${formatDate(g.date)}`,
    result: g.result === "win" ? "Win" : g.result === "loss" ? "Loss" : "Draw",
    resultColor: g.result === "win" ? "var(--green)" : g.result === "loss" ? "var(--red)" : "var(--text-muted)",
  }
}

// ── confirm modal ─────────────────────────────────────────
function ConfirmModal({ onContinue, onNewGame }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "rgba(14,14,12,0.85)",
      backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200,
    }}>
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 24, padding: "28px 24px", width: "min(300px, 90%)",
        textAlign: "center", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(201,169,110,0.5), transparent)" }} />
        <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: 22, marginBottom: 8 }}>Unfinished game</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>You have a game in progress. Continue where you left off or start fresh?</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onNewGame} style={{ flex: 1, padding: 13, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg3)", color: "var(--text-dim)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>New game</button>
          <button onClick={onContinue} style={{ flex: 1, padding: 13, borderRadius: 14, border: "none", background: "var(--text)", color: "var(--bg)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Continue</button>
        </div>
      </div>
    </div>
  )
}

// ── active game banner ────────────────────────────────────
function ActiveGameBanner({ activeGame, onResume }) {
  if (!activeGame) return null
  const moveCount = Math.ceil((activeGame.moves?.length || 0) / 2)
  const turn = activeGame.moves?.length % 2 === 0
    ? (activeGame.playerColor === "w" ? "Your turn" : "Computer's turn")
    : (activeGame.playerColor === "b" ? "Your turn" : "Computer's turn")

  return (
    <div style={{ margin: "16px 24px", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 20, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(201,169,110,0.4), transparent)" }} />
      <div style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gridTemplateRows: "repeat(4,1fr)", flexShrink: 0 }}>
        {["d","l","d","l","l","d","l","d","d","l","d","l","l","d","l","d"].map((c,i) => (
          <div key={i} style={{ background: c === "l" ? "#3a3830" : "#252420" }} />
        ))}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--gold)", fontWeight: 500, marginBottom: 3 }}>{turn}</div>
        <div style={{ fontSize: 15 }}>🤖 Stockfish</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>{activeGame.difficulty} · {moveCount} moves played</div>
      </div>
      <button onClick={onResume} style={{ background: "var(--text)", color: "var(--bg)", border: "none", borderRadius: 20, padding: "8px 16px", fontSize: 12, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>Resume</button>
    </div>
  )
}

// ── recent game row ───────────────────────────────────────
function RecentRow({ g }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)", opacity: g.isMock ? 0.35 : 1 }}>
      <div style={{ fontSize: 26 }}>{g.avatar}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, marginBottom: 2 }}>{g.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 300 }}>{g.meta}</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.06)", color: g.resultColor }}>{g.result}</div>
    </div>
  )
}

// ── lobby ─────────────────────────────────────────────────
function Lobby({ onPlayComputer, onResumeGame, activeGame, completedGames, orientation }) {
  const [timeControl, setTimeControl] = useState("3'")
  const times = [
    { label: "Bullet", value: "1'" },
    { label: "Blitz",  value: "3'" },
    { label: "Blitz",  value: "5'" },
    { label: "Rapid",  value: "10'" },
    { label: "Async",  value: "∞" },
  ]

  const modeCards = [
    { icon: "♟",  title: "Quick match",   sub: "Random opponent",            onClick: null },
    { icon: "🤖", title: "vs Computer",   sub: "Stockfish · set difficulty", onClick: onPlayComputer },
    { icon: "🔗", title: "Play a friend", sub: "Share a link or code",       onClick: null },
  ]

  const realRows = completedGames.slice(0, 3).map(gameToRow)
  const mockPad = MOCK_GAMES.slice(0, Math.max(0, 3 - realRows.length))
  const recentRows = [...realRows, ...mockPad]

  const playSection = (
    <>
      <ActiveGameBanner activeGame={activeGame} onResume={onResumeGame} />
      <SectionLabel>Play</SectionLabel>
      <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: 10 }}>
        {modeCards.map((m) => (
          <div key={m.title} onClick={m.onClick || undefined}
            style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 20, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, cursor: m.onClick ? "pointer" : "default", opacity: m.onClick ? 1 : 0.5 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "var(--bg3)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{m.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, letterSpacing: "-0.01em", marginBottom: 3 }}>{m.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 300 }}>{m.sub}</div>
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 18 }}>›</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "20px 24px 0" }}>
        <SectionLabel style={{ padding: 0 }}>Time control</SectionLabel>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {times.map((t) => {
            const active = timeControl === t.value
            return (
              <div key={t.value + t.label} onClick={() => setTimeControl(t.value)}
                style={{ flex: 1, background: active ? "var(--text)" : "var(--bg2)", border: `1px solid ${active ? "var(--text)" : "var(--border)"}`, borderRadius: 14, padding: "12px 8px", textAlign: "center", cursor: "pointer" }}>
                <div style={{ fontSize: 18, color: active ? "var(--bg)" : "var(--text)", fontFamily: "'DM Serif Display', serif", lineHeight: 1, marginBottom: 4 }}>{t.value}</div>
                <div style={{ fontSize: 10, color: active ? "rgba(20,20,18,0.5)" : "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{t.label}</div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ padding: "20px 24px 0" }}>
        <button style={{ width: "100%", background: "var(--text)", color: "var(--bg)", border: "none", borderRadius: 18, padding: 17, fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>♟</span> Find Game
        </button>
      </div>
    </>
  )

  const recentSection = (
    <div style={{ padding: "24px 24px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionLabel style={{ padding: 0 }}>Recent</SectionLabel>
        <span style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>See all</span>
      </div>
      {recentRows.map((g, i) => <RecentRow key={i} g={g} />)}
    </div>
  )

  const header = (
    <div style={{ padding: "20px 24px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: 28, letterSpacing: "-0.01em" }}>Castl</div>
      <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--bg3)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🧑🏻</div>
    </div>
  )

  if (orientation === "landscape") {
    return (
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left col — play */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", scrollbarWidth: "none", borderRight: "1px solid var(--border)" }}>
          {header}
          {playSection}
          <div style={{ height: 24 }} />
        </div>
        {/* Right col — recent */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", scrollbarWidth: "none" }}>
          {recentSection}
          <div style={{ height: 24 }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: 90, scrollbarWidth: "none" }}>
      {header}
      {playSection}
      {recentSection}
    </div>
  )
}

// ── shared components ─────────────────────────────────────
function Puzzles() {
  return <Placeholder icon="🧩" title="Puzzles" sub="Daily puzzles & tactics coming soon" />
}

function Profile() {
  return <Placeholder icon="👤" title="Profile" sub="Your stats & history coming soon" />
}

function SectionLabel({ children, style }) {
  return (
    <div style={{ padding: "20px 24px 12px", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 500, ...style }}>
      {children}
    </div>
  )
}

function Placeholder({ icon, title, sub }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.4 }}>
      <div style={{ fontSize: 48 }}>{icon}</div>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: 22 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{sub}</div>
    </div>
  )
}

const TABS = [
  { id: "play",    icon: "♟",  label: "Play" },
  { id: "puzzles", icon: "🧩", label: "Puzzles" },
  { id: "review",  icon: "📋", label: "Review" },
  { id: "profile", icon: "👤", label: "Profile" },
]

// ── app root ──────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("play")
  const [screen, setScreen] = useState("lobby")
  const [showConfirm, setShowConfirm] = useState(false)
  const [activeGame, setActiveGame] = useState(() => loadActiveGame())
  const [completedGames, setCompletedGames] = useState(() => loadCompletedGames())
  const [resumeData, setResumeData] = useState(null)
  const orientation = useOrientation()
  const [reviewerOpen, setReviewerOpen] = useState(false)


  useEffect(() => { saveActiveGame(activeGame) }, [activeGame])

  const handlePlayComputer = () => {
    if (activeGame) setShowConfirm(true)
    else setScreen("game")
  }

  const handleResumeGame = () => {
    setResumeData(activeGame)
    setScreen("game")
  }

  const handleConfirmContinue = () => {
    setShowConfirm(false)
    setResumeData(activeGame)
    setScreen("game")
  }

  const handleConfirmNewGame = () => {
    setShowConfirm(false)
    setActiveGame(null)
    setResumeData(null)
    setScreen("game")
  }

  const handleGameProgress = (data) => setActiveGame(data)

  const handleGameComplete = (completedGame) => {
    saveCompletedGame(completedGame)
    setCompletedGames(loadCompletedGames())
    setActiveGame(null)
  }

  const handleBack = () => {
    setScreen("lobby")
    setResumeData(null)
  }

  const shell = (children) => (
    <div style={{
      width: "100vw",
      height: "100dvh",
      background: "var(--bg)",
      display: "flex",
      flexDirection: orientation === "landscape" ? "row" : "column",
      overflow: "hidden",
      position: "relative",
    }}>
      {children}
    </div>
  )

  if (screen === "game") {
    return shell(
      <Game
        onBack={handleBack}
        onGameProgress={handleGameProgress}
        onGameComplete={handleGameComplete}
        resumeData={resumeData}
      />
    )
  }

  const content = {
    play: (
      <Lobby
        onPlayComputer={handlePlayComputer}
        onResumeGame={handleResumeGame}
        activeGame={activeGame}
        completedGames={completedGames}
        orientation={orientation}
      />
    ),
    puzzles: <Puzzles />,
    review: <Review onReviewerOpen={setReviewerOpen} />,
    profile: <Profile />,
  }[tab]

  // ── portrait — bottom nav ─────────────────────────────
  if (orientation === "portrait") {
    return shell(
      <>
        {content}
        {showConfirm && <ConfirmModal onContinue={handleConfirmContinue} onNewGame={handleConfirmNewGame} />}
        <div style={{
          height: 82, background: "var(--bg)", borderTop: "1px solid var(--border)",
          display: reviewerOpen ? "none" : "flex", alignItems: "flex-start", justifyContent: "space-around",
          paddingTop: 12, flexShrink: 0, zIndex: 10,
        }}>

          {TABS.map((t) => (
            <div key={t.id} onClick={() => setTab(t.id)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", opacity: tab === t.id ? 1 : 0.35, transition: "opacity 0.15s" }}>
              <div style={{ fontSize: 22, lineHeight: 1 }}>{t.icon}</div>
              <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.label}</div>
            </div>
          ))}
        </div>
      </>
    )
  }

  // ── landscape — side nav rail ─────────────────────────
  return shell(
    <>
      <div style={{
        width: reviewerOpen ? 0 : 64, height: "100%", background: "var(--bg)",
        borderRight: reviewerOpen ? "none" : "1px solid var(--border)",
        display: reviewerOpen ? "none" : "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 8, flexShrink: 0, zIndex: 10,
      }}>
        {TABS.map((t) => (
          <div key={t.id} onClick={() => setTab(t.id)}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer", opacity: tab === t.id ? 1 : 0.35, transition: "opacity 0.15s", padding: "10px 0", width: "100%" }}>
            <div style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</div>
            <div style={{ fontSize: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.label}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
        {content}
        {showConfirm && <ConfirmModal onContinue={handleConfirmContinue} onNewGame={handleConfirmNewGame} />}
      </div>
    </>
  )
}
