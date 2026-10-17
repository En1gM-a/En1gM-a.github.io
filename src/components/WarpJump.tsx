import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { galaxyBus } from "../three/bus"

const DURATION = 1.05 // seconds, the whole jump
const CUT = 0.46 // fraction of the jump at which the page cuts to the target, while the screen is covered

type Jump = { id: string; label: string }

/** Land on a section: no scrolling through everything in between, focus and URL follow */
function arriveAt(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  target.scrollIntoView({ behavior: "instant", block: "start" })
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1")
  target.focus({ preventScroll: true })
  history.pushState(null, "", `#${id}`)
}

/**
 * In-page links (nav, hero buttons) jump through hyperspace instead of
 * fast-forwarding past every section: the stars stretch into streaks, the view
 * cuts to the target while the screen is covered, then drops out of warp.
 * Short hops keep the normal smooth scroll; with reduced motion the browser's
 * plain jump stays.
 */
export function WarpJump() {
  const reduce = useReducedMotion()
  const [jump, setJump] = useState<Jump | null>(null)
  const active = useRef(false)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (reduce) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href^='#']")
      if (!a || a.classList.contains("skip-link")) return
      const id = a.getAttribute("href")!.slice(1)
      const target = id ? document.getElementById(id) : null
      if (!target) return
      if (active.current) return e.preventDefault()
      if (Math.abs(target.getBoundingClientRect().top) < window.innerHeight * 0.5) return
      e.preventDefault()
      active.current = true
      setJump({ id, label: (a.textContent || id).trim() })
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [reduce])

  // Hyperspace streaks
  useEffect(() => {
    if (!jump) return
    const c = canvas.current
    const ctx = c?.getContext("2d")
    if (!c || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = window.innerWidth
    const h = window.innerHeight
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineCap = "round"
    const cx = w / 2
    const cy = h / 2
    const maxR = Math.hypot(cx, cy)
    const colors = ["rgba(226,246,255,", "rgba(103,232,249,", "rgba(167,139,250,"]
    const stars = Array.from({ length: w < 768 ? 170 : 320 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 8 + Math.random() * maxR,
      s: 0.35 + Math.random() * 0.9,
      c: Math.random() < 0.62 ? 0 : Math.random() < 0.6 ? 1 : 2,
    }))

    galaxyBus.warp(1)
    let raf = 0
    let cut = false
    const start = performance.now()
    let last = start
    const frame = (now: number) => {
      // The first frame's timestamp can predate the start; a negative t would turn every streak into NaN
      const t = Math.min(1, Math.max(0, (now - start) / (DURATION * 1000)))
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      // Speed ramps up into the cut, then drops out of warp
      const v = Math.pow(Math.sin(Math.PI * t), 1.5)
      ctx.clearRect(0, 0, w, h)
      for (let k = 0; k < colors.length; k++) {
        ctx.beginPath()
        ctx.strokeStyle = `${colors[k]}${0.2 + 0.8 * v})`
        ctx.lineWidth = k === 0 ? 1.4 : 1.8
        for (const s of stars) {
          if (s.c !== k) continue
          s.r += (60 + s.r * 3.2) * v * s.s * dt * 2.2
          if (s.r > maxR + 40) {
            s.r = 6 + Math.random() * 60
            s.a = Math.random() * Math.PI * 2
          }
          const len = 2 + v * s.s * (s.r * 0.45 + 30)
          const r0 = Math.max(2, s.r - len)
          const ca = Math.cos(s.a)
          const sa = Math.sin(s.a)
          ctx.moveTo(cx + ca * r0, cy + sa * r0)
          ctx.lineTo(cx + ca * s.r, cy + sa * s.r)
        }
        ctx.stroke()
      }
      if (!cut && t >= CUT) {
        cut = true
        arriveAt(jump.id)
        galaxyBus.warp(0)
      }
      if (t < 1) raf = requestAnimationFrame(frame)
      else {
        active.current = false
        setJump(null)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      galaxyBus.warp(0)
      active.current = false
    }
  }, [jump])

  return (
    <AnimatePresence>
      {jump && (
        <motion.div
          key="warp"
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[90]"
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
        >
          <motion.div
            className="absolute inset-0 bg-void"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: DURATION, times: [0, CUT - 0.06, CUT + 0.08, 1], ease: ["easeIn", "linear", "easeOut"] }}
          />
          <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
          {/* The flash of dropping out of hyperspace, right at the cut */}
          <motion.div
            className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgb(207_250_254/0.85),rgb(103_232_249/0.3)_18%,transparent_55%)]"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 0, 1, 0, 0], scale: [0.4, 0.4, 1.6, 2.2, 2.2] }}
            transition={{ duration: DURATION, times: [0, CUT - 0.08, CUT, CUT + 0.22, 1], ease: "easeOut" }}
          />
          <motion.p
            className="label absolute inset-x-0 top-[58%] text-center text-cyan"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: [0, 1, 1, 0], y: 0 }}
            transition={{ duration: DURATION, times: [0, 0.2, 0.6, 0.78] }}
          >
            Warp to {jump.label}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
