import { useEffect, useRef } from "react"
import { useReducedMotion } from "motion/react"

type Particle = {
  sx: number
  sy: number
  tx: number
  ty: number
  size: number
  bucket: number
  delay: number
  dirX: number
  dirY: number
  k: number
  phase: number
  ox: number
  oy: number
  x: number
  y: number
}

const BUCKETS = 14
const FLIGHT = 1.5 // seconds each particle takes to reach its spot
const SETTLE = FLIGHT + 0.85 // all particles have landed
const SCAN_EVERY = 6.5 // seconds between security sweeps
const REPEL = 95 // pointer influence radius in px

// Black-and-white with a cold blue cast, like the reference reel: deep blue → icy white by brightness
const palette = Array.from({ length: BUCKETS }, (_, i) => {
  const t = i / (BUCKETS - 1)
  const r = Math.round(55 + t * 180)
  const g = Math.round(80 + t * 168)
  const b = Math.round(150 + t * 105)
  return `rgb(${r},${g},${b})`
})

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * A halftone portrait made of stars (the reel look): they fly in and assemble
 * the face behind the title, push away from the pointer, get a periodic scan
 * sweep, and scatter as the hero scrolls away. The source is a cut-out with a
 * transparent background; only the person becomes stars.
 */
export function ParticlePortrait({ src, active, instant = false }: { src: string; active: boolean; instant?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!active) return
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const img = new Image()
    img.src = src
    let particles: Particle[] = []
    let w = 0
    let h = 0
    let top = 0
    let bottom = 0
    let raf = 0
    let start = 0
    let running = false
    let onScreen = true
    const pointer = { x: -9999, y: -9999 }

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Large and right of centre on desktop, the title crossing the collar; centred above it on phones
      const wide = w >= 1024
      let drawH = h * (wide ? 0.86 : 0.58)
      let drawW = drawH * (img.width / img.height)
      if (drawW > w * 0.92) {
        drawW = w * 0.92
        drawH = drawW / (img.width / img.height)
      }
      const cx = w * (wide ? 0.62 : 0.5)
      const left = cx - drawW / 2
      top = h * (wide ? 0.04 : 0.08)
      bottom = top + drawH
      const gap = Math.max(3, drawH / (wide ? 165 : 125))
      const cols = Math.round(drawW / gap)
      const rows = Math.round(drawH / gap)

      const off = document.createElement("canvas")
      off.width = cols
      off.height = rows
      const octx = off.getContext("2d", { willReadFrequently: true })
      if (!octx) return
      octx.drawImage(img, 0, 0, cols, rows)
      const data = octx.getImageData(0, 0, cols, rows).data

      particles = []
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = (row * cols + col) * 4
          const a = data[i + 3] / 255
          if (a < 0.08) continue
          const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
          const lift = Math.min(1, Math.pow(lum, 0.75) * 1.25) * a
          if (lift < 0.05) continue
          const tx = left + (col + 0.5) * (drawW / cols)
          const ty = top + (row + 0.5) * (drawH / rows)
          const ang = Math.atan2(ty - (top + drawH * 0.42), tx - cx) + (Math.random() - 0.5) * 1.2
          particles.push({
            sx: Math.random() * w,
            sy: Math.random() * h,
            tx,
            ty,
            size: gap * (0.3 + 0.62 * lift),
            bucket: Math.min(BUCKETS - 1, Math.floor(lift * BUCKETS)),
            delay: Math.random() * 0.55 + (row / rows) * 0.25,
            dirX: Math.cos(ang),
            dirY: Math.sin(ang),
            k: 0.4 + Math.random(),
            phase: Math.random() * Math.PI * 2,
            ox: 0,
            oy: 0,
            x: tx,
            y: ty,
          })
        }
      }
      // Sorted by brightness bucket, so fillStyle changes only BUCKETS times per frame
      particles.sort((a, b) => a.bucket - b.bucket)
    }

    const draw = (t: number, still: boolean) => {
      const scroll = still ? 0 : Math.min(1, Math.max(0, window.scrollY / h))
      const alpha = 1 - smooth(0.55, 0.95, scroll)
      ctx.clearRect(0, 0, w, h)
      if (alpha < 0.01) return
      const spread = scroll * scroll * 340

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        const local = still ? 1 : Math.min(1, Math.max(0, (t - p.delay) / FLIGHT))
        const e = easeInOutCubic(local)
        let x = p.sx + (p.tx - p.sx) * e
        let y = p.sy + (p.ty - p.sy) * e

        if (!still && local === 1) {
          const dx = x - pointer.x
          const dy = y - pointer.y
          let px = 0
          let py = 0
          if (dx * dx + dy * dy < REPEL * REPEL) {
            const d = Math.sqrt(dx * dx + dy * dy) || 1
            const push = (1 - d / REPEL) * 24
            px = (dx / d) * push
            py = (dy / d) * push
          }
          p.ox += (px - p.ox) * 0.14
          p.oy += (py - p.oy) * 0.14
          x += p.ox + Math.sin(t * 1.3 + p.phase) * 0.35
          y += p.oy + Math.cos(t * 1.1 + p.phase) * 0.35
        }

        x += p.dirX * spread * p.k
        y += p.dirY * spread * p.k
        p.x = x
        p.y = y
      }

      let bucket = -1
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        if (p.bucket !== bucket) {
          bucket = p.bucket
          ctx.fillStyle = palette[bucket]
          ctx.globalAlpha = (0.35 + (bucket / BUCKETS) * 0.65) * alpha
        }
        const local = still ? 1 : Math.min(1, Math.max(0, (t - p.delay) / FLIGHT))
        const s = p.size * (0.35 + 0.65 * local)
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s)
      }

      // Periodic security-scan sweep over the assembled portrait
      if (!still && t > SETTLE) {
        const cycle = ((t - SETTLE) % SCAN_EVERY) / 1.6
        if (cycle <= 1) {
          const scanY = top + (bottom - top) * cycle
          ctx.fillStyle = "rgb(103,232,249)"
          for (let i = 0; i < particles.length; i++) {
            const p = particles[i]
            const d = Math.abs(p.y - scanY)
            if (d > 16) continue
            ctx.globalAlpha = (1 - d / 16) * 0.85 * alpha
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
          }
          ctx.globalAlpha = 0.16 * alpha
          ctx.fillRect(0, scanY, w, 1)
        }
      }
      ctx.globalAlpha = 1
    }

    const loop = (now: number) => {
      draw((now - start) / 1000, false)
      raf = requestAnimationFrame(loop)
    }
    const play = () => {
      if (reduce || running || document.hidden || !onScreen) return
      running = true
      raf = requestAnimationFrame(loop)
    }
    const pause = () => {
      running = false
      cancelAnimationFrame(raf)
    }

    const onResize = () => {
      build()
      if (reduce) draw(0, true)
    }
    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = e.clientX - rect.left
      pointer.y = e.clientY - rect.top
    }
    const onLeave = () => {
      pointer.x = -9999
      pointer.y = -9999
    }
    const onVisibility = () => (document.hidden ? pause() : play())

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (onScreen) play()
      else pause()
    })

    img.onload = () => {
      build()
      start = performance.now() - (instant ? SETTLE * 1000 : 0)
      // Reduced motion: a still halftone portrait, no fly-in, sweep or scatter
      if (reduce) draw(0, true)
      else play()
      io.observe(canvas)
    }

    window.addEventListener("resize", onResize)
    window.addEventListener("pointermove", onPointer, { passive: true })
    document.addEventListener("pointerleave", onLeave)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      pause()
      // Clear the last frame, so a replayed intro starts from an empty sky
      ctx.clearRect(0, 0, w, h)
      io.disconnect()
      window.removeEventListener("resize", onResize)
      window.removeEventListener("pointermove", onPointer)
      document.removeEventListener("pointerleave", onLeave)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [active, src, reduce, instant])

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-[6] h-full w-full" />
}
