import { useEffect, useRef } from "react"

type Mote = { x: number; y: number; vx: number; vy: number; px: number; py: number; size: number; color: string; life: number }

const COLORS = ["#ffffff", "#e0f7ff", "#67e8f9", "#a78bfa", "#f0abfc", "#93c5fd"]

/**
 * Canvas for the opening: stray matter spirals into a singularity, then on
 * `bang` thousands of motes blast outward with streaking trails, slow down
 * and linger as fresh stars.
 */
export function BigBang({ bang }: { bang: boolean }) {
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
        speed: 0.7 + Math.random() * 1,
        size: 0.8 + Math.random() * 1.6,
        color: COLORS[(Math.random() * COLORS.length) | 0],
      }
    })

    const explode = () => {
      exploded = true
      explodedAt = performance.now()
      const cx = w / 2
      const cy = h / 2
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
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          size: 0.5 + Math.random() * 1.8,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          life: 0.6 + Math.random() * 0.4,
        }
      })
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

      if (!exploded) {
        if (bangRef.current) explode()
        // Infall: spiralling inward, brightening as it nears the centre
        for (const m of infall) {
          m.r = Math.max(0, m.r - m.speed * m.r * dt * 1.6)
          m.a += dt * (2.6 / (1 + m.r / 120))
          const x = cx + Math.cos(m.a) * m.r
          const y = cy + Math.sin(m.a) * m.r
          // Fade in at the start; brighter the closer it gets to the singularity
          const k = Math.min(1, t / 0.35) * (0.45 + 0.55 * Math.max(0, 1 - m.r / 700))
          ctx.globalAlpha = k
          ctx.strokeStyle = m.color
          ctx.lineWidth = m.size
          ctx.beginPath()
          ctx.moveTo(m.px, m.py)
          ctx.lineTo(x, y)
          ctx.stroke()
          m.px = x
          m.py = y
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
          ctx.globalAlpha = fade
          ctx.strokeStyle = m.color
          ctx.lineWidth = m.size
          ctx.beginPath()
          ctx.moveTo(m.px, m.py)
          // Trail length follows speed, so the streaks shorten into points as they settle
          ctx.lineTo(m.x + (m.x - m.px) * 0.01, m.y + (m.y - m.py) * 0.01)
          ctx.stroke()
        }
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
