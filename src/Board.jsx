import { useRef } from "react"

const FILES = ["a","b","c","d","e","f","g","h"]
const RANKS = ["8","7","6","5","4","3","2","1"]

function pieceUrl(color, type) {
  const key = color + type.toUpperCase()
  return `https://lichess1.org/assets/piece/cburnett/${key}.svg`
}

function sqToCoords(sq, flipped = false) {
  const file = FILES.indexOf(sq[0])
  const rank = RANKS.indexOf(sq[1])
  return {
    col: flipped ? 7 - file : file,
    row: flipped ? 7 - rank : rank,
  }
}

function MoveArrow({ from, to, flipped, color = "rgba(201,169,110,0.88)" }) {
  if (!from || !to || from.length < 2 || to.length < 2) return null
  const fromC = sqToCoords(from.slice(0, 2), flipped)
  const toC   = sqToCoords(to.slice(0, 2), flipped)
  if (fromC.col < 0 || fromC.row < 0 || toC.col < 0 || toC.row < 0) return null

  const size = 800, sq = size / 8
  const x1 = fromC.col * sq + sq / 2, y1 = fromC.row * sq + sq / 2
  const x2 = toC.col   * sq + sq / 2, y2 = toC.row   * sq + sq / 2
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return null

  const shorten = 32
  const ex = x2 - (dx / len) * shorten
  const ey = y2 - (dy / len) * shorten
  const id = `arr-${from}-${to}`

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 5 }}
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="none"
    >
      <defs>
        <marker id={id} markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 Z" fill={color} />
        </marker>
      </defs>
      <line
        x1={x1} y1={y1} x2={ex} y2={ey}
        stroke={color} strokeWidth="22" strokeLinecap="round"
        markerEnd={`url(#${id})`} opacity="0.82"
        style={{ filter: "drop-shadow(0 1px 5px rgba(201,169,110,0.25))" }}
      />
    </svg>
  )
}

export default function Board({
  game,
  onMove,
  selectedSq,
  setSelectedSq,
  legalMoves = [],
  flipped = false,
  lastMove = null,
  bestMove = null,   // UCI string e.g. "e2e4" — draws arrow when set
}) {
  const lastTap = useRef(0)

  const files = flipped ? [...FILES].reverse() : FILES
  const ranks = flipped ? [...RANKS].reverse() : RANKS

  const isLight = (file, rank) => (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0

  const handleTap = (sq) => {
    if (!onMove) return
    if (selectedSq && legalMoves.includes(sq)) {
      onMove(selectedSq, sq)
      setSelectedSq(null)
      return
    }
    if (selectedSq === sq) { setSelectedSq(null); return }
    const piece = game.get(sq)
    if (piece && piece.color === game.turn()) { setSelectedSq(sq); return }
    setSelectedSq(null)
  }

  const onClick = (e, sq) => {
    if (Date.now() - lastTap.current < 500) return
    handleTap(sq)
  }

  const onTouchEnd = (e, sq) => {
    e.preventDefault()
    lastTap.current = Date.now()
    handleTap(sq)
  }

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "1", userSelect: "none", touchAction: "none" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        gridTemplateRows: "repeat(8, 1fr)",
        width: "100%",
        height: "100%",
        border: "2px solid rgba(255,255,255,0.1)",
        borderRadius: 4,
        overflow: "hidden",
      }}>
        {ranks.map((rank) =>
          files.map((file) => {
            const sq = file + rank
            const piece = game.get(sq)
            const light = isLight(file, rank)
            const isSelected = selectedSq === sq
            const isLegal = legalMoves.includes(sq)
            const isLastMove = lastMove && (lastMove.from === sq || lastMove.to === sq)

            let bgColor
            if (isSelected) bgColor = "#f6f669"
            else if (isLastMove) bgColor = light ? "#cdd26a" : "#aaa23a"
            else bgColor = light ? "#d9d9d9" : "#1e1e1c"

            return (
              <div
                key={sq}
                onClick={(e) => onClick(e, sq)}
                onTouchEnd={(e) => onTouchEnd(e, sq)}
                style={{
                  background: bgColor,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", position: "relative",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {isLegal && !piece && (
                  <div style={{ width: "32%", height: "32%", borderRadius: "50%", background: "rgba(0,0,0,0.18)", pointerEvents: "none" }} />
                )}
                {isLegal && piece && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "5px solid rgba(0,0,0,0.18)", pointerEvents: "none", zIndex: 1 }} />
                )}
                {piece && (
                  <img src={pieceUrl(piece.color, piece.type)} draggable={false}
                    style={{ width: "90%", height: "90%", objectFit: "contain", pointerEvents: "none", zIndex: 2 }} />
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Best move arrow — only rendered when bestMove is set */}
      {bestMove && bestMove.length >= 4 && (
        <MoveArrow
          from={bestMove.slice(0, 2)}
          to={bestMove.slice(2, 4)}
          flipped={flipped}
        />
      )}
    </div>
  )
}