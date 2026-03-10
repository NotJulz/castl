import { useState } from "react"

// ── screens ──────────────────────────────────────────────
function Lobby({ setTab }) {
  const [timeControl, setTimeControl] = useState("3'")
  const times = [
    { label: "Bullet", value: "1'" },
    { label: "Blitz",  value: "3'" },
    { label: "Blitz",  value: "5'" },
    { label: "Rapid",  value: "10'" },
    { label: "Async",  value: "∞" },
  ]

  return (
    <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: 90, scrollbarWidth: "none" }}>

      {/* Header */}
      <div style={{ padding: "20px 24px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: 28, letterSpacing: "-0.01em" }}>Castl</div>
        <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--bg3)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🧑🏻</div>
      </div>

      {/* Active game banner */}
      <div style={{ margin: "16px 24px", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 20, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(201,169,110,0.4), transparent)" }} />
        <div style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gridTemplateRows: "repeat(4,1fr)", flexShrink: 0 }}>
          {["d","l","d","l","l","d","l","d","d","l","d","l","l","d","l","d"].map((c,i) => (
            <div key={i} style={{ background: c === "l" ? "#3a3830" : "#252420" }} />
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--gold)", fontWeight: 500, marginBottom: 3 }}>Your turn</div>
          <div style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>👩🏽 Mariana</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>Blitz · 3:42 remaining</div>
        </div>
        <button style={{ background: "var(--text)", color: "var(--bg)", border: "none", borderRadius: 20, padding: "8px 16px", fontSize: 12, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>Resume</button>
      </div>

      {/* Play section */}
      <SectionLabel>Play</SectionLabel>
      <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { icon: "♟", title: "Quick match", sub: "Random opponent" },
          { icon: "🤖", title: "vs Computer", sub: "Stockfish · set difficulty" },
          { icon: "🔗", title: "Play a friend", sub: "Share a link or code" },
        ].map((m) => (
          <div key={m.title} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 20, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "var(--bg3)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{m.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, letterSpacing: "-0.01em", marginBottom: 3 }}>{m.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 300 }}>{m.sub}</div>
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 18 }}>›</div>
          </div>
        ))}
      </div>

      {/* Time controls */}
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

      {/* Find game button */}
      <div style={{ padding: "20px 24px 0" }}>
        <button style={{ width: "100%", background: "var(--text)", color: "var(--bg)", border: "none", borderRadius: 18, padding: 17, fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>♟</span> Find Game
        </button>
      </div>

      {/* Recent games */}
      <div style={{ padding: "24px 24px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <SectionLabel style={{ padding: 0 }}>Recent</SectionLabel>
          <span style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>See all</span>
        </div>
        {[
          { avatar: "👨🏿", name: "Kwame",  meta: "Blitz · 5 min · 2h ago",   result: "Win",  style: { color: "var(--green)" } },
          { avatar: "👩🏻", name: "Sofia",  meta: "Bullet · 1 min · Yesterday", result: "Loss", style: { color: "var(--red)" } },
          { avatar: "🧔🏽", name: "Arjun",  meta: "Rapid · 10 min · Yesterday", result: "Draw", style: { color: "var(--text-muted)" } },
        ].map((g) => (
          <div key={g.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 26 }}>{g.avatar}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, marginBottom: 2 }}>{g.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 300 }}>{g.meta}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.05em", padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.06)", ...g.style }}>{g.result}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Puzzles() {
  return <Placeholder icon="🧩" title="Puzzles" sub="Daily puzzles & tactics coming soon" />
}

function Review() {
  return <Placeholder icon="📋" title="Review" sub="Game analysis coming soon" />
}

function Profile() {
  return <Placeholder icon="👤" title="Profile" sub="Your stats & history coming soon" />
}

// ── shared components ─────────────────────────────────────
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

// ── bottom nav ────────────────────────────────────────────
const TABS = [
  { id: "play",    icon: "♟",  label: "Play" },
  { id: "puzzles", icon: "🧩", label: "Puzzles" },
  { id: "review",  icon: "📋", label: "Review" },
  { id: "profile", icon: "👤", label: "Profile" },
]

// ── app root ──────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("play")

  const screen = {
    play:    <Lobby setTab={setTab} />,
    puzzles: <Puzzles />,
    review:  <Review />,
    profile: <Profile />,
  }[tab]

  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        width: "min(375px, 100vw)",
        height: "min(812px, 100vh)",
        background: "var(--bg)",
        borderRadius: "clamp(0px, 4vw, 52px)",
        overflow: "hidden",
        position: "relative",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 40px 80px rgba(0,0,0,0.7)",
        display: "flex",
        flexDirection: "column",
      }}>

        {/* Screen content */}
        {screen}

        {/* Bottom nav */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: 82,
          background: "var(--bg)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-around",
          paddingTop: 12,
          zIndex: 10,
        }}>
          {TABS.map((t) => (
            <div key={t.id} onClick={() => setTab(t.id)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", opacity: tab === t.id ? 1 : 0.35, transition: "opacity 0.15s" }}>
              <div style={{ fontSize: 22, lineHeight: 1 }}>{t.icon}</div>
              <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.label}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
