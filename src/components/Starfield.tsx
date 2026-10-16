import { useEffect, useRef } from "react"
import { useReducedMotion } from "motion/react"

type Star = { x: number; y: number; z: number; r: number; phase: number; speed: number }
type Meteor = { x: number; y: number; vx: number; vy: number; life: number }

/** Full-page fixed starfield with depth parallax, twinkle and the odd shooting star. */
export function Starfield({ visible }: { visible: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let w = 0
    let h = 0
    let stars: Star[] = []
    let meteor: Meteor | null = null
    let nextMeteor = performance.now() + 4000
    let raf = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.max(140, Math.min(460, Math.round((w * h) / 4200)))
      stars = []
      for (let i = 0; i < count; i++) {
        const z = Math.random() ** 2 * 0.9 + 0.1
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          r: 0.35 + z * 1.15,
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 1.8,
        })
      }
      if (reduce) draw(0)
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      const scroll = window.scrollY
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        let y = (s.y - scroll * s.z * 0.12) % h
        if (y < 0) y += h
        const twinkle = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(t * 0.001 * s.speed + s.phase)
        ctx.globalAlpha = (0.25 + s.z * 0.75) * twinkle
        ctx.fillStyle = s.z > 0.75 ? "#e6f6ff" : s.z > 0.4 ? "#c9d4ff" : "#9aa6d8"
        ctx.beginPath()
        ctx.arc(s.x, y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    const drawMeteor = (t: number) => {
      if (!meteor && t > nextMeteor) {
        const fromLeft = Math.random() > 0.5
        meteor = {
          x: fromLeft ? Math.random() * w * 0.5 : w * 0.5 + Math.random() * w * 0.5,
          y: Math.random() * h * 0.35,
          vx: (fromLeft ? 1 : -1) * (7 + Math.random() * 4),
          vy: 3 + Math.random() * 2,
          life: 1,
        }
      }
      if (!meteor) return
      const m = meteor
      const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 14, m.y - m.vy * 14)
      grad.addColorStop(0, `rgba(210,245,255,${0.85 * m.life})`)
      grad.addColorStop(1, "rgba(210,245,255,0)")
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(m.x, m.y)
      ctx.lineTo(m.x - m.vx * 14, m.y - m.vy * 14)
      ctx.stroke()
      m.x += m.vx
      m.y += m.vy
      m.life -= 0.012
      if (m.life <= 0 || m.x < -200 || m.x > w + 200 || m.y > h + 200) {
        meteor = null
        nextMeteor = t + 5000 + Math.random() * 6000
      }
    }

    const loop = (t: number) => {
      draw(t)
      drawMeteor(t)
      raf = requestAnimationFrame(loop)
    }

    resize()
    window.addEventListener("resize", resize)

    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && !reduce) raf = requestAnimationFrame(loop)
    }
    const onScroll = () => reduce && draw(0)

    if (!reduce) raf = requestAnimationFrame(loop)
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      window.removeEventListener("scroll", onScroll)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [reduce])

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 transition-opacity duration-[1600ms] ease-out"
      style={{ opacity: visible ? 1 : 0 }}
    />
  )
}
