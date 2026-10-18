import { useEffect, useRef } from "react"

/** A line to draw this frame: from (px, py) to (tx, ty) */
type Seg = { px: number; py: number; tx: number; ty: number; size: number; alpha: number }

/** A young star or faint galaxy: where it sits in expanding space, when it lights up, how bright it gets */
type Speck = Seg & { qx: number; qy: number; born: number; peak: number; tone: number; seed: number }

/** A galaxy near enough to show its shape: a soft sprite, tilted and flattened */
type Galaxy = { qx: number; qy: number; born: number; size: number; tilt: number; flat: number; kind: number; peak: number }

type Mote = Seg & { x: number; y: number; vx: number; vy: number; life: number; heat: number; cool: number }

// Hot matter as it cools (same ramp as the plasma): dull red → orange → yellow → white → blue-white
const RAMP: [number, [number, number, number]][] = [
  [0, [70, 8, 20]],
  [0.25, [140, 20, 30]],
  [0.5, [255, 92, 20]],
  [0.75, [255, 204, 97]],
  [0.95, [255, 247, 235]],
  [1.2, [209, 230, 255]],
]
const STEPS = 14
const HEAT = Array.from({ length: STEPS }, (_, i) => {
  const k = (i / (STEPS - 1)) * 1.2
  let j = 0
  while (j < RAMP.length - 2 && k > RAMP[j + 1][0]) j++
  const [k0, c0] = RAMP[j]
  const [k1, c1] = RAMP[j + 1]
  const f = Math.min(1, Math.max(0, (k - k0) / (k1 - k0)))
  return `rgb(${c0.map((c, n) => Math.round(c + (c1[n] - c) * f)).join(",")})`
})
const heatIndex = (k: number) => Math.min(STEPS - 1, Math.max(0, Math.round((k / 1.2) * (STEPS - 1))))
// The first stars and faint galaxies: mostly white, some bluer, some warmer
const TONES = ["#f4f7ff", "#c9d6ff", "#ffe6c4"]

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5

/** A soft round glow on a small canvas, to stamp galaxies from */
function sprite(stops: [number, string][]) {
  const c = document.createElement("canvas")
  c.width = c.height = 64
  const g = c.getContext("2d")
  if (!g) return c
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  for (const [at, color] of stops) grad.addColorStop(at, color)
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return c
}

/**
 * The opening's matter, drawn on a 2D canvas over the plasma shader.
 *
 * "cosmos" follows NASA's own visualisation of the Big Bang, which is not an
 * explosion: nothing is thrown out from a centre. While the shader's glowing
 * fog fills the whole view and thins, the first stars and faint galaxies
 * light up everywhere at once inside it, loosely clumped the way gravity
 * gathers them, and the fog clears to a deep field of galaxies that keeps
 * drifting apart as space expands.
 *
 * "ejecta" is a real explosion, for the supernova: debris blasted outward
 * white-hot, cooling to red as it slows.
 */
