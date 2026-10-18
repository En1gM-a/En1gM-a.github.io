import { useEffect, useRef } from "react"

/** A line to draw this frame: from (px, py) to (tx, ty) */
type Seg = { px: number; py: number; tx: number; ty: number; size: number; alpha: number }

type Mote = Seg & {
  x: number
  y: number
  vx: number
  vy: number
  px: number
  py: number
  size: number
  life: number
  /** Starting temperature (0..1.2) and how fast it cools; dust keeps its colour */
  heat: number
  cool: number
  dust: number
}

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
// Some cold dust in the site's colours rides along with the blast
const DUST = ["#67e8f9", "#a78bfa", "#93c5fd", "#f0abfc"]

/**
 * Canvas for the opening: stray matter spirals into a singularity, heating as
 * it falls; then on `bang` thousands of motes blast outward white-hot with
 * streaking trails, cool through yellow, orange and red as they slow, and
 * linger as embers and dust.
 */
export function BigBang({
  bang,
  origin,
  infall: withInfall = true,
}: {
  bang: boolean
  /** Where the blast starts (viewport px); defaults to the centre */
  origin?: { x: number; y: number }
  /** Show matter spiralling into the singularity before the bang */
  infall?: boolean
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
    const start = last
    let exploded = false
    let explodedAt = 0
    let motes: Mote[] = []
    // One list per colour, so each colour is set once per frame
    const groups: Seg[][] = Array.from({ length: STEPS + DUST.length }, () => [])

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    // Matter falling inward toward the singularity
    const infall = Array.from({ length: 360 }, () => {
      const a = Math.random() * Math.PI * 2
      const r = 160 + Math.random() * Math.max(w, h) * 0.6
      return {
        a,
        r,
        px: w / 2 + Math.cos(a) * r,
        py: h / 2 + Math.sin(a) * r,
        tx: 0,
        ty: 0,
        alpha: 0,
        speed: 0.7 + Math.random() * 1,
        size: 0.8 + Math.random() * 1.6,
        dust: Math.random() < 0.3 ? (Math.random() * DUST.length) | 0 : -1,
      }
    })

    const explode = () => {
      exploded = true
      explodedAt = performance.now()
      const cx = origin?.x ?? w / 2
      const cy = origin?.y ?? h / 2
      const count = Math.round(Math.min(2600, (w * h) / 650))
      const reach = Math.hypot(w, h) * 0.55
      motes = Array.from({ length: count }, () => {
        const a = Math.random() * Math.PI * 2
        // Most motes stay near the centre, a few fly to the edges of the screen
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
          dust: Math.random() < 0.18 ? (Math.random() * DUST.length) | 0 : -1,
        }
      })
    }

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
      const t = (now - start) / 1000
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = "lighter"
      ctx.lineCap = "round"
      const cx = w / 2
      const cy = h / 2
      for (const l of groups) l.length = 0

      if (!exploded) {
        if (bangRef.current) explode()
        // Infall: spiralling inward, heating and brightening as it nears the centre
        for (const m of withInfall ? infall : []) {
          m.r = Math.max(0, m.r - m.speed * m.r * dt * 1.6)
          m.a += dt * (2.6 / (1 + m.r / 120))
          const x = cx + Math.cos(m.a) * m.r
          const y = cy + Math.sin(m.a) * m.r
          const near = Math.max(0, 1 - m.r / 700)
          const k = Math.min(1, t / 0.35) * (0.45 + 0.55 * near)
          m.tx = x
          m.ty = y
          m.alpha = k
          groups[m.dust >= 0 ? STEPS + m.dust : heatIndex(0.35 + 0.8 * near)].push(m)
        }
      } else {
        const age = (now - explodedAt) / 1000
        // Exponential drag: the blast slows to a gentle drift
        const drag = Math.pow(0.035, dt)
        for (const m of motes) {
          m.px = m.x
          m.py = m.y
          m.vx *= drag
          m.vy *= drag
          m.x += m.vx * dt
          m.y += m.vy * dt
          const fade = Math.max(0, 1 - age / (2.6 * m.life))
          if (fade <= 0) continue
          // Trail length follows speed, so the streaks shorten into points as they settle
          m.tx = m.x + (m.x - m.px) * 0.01
          m.ty = m.y + (m.y - m.py) * 0.01
          m.alpha = fade
          groups[m.dust >= 0 ? STEPS + m.dust : heatIndex(m.heat * Math.exp(-age * m.cool))].push(m)
        }
      }
      for (let g = 0; g < groups.length; g++) stroke(g < STEPS ? HEAT[g] : DUST[g - STEPS], groups[g])
      // The infall's trail starts where this frame's segment ended
      if (!exploded)
        for (const m of infall) {
          m.px = m.tx
          m.py = m.ty
        }
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
  }, [])

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />
}
