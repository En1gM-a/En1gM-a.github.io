import { useEffect, useRef } from "react"

/** A line to draw this frame: from (px, py) to (tx, ty) */
type Seg = { px: number; py: number; tx: number; ty: number; size: number; alpha: number }

/** Matter in the young universe: a co-moving position, and where gravity will gather it */
type Grain = Seg & { qx: number; qy: number; gx: number; gy: number; pull: number; node: boolean; seed: number }

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
const GAS = "#8a96f0" // neutral hydrogen after the fog clears
const STAR = "#f3f6ff" // the first stars, igniting where the web's filaments meet

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * The opening's matter, drawn on a 2D canvas over the plasma shader.
 *
 * "cosmos" follows the Big Bang as cosmology tells it: not an explosion from a
 * point but space expanding everywhere at once. Inflation is the plasma
 * shader flooding the view within a few frames; the matter in it appears where
 * it already is (nothing is flung from a centre) and keeps stretching apart,
 * every grain receding from every other; it cools with the universe, goes dark
 * when the fog clears, and gravity gathers it into the filaments and knots of
 * the cosmic web, where the first stars ignite.
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
    let raf = 0
    let last = performance.now()
    let bangAt = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
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

    // ------------------------------------------------------------ cosmos: the field and the web it will fall into
    const grains: Grain[] = []
    const nodes: { x: number; y: number; m: number }[] = []
    const edges: [number, number][] = []
    const bends: { x: number; y: number }[] = []
    if (mode === "cosmos") {
      // Knots over a loose grid running past the edges, so the web fills the screen with no empty corner
      const cols = w > h ? 6 : 3
      const rows = w > h ? 4 : 5
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          nodes.push({
            x: w * (-0.04 + (1.08 * (c + 0.5 + (Math.random() - 0.5) * 0.85)) / cols),
            y: h * (-0.04 + (1.08 * (r + 0.5 + (Math.random() - 0.5) * 0.85)) / rows),
            m: 0.3 + 0.7 * Math.pow(Math.random(), 2),
          })
      // Filaments: each knot joins its three nearest neighbours, leaving voids between
      nodes.forEach((n, i) => {
        nodes
          .map((m, j) => ({ j, d: Math.hypot(m.x - n.x, m.y - n.y) }))
          .filter((e) => e.j !== i)
          .sort((a, b) => a.d - b.d)
          .slice(0, 3)
          .forEach(({ j }) => {
            if (edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) return
            edges.push([i, j])
            const m = nodes[j]
            const bend = (Math.random() - 0.5) * 0.5
            bends.push({ x: (n.x + m.x) / 2 - (m.y - n.y) * bend, y: (n.y + m.y) / 2 + (m.x - n.x) * bend })
          })
      })
      const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
      const count = Math.round(Math.min(2200, (w * h) / 650))
      for (let i = 0; i < count; i++) {
        // A round field reaching past every corner, so the expanding universe never shows an edge
        const ang = Math.random() * Math.PI * 2
        const rad = Math.sqrt(Math.random()) * Math.hypot(w, h) * 0.62
        const qx = Math.cos(ang) * rad
        const qy = Math.sin(ang) * rad
        const ex = cx + qx
        const ey = cy + qy
        // Gravity gathers each grain toward the structure nearest it; voids drain
        let near = 0
        let best = Infinity
        nodes.forEach((n, k) => {
          const d = Math.hypot(n.x - ex, n.y - ey)
          if (d < best) {
            best = d
            near = k
          }
        })
        const roll = Math.random()
        let gx = ex
        let gy = ey
        let pull = 1
        let node = false
        const hub = nodes[near]
        if (roll < 0.1 + 0.3 * hub.m) {
          const spread = unit * (0.008 + 0.022 * hub.m)
          gx = hub.x + gauss() * spread
          gy = hub.y + gauss() * spread
          node = true
        } else if (roll < 0.9) {
          const own = edges.map((_, k) => k).filter((k) => edges[k][0] === near || edges[k][1] === near)
          if (own.length) {
            const k = own[(Math.random() * own.length) | 0]
            const [a, b] = edges[k]
            const from = nodes[a === near ? a : b]
            const to = nodes[a === near ? b : a]
            const c = bends[k]
            // A point on the curved filament, from the nearer knot to about halfway
            const u = Math.random() * 0.55
            const bx = (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * c.x + u * u * to.x
            const by = (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * c.y + u * u * to.y
            const len = Math.hypot(to.x - from.x, to.y - from.y) || 1
            const off = gauss() * unit * 0.009
            gx = bx - ((to.y - from.y) / len) * off
            gy = by + ((to.x - from.x) / len) * off
          }
        } else pull = 0.15
        grains.push({ qx, qy, gx, gy, pull, node, seed: Math.random(), px: cx, py: cy, tx: cx, ty: cy, size: 0.8 + Math.random() * 1.4, alpha: 0 })
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
    const groups: Seg[][] = Array.from({ length: STEPS + 2 }, () => [])
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

    // Scale factor of the universe once inflation has filled the view: a slowing stretch
    const scale = (t: number) => 0.85 + 0.35 * (1 - Math.exp(-Math.max(0, t - 0.22) * 1.2))

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
        const a = scale(t)
        // Hot until the fog clears, then neutral gas; gravity builds the web; it all hands over to the galaxy
        const temp = 1.25 * Math.exp(-t * 1.5)
        const clear = smooth(1.0, 1.5, t)
        const web = smooth(1.25, 2.15, t)
        const out = 1 - smooth(2.45, 2.85, t)
        // Matter shows once the plasma fills the view, never as debris racing out of a fireball
        const born = smooth(0.22, 0.45, t)
        const hotGroup = heatIndex(temp)
        if (born > 0) for (const g of grains) {
          const ex = cx + g.qx * a
          const ey = cy + g.qy * a
          const k = web * g.pull
          const x = ex + (g.gx - ex) * k
          const y = ey + (g.gy - ey) * k
          // A zero-length line draws nothing, so each grain is a hair-length stroke (its round caps make the dot)
          g.px = x - 0.05
          g.py = y
          g.tx = x
          g.ty = y
          if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue
          const star = g.node && web > 0.55
          const twinkle = 0.75 + 0.25 * Math.sin(now / 160 + g.seed * 40)
          g.alpha = (star ? 0.45 + 0.55 * smooth(0.55, 1, web) * twinkle : (1 - clear) * 0.6 + clear * (0.35 + 0.5 * web)) * out * born
          groups[star ? STEPS + 1 : clear > 0.5 ? STEPS : hotGroup].push(g)
        }
        if (web > 0.2) {
          // Gas glowing faintly along the filaments of the cosmic web
          const f = smooth(0.2, 1, web) * out
          ctx.globalAlpha = 1
          for (const [width, alpha] of [
            [unit * 0.04, 0.02],
            [unit * 0.012, 0.03],
          ]) {
            ctx.lineWidth = width
            ctx.strokeStyle = `rgba(150,160,255,${(alpha * f).toFixed(3)})`
            ctx.beginPath()
            edges.forEach(([i, j], k) => {
              ctx.moveTo(nodes[i].x, nodes[i].y)
              ctx.quadraticCurveTo(bends[k].x, bends[k].y, nodes[j].x, nodes[j].y)
            })
            ctx.stroke()
          }
          // Where filaments meet, the first stars and galaxies light up
          for (const n of nodes) {
            const r = unit * (0.015 + 0.045 * n.m)
            const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r)
            glow.addColorStop(0, `rgba(235,240,255,${(0.65 * n.m * f).toFixed(3)})`)
            glow.addColorStop(0.2, `rgba(180,190,255,${(0.3 * n.m * f).toFixed(3)})`)
            glow.addColorStop(1, "rgba(120,110,230,0)")
            ctx.fillStyle = glow
            ctx.fillRect(n.x - r, n.y - r, r * 2, r * 2)
          }
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

      for (let i = 0; i < groups.length; i++) stroke(i < STEPS ? HEAT[i] : i === STEPS ? GAS : STAR, groups[i])
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