export function BigBang({
  bang,
  origin,
  mode = "cosmos",
}: {
  bang: boolean
  /** Where it starts (viewport px); defaults to the centre */
  origin?: { x: number; y: number }
  mode?: "cosmos" | "ejecta"
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const bangRef = useRef(bang)
  bangRef.current = bang

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let w = 0
    let h = 0
    let dpr = 1
    let raf = 0
    let last = performance.now()
    let bangAt = 0

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const cx = origin?.x ?? w / 2
    const cy = origin?.y ?? h / 2
    const unit = Math.min(w, h)

    // ------------------------------------------------------------ cosmos: the first stars and galaxies, everywhere at once
    const specks: Speck[] = []
    const galaxies: Galaxy[] = []
    const sprites: HTMLCanvasElement[] = []
    if (mode === "cosmos") {
      const coarse = window.matchMedia("(pointer: coarse)").matches
      // Past every corner, so the expanding field never shows an edge
      const reach = Math.hypot(w, h) * 0.6
      // Gravity has begun to gather matter: some of it sits in loose clumps
      const clumps = Array.from({ length: coarse ? 7 : 12 }, () => {
        const a = Math.random() * Math.PI * 2
        const d = Math.sqrt(Math.random()) * reach * 0.8
        return { x: Math.cos(a) * d, y: Math.sin(a) * d }
      })
      const place = () => {
        if (Math.random() < 0.45) {
          const c = clumps[(Math.random() * clumps.length) | 0]
          const s = unit * (0.04 + Math.random() * 0.08)
          return { qx: c.x + gauss() * s, qy: c.y + gauss() * s }
        }
        const a = Math.random() * Math.PI * 2
        const d = Math.sqrt(Math.random()) * reach
        return { qx: Math.cos(a) * d, qy: Math.sin(a) * d }
      }
      const count = Math.round(Math.min(1500, (w * h) / 900))
      for (let i = 0; i < count; i++) {
        const big = Math.random() < 0.06
        specks.push({
          ...place(),
          // They light up across the whole view within the same moment, not spreading out from anywhere
          born: 0.55 + Math.random() * 0.9,
          peak: big ? 1 : 0.45 + 0.55 * Math.pow(Math.random(), 1.5),
          tone: Math.random() < 0.7 ? 0 : Math.random() < 0.5 ? 1 : 2,
          seed: Math.random(),
          px: 0,
          py: 0,
          tx: 0,
          ty: 0,
          size: big ? 2.2 + Math.random() * 1.4 : 0.8 + Math.random() * 1.2,
          alpha: 0,
        })
      }
      // A warm elliptical, a spiral with a gold core in a blue disc, a small blue irregular
      sprites.push(
        sprite([
          [0, "rgba(255,244,226,1)"],
          [0.25, "rgba(255,214,160,0.55)"],
          [1, "rgba(255,190,140,0)"],
        ]),
        sprite([
          [0, "rgba(255,240,215,1)"],
          [0.12, "rgba(255,226,190,0.7)"],
          [0.3, "rgba(175,195,255,0.35)"],
          [1, "rgba(140,160,255,0)"],
        ]),
        sprite([
          [0, "rgba(215,225,255,0.85)"],
          [0.4, "rgba(170,190,255,0.3)"],
          [1, "rgba(150,170,255,0)"],
        ]),
      )
      // A deep field: many small galaxies, a few near enough to be large, some seen edge-on
      for (let i = 0; i < (coarse ? 40 : 90); i++) {
        galaxies.push({
          ...place(),
          born: 1.0 + Math.random() * 0.6,
          size: unit * (0.012 + Math.pow(Math.random(), 2.2) * 0.035),
          tilt: Math.random() * Math.PI,
          flat: 0.15 + Math.random() * 0.85,
          kind: (Math.random() * 3) | 0,
          peak: 0.7 + Math.random() * 0.3,
        })
      }
    }

    // ------------------------------------------------------------ ejecta: debris from a real explosion
    let motes: Mote[] = []
    const explode = () => {
      const count = Math.round(Math.min(2600, (w * h) / 650))
      const reach = Math.hypot(w, h) * 0.55
      motes = Array.from({ length: count }, () => {
        const a = Math.random() * Math.PI * 2
        // Most debris stays near the star, a little flies to the edges of the screen
        const speed = (0.18 + Math.pow(Math.random(), 1.8) * 1.15) * reach * 2.4
        return {
          x: cx,
          y: cy,
          px: cx,
          py: cy,
          tx: cx,
          ty: cy,
          alpha: 1,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          size: 0.5 + Math.random() * 1.8,
          life: 0.6 + Math.random() * 0.4,
          heat: 0.85 + Math.random() * 0.35,
          cool: 0.55 + Math.random() * 0.9,
        }
      })
    }

    // One list per colour, so each colour is set once per frame
    const groups: Seg[][] = Array.from({ length: STEPS }, () => [])
    const colors = mode === "cosmos" ? TONES : HEAT
    const stroke = (color: string, list: Seg[]) => {
      if (!list.length) return
      ctx.strokeStyle = color
      for (const m of list) {
        ctx.globalAlpha = m.alpha
        ctx.lineWidth = m.size
        ctx.beginPath()
        ctx.moveTo(m.px, m.py)
        ctx.lineTo(m.tx, m.ty)
        ctx.stroke()
      }
    }

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = "lighter"
      ctx.lineCap = "round"
      for (const l of groups) l.length = 0
      if (bangRef.current && !bangAt) {
        bangAt = now
        if (mode === "ejecta") explode()
      }
      const t = bangAt ? (now - bangAt) / 1000 : -1

      if (mode === "cosmos" && t >= 0) {
        // Space keeps expanding, slowly now: everything drifts apart from everything else
        const a = 1 + t * 0.12
        // Then it all hands over to the galaxy behind the page
        const out = 1 - smooth(2.45, 2.85, t)
        for (const g of galaxies) {
          const lit = smooth(g.born, g.born + 0.4, t) * g.peak * out
          if (lit <= 0) continue
          const x = cx + g.qx * a
          const y = cy + g.qy * a
          const c = Math.cos(g.tilt) * g.size * dpr
          const s = Math.sin(g.tilt) * g.size * dpr
          ctx.globalAlpha = lit
          ctx.setTransform(c, s, -s * g.flat, c * g.flat, x * dpr, y * dpr)
          ctx.drawImage(sprites[g.kind], -0.5, -0.5, 1, 1)
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        for (const s of specks) {
          const lit = smooth(s.born, s.born + 0.3, t)
          if (lit <= 0) continue
          const x = cx + s.qx * a
          const y = cy + s.qy * a
          if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue
          // A zero-length line draws nothing, so each speck is a hair-length stroke (its round caps make the dot)
          s.px = x - 0.05
          s.py = y
          s.tx = x
          s.ty = y
          s.alpha = s.peak * lit * out * (0.85 + 0.15 * Math.sin(now / 220 + s.seed * 40))
          groups[s.tone].push(s)
        }
      } else if (mode === "ejecta" && t >= 0) {
        // Exponential drag: the blast slows to a gentle drift
        const drag = Math.pow(0.035, dt)
        for (const m of motes) {
          m.px = m.x
          m.py = m.y
          m.vx *= drag
          m.vy *= drag
          m.x += m.vx * dt
          m.y += m.vy * dt
          const fade = Math.max(0, 1 - t / (2.6 * m.life))
          if (fade <= 0) continue
          // Trail length follows speed, so the streaks shorten into points as they settle
          m.tx = m.x + (m.x - m.px) * 0.01
          m.ty = m.y + (m.y - m.py) * 0.01
          m.alpha = fade
          groups[heatIndex(m.heat * Math.exp(-t * m.cool))].push(m)
        }
      }

      for (let i = 0; i < groups.length; i++) stroke(colors[i], groups[i])
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = "source-over"
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    window.addEventListener("resize", resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
    // Set up once per blast; origin and mode are fixed for its lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />
}
