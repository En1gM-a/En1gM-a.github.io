import { useEffect, useRef } from "react"
import { useReducedMotion } from "motion/react"

type Wave = { x: number; y: number; at: number; sparks: { angle: number; reach: number; size: number }[] }

const LIFE = 900 // ms

/**
 * Open space answers back: a click anywhere that isn't a control sets off a shockwave there, a cyan ring
 * with a violet one inside it and a spray of sparks, bursting fast and thinning out as it fades. None with
 * reduced motion.
 */
export function Shockwave() {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const waves: Wave[] = []
    let raf = 0

    // Sized by its own box, not the window, so a visible scrollbar can't stretch the drawing off the pointer
    const fit = () => {
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
    }
    const draw = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i]
        const p = (now - w.at) / LIFE
        if (p >= 1) {
          waves.splice(i, 1)
          continue
        }
        // Bursts fast, then slows and thins as it fades; everything glows in its own colour
        const out = 1 - (1 - p) ** 3
        const fade = 1 - p
        ctx.shadowBlur = 12
        ctx.lineWidth = 0.5 + 2 * fade
        ctx.strokeStyle = ctx.shadowColor = `rgba(103, 232, 249, ${0.8 * fade})`
        ctx.beginPath()
        ctx.arc(w.x, w.y, 8 + out * 120, 0, Math.PI * 2)
        ctx.stroke()
        ctx.strokeStyle = ctx.shadowColor = `rgba(167, 139, 250, ${0.6 * fade})`
        ctx.beginPath()
        ctx.arc(w.x, w.y, 4 + out * 70, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = ctx.shadowColor = `rgba(226, 232, 255, ${fade})`
        for (const s of w.sparks)
          ctx.fillRect(w.x + Math.cos(s.angle) * out * s.reach - s.size / 2, w.y + Math.sin(s.angle) * out * s.reach - s.size / 2, s.size, s.size)
      }
      raf = waves.length ? requestAnimationFrame(draw) : 0
    }

    const onClick = (e: MouseEvent) => {
      // Controls keep their clicks to themselves, as do clicks with no pointer (keyboard) and the end of a text selection
      if (!e.detail || getSelection()?.toString()) return
      if ((e.target as Element | null)?.closest?.("a, button, input, textarea, select, label, summary, [role=button]")) return
      waves.push({
        x: e.clientX,
        y: e.clientY,
        at: performance.now(),
        sparks: Array.from({ length: 14 }, () => ({ angle: Math.random() * Math.PI * 2, reach: 40 + Math.random() * 100, size: 2 + Math.random() * 1.5 })),
      })
      if (!raf) raf = requestAnimationFrame(draw)
    }

    fit()
    window.addEventListener("resize", fit)
    window.addEventListener("click", onClick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", fit)
      window.removeEventListener("click", onClick)
    }
  }, [reduce])

  return reduce ? null : <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[70] h-full w-full" />
}
