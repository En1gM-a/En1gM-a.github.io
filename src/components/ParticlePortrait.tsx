import { useEffect, useRef, type RefObject } from "react"
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
const HANDOVER = 1.1 // seconds the stars take to give way to the real photo

// Deep blue → icy white, indexed by source luminance
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
 * Stars fly in from across the hero and assemble the whole photo inside its
 * frame, then hand over to the real image (onAssembled). Scrolling away turns
 * the photo back into stars that drift apart; the pointer pushes them aside.
 */
export function ParticlePortrait({
  src,
  active,
  frameRef,
  onAssembled,
  instant = false,
}: {
  src: string
  active: boolean
  frameRef: RefObject<HTMLElement | null>
  onAssembled: () => void
  /** Skip the fly-in (the intro was skipped); stars only appear when scrolling away */
  instant?: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()
  const assembledCb = useRef(onAssembled)
  assembledCb.current = onAssembled

  useEffect(() => {
    if (!active) return
    if (reduce) {
      assembledCb.current()
      return
    }
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const img = new Image()
    img.src = src
    let particles: Particle[] = []
    let w = 0
    let h = 0
    let raf = 0
    let start = 0
    let running = false
    let onScreen = true
    let told = false
    let cleared = false
    const pointer = { x: -9999, y: -9999 }

    const build = () => {
      const frame = frameRef.current
      if (!frame) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      const fr = frame.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const left = fr.left - rect.left
      const top = fr.top - rect.top
      const drawW = fr.width
      const drawH = fr.height
      if (drawW < 4 || drawH < 4) return
      const gap = Math.max(3, drawH / (w >= 1024 ? 150 : 115))
      const cols = Math.max(1, Math.round(drawW / gap))
      const rows = Math.max(1, Math.round(drawH / gap))
      const cx = left + drawW / 2
      const cy = top + drawH / 2

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
          const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
          const lift = Math.min(1, Math.pow(lum, 0.8) * 1.2)
          if (lift < 0.05) continue
          const tx = left + (col + 0.5) * (drawW / cols)
          const ty = top + (row + 0.5) * (drawH / rows)
          const ang = Math.atan2(ty - cy, tx - cx) + (Math.random() - 0.5) * 1.2
          particles.push({
            sx: Math.random() * w,
            sy: Math.random() * h,
            tx,
            ty,
            size: gap * (0.35 + 0.6 * lift),
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
      particles.sort((a, b) => a.bucket - b.bucket)
    }

    const frame = (now: number) => {
      const t = (now - start) / 1000
      const scroll = Math.min(1, Math.max(0, window.scrollY / h))

      if (!told && t > SETTLE) {
        told = true
        assembledCb.current()
      }

      // Stars give way to the photo after landing, and take over again as the hero scrolls away
      const handover = 1 - smooth(SETTLE, SETTLE + HANDOVER, t)
      const dematerialise = smooth(0, 0.18, scroll)
      const alpha = Math.max(handover, dematerialise) * (1 - smooth(0.55, 0.95, scroll))
      if (alpha < 0.01) {
        if (!cleared) ctx.clearRect(0, 0, w, h)
        cleared = true
        return
      }
      cleared = false

      const spread = scroll * scroll * 340
      const R = 90
      ctx.clearRect(0, 0, w, h)

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        const local = Math.min(1, Math.max(0, (t - p.delay) / FLIGHT))
        const e = easeInOutCubic(local)
        let x = p.sx + (p.tx - p.sx) * e
        let y = p.sy + (p.ty - p.sy) * e

        if (local === 1) {
          const dx = x - pointer.x
          const dy = y - pointer.y
          let px = 0
          let py = 0
          if (dx * dx + dy * dy < R * R) {
            const d = Math.sqrt(dx * dx + dy * dy) || 1
            const push = (1 - d / R) * 22
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

      // Particles are sorted by brightness bucket, so fillStyle changes only BUCKETS times
      let bucket = -1
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        if (p.bucket !== bucket) {
          bucket = p.bucket
          ctx.fillStyle = palette[bucket]
          ctx.globalAlpha = (0.35 + (bucket / BUCKETS) * 0.65) * alpha
        }
        const local = Math.min(1, Math.max(0, (t - p.delay) / FLIGHT))
        const s = p.size * (0.35 + 0.65 * local)
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s)
      }
      ctx.globalAlpha = 1
    }

    const loop = (now: number) => {
      frame(now)
      raf = requestAnimationFrame(loop)
    }
    const play = () => {
      if (running || document.hidden || !onScreen) return
      running = true
      raf = requestAnimationFrame(loop)
    }
    const pause = () => {
      running = false
      cancelAnimationFrame(raf)
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
      start = performance.now() - (instant ? (SETTLE + HANDOVER + 0.1) * 1000 : 0)
      play()
      io.observe(canvas)
    }

    window.addEventListener("resize", build)
    window.addEventListener("pointermove", onPointer, { passive: true })
    document.addEventListener("pointerleave", onLeave)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      pause()
      io.disconnect()
      window.removeEventListener("resize", build)
      window.removeEventListener("pointermove", onPointer)
      document.removeEventListener("pointerleave", onLeave)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [active, src, reduce, frameRef, instant])

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-[6] h-full w-full" />
}
