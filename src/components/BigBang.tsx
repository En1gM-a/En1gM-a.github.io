import { useEffect, useRef } from "react"
import { drift, makeClumps, type Clump } from "./cosmos"

/** A line to draw this frame: from (px, py) to (tx, ty) */
type Seg = { px: number; py: number; tx: number; ty: number; size: number; alpha: number }

/** A young star or faint galaxy: where it sits in expanding space and how near (z: 0 far … 1 near), when it lights up, how bright */
type Speck = Seg & { qx: number; qy: number; z: number; born: number; peak: number; tone: number }

/** A galaxy near enough to show its shape: a soft stamp, tilted and flattened, at depth z */
type Galaxy = { qx: number; qy: number; z: number; born: number; size: number; tilt: number; flat: number; kind: number; peak: number }

/** One of the first stars: where it sits, when it switches on, how wide its glow */
type FirstStar = { qx: number; qy: number; ignite: number; size: number }

/** Matter falling into the black hole: where it starts, when, how long it takes to reach the horizon, how it swirls */
type Infaller = Seg & { r0: number; th0: number; delay: number; dur: number; spin: number; tone: number; drawn: boolean }

// Matter heating as it nears the black hole: dull red → orange → yellow → white → blue-white
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

/** A face-on spiral: a warm bulge and two arms of blue star-forming knots */
function spiralSprite() {
  const c = document.createElement("canvas")
  c.width = c.height = 96
  const g = c.getContext("2d")
  if (!g) return c
  g.globalCompositeOperation = "lighter"
  const glow = (x: number, y: number, r: number, inner: string, outer: string) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, inner)
    grad.addColorStop(1, outer)
    g.fillStyle = grad
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  glow(48, 48, 46, "rgba(170,190,255,0.16)", "rgba(150,170,255,0)")
  for (let arm = 0; arm < 2; arm++)
    for (let i = 0; i < 56; i++) {
      const u = i / 56
      const th = arm * Math.PI + u * Math.PI * 2.4
      const r = 5 + u * 38
      glow(48 + Math.cos(th) * r, 48 + Math.sin(th) * r, 3 + 3 * (1 - u), `rgba(190,208,255,${(0.32 * (1 - u * 0.6)).toFixed(3)})`, "rgba(150,175,255,0)")
    }
  glow(48, 48, 13, "rgba(255,240,215,1)", "rgba(255,220,180,0)")
  return c
}

/** A disc seen edge-on, a dark lane of dust along its middle */
function edgeOnSprite() {
  const c = document.createElement("canvas")
  c.width = c.height = 96
  const g = c.getContext("2d")
  if (!g) return c
  g.save()
  g.translate(48, 48)
  g.scale(1, 0.26)
  const disc = g.createRadialGradient(0, 0, 0, 0, 0, 46)
  disc.addColorStop(0, "rgba(255,240,220,1)")
  disc.addColorStop(0.3, "rgba(200,212,255,0.55)")
  disc.addColorStop(1, "rgba(160,180,255,0)")
  g.fillStyle = disc
  g.fillRect(-48, -48, 96, 96)
  g.restore()
  g.globalCompositeOperation = "destination-out"
  const lane = g.createLinearGradient(0, 45.5, 0, 51.5)
  lane.addColorStop(0, "rgba(0,0,0,0)")
  lane.addColorStop(0.5, "rgba(0,0,0,0.75)")
  lane.addColorStop(1, "rgba(0,0,0,0)")
  g.fillStyle = lane
  g.fillRect(6, 45.5, 84, 6)
  return c
}

/**
 * The opening's matter, drawn on a 2D canvas over the plasma shader.
 *
 * "cosmos" follows NASA's own visualisation of the Big Bang, which is not an
 * explosion: nothing is thrown out from a centre. Inside the shader's glowing
 * fog the first stars switch on in protoclusters (the same ones the shader
 * clears the fog around): huge blue stars that flare and settle, then more
 * stars and the first galaxies, everywhere at once. The fog clears to a deep
 * field: far galaxies small and reddened by the stretch of space, near ones
 * large and drifting out faster, and faint arcs of lensed light around the
 * heaviest cluster. Nothing twinkles; that's air, and there is none out here.
 *
 * "infall" is for the black hole behind "Back to orbit": stars and dust all
 * around spiral in, faster and faster, heating from white starlight to orange
 * and then white-hot as they near the horizon, where they vanish.
 */
export function BigBang({
  bang,
  origin,
  mode = "cosmos",
  clumps = [],
}: {
  bang: boolean
  /** Where it starts (viewport px); defaults to the centre */
  origin?: { x: number; y: number }
  mode?: "cosmos" | "infall"
  /** Cosmos: the protoclusters, shared with the shader */
  clumps?: Clump[]
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
    const firsts: FirstStar[] = []
    const arcs: { r: number; a0: number; span: number; width: number }[] = []
    const lens = { x: 0, y: 0 }
    const sprites: HTMLCanvasElement[] = []
    let halo: HTMLCanvasElement | null = null
    if (mode === "cosmos") {
      const coarse = window.matchMedia("(pointer: coarse)").matches
      // Past every corner, so the expanding field never shows an edge
      const reach = Math.hypot(w, h) * 0.6
      // The protoclusters, in px from the centre
      const hubs = (clumps.length ? clumps : makeClumps(w, h)).map((c) => ({ ...c, x: c.x * h, y: c.y * h }))
      const total = hubs.reduce((sum, c) => sum + c.m, 0)
      // Heavier clusters gather more
      const pick = () => {
        let k = Math.random() * total
        for (const c of hubs) if ((k -= c.m) <= 0) return c
        return hubs[hubs.length - 1]
      }
      const field = () => {
        const a = Math.random() * Math.PI * 2
        const d = Math.sqrt(Math.random()) * reach
        return { qx: Math.cos(a) * d, qy: Math.sin(a) * d }
      }
      const count = Math.round(Math.min(1500, (w * h) / 900))
      for (let i = 0; i < count; i++) {
        const big = Math.random() < 0.06
        const inHub = Math.random() < 0.5
        const hub = pick()
        const spread = unit * (0.03 + 0.09 * Math.random()) * (0.6 + 0.6 * hub.m)
        specks.push({
          ...(inHub ? { qx: hub.x + gauss() * spread, qy: hub.y + gauss() * spread } : field()),
          z: inHub ? 0.5 + gauss() * 0.12 : Math.random(),
          // A cluster's stars light up as its bubble opens; the rest of the sky follows as the last fog thins
          born: inHub ? hub.ignite + 0.08 + Math.random() * 0.55 : 1.15 + Math.random() * 0.5,
          peak: big ? 1 : 0.45 + 0.55 * Math.pow(Math.random(), 1.5),
          tone: Math.random() < 0.7 ? 0 : Math.random() < 0.5 ? 1 : 2,
          px: 0,
          py: 0,
          tx: 0,
          ty: 0,
          size: big ? 2.2 + Math.random() * 1.4 : 0.8 + Math.random() * 1.2,
          alpha: 0,
        })
      }
      // The first stars: huge, hot and blue, a few at the heart of each cluster
      for (const hub of hubs)
        for (let i = 0; i < 2 + Math.round(hub.m * 3); i++)
          firsts.push({
            qx: hub.x + gauss() * unit * 0.018,
            qy: hub.y + gauss() * unit * 0.018,
            ignite: hub.ignite + Math.random() * 0.12,
            size: unit * (0.03 + 0.03 * hub.m) * (0.7 + 0.6 * Math.random()),
          })
      // Galaxy stamps: a warm elliptical, a spiral with arms, an edge-on disc with its dust lane,
      // a small blue irregular, a faint red one far off, a disc with a gold core
      sprites.push(
        sprite([
          [0, "rgba(255,244,226,1)"],
          [0.25, "rgba(255,214,160,0.55)"],
          [1, "rgba(255,190,140,0)"],
        ]),
        spiralSprite(),
        edgeOnSprite(),
        sprite([
          [0, "rgba(215,225,255,0.85)"],
          [0.4, "rgba(170,190,255,0.3)"],
          [1, "rgba(150,170,255,0)"],
        ]),
        sprite([
          [0, "rgba(255,170,130,0.9)"],
          [0.35, "rgba(225,105,80,0.35)"],
          [1, "rgba(200,80,70,0)"],
        ]),
        sprite([
          [0, "rgba(255,240,215,1)"],
          [0.12, "rgba(255,226,190,0.7)"],
          [0.3, "rgba(175,195,255,0.35)"],
          [1, "rgba(140,160,255,0)"],
        ]),
      )
      halo = sprite([
        [0, "rgba(240,246,255,1)"],
        [0.1, "rgba(200,218,255,0.6)"],
        [0.35, "rgba(150,180,255,0.16)"],
        [1, "rgba(130,160,255,0)"],
      ])
      // A deep field: most galaxies far off (small, and reddened by the stretch of space), a few near and large
      for (let i = 0; i < (coarse ? 50 : 110); i++) {
        const inHub = Math.random() < 0.45
        const hub = pick()
        const z = inHub ? 0.45 + Math.random() * 0.2 : Math.pow(Math.random(), 1.8)
        const spread = unit * (0.05 + 0.09 * Math.random())
        const kind = z < 0.3 ? (Math.random() < 0.7 ? 4 : 3) : z < 0.7 ? [0, 1, 3, 5][(Math.random() * 4) | 0] : [0, 1, 2, 5][(Math.random() * 4) | 0]
        galaxies.push({
          ...(inHub ? { qx: hub.x + gauss() * spread, qy: hub.y + gauss() * spread } : field()),
          z,
          born: inHub ? hub.ignite + 0.35 + Math.random() * 0.5 : 1.3 + Math.random() * 0.4,
          size: unit * (0.006 + 0.034 * Math.pow(z, 1.5) + 0.004 * Math.random()),
          tilt: Math.random() * Math.PI,
          flat: kind === 2 ? 0.7 + Math.random() * 0.3 : 0.35 + Math.random() * 0.65,
          kind,
          peak: 0.7 + Math.random() * 0.3,
        })
      }
      // The heaviest cluster bends the light of galaxies behind it into faint arcs
      const heavy = hubs.reduce((a, b) => (b.m > a.m ? b : a))
      lens.x = heavy.x
      lens.y = heavy.y
      for (let i = 0; i < 3; i++)
        arcs.push({ r: unit * (0.045 + Math.random() * 0.035), a0: Math.random() * Math.PI * 2, span: 0.35 + Math.random() * 0.35, width: 1 + Math.random() * 0.8 })
    }

    // ------------------------------------------------------------ infall: everything spiralling into the black hole
    const infall: Infaller[] = []
    if (mode === "infall") {
      const reach = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 1.05
      const count = Math.round(Math.min(1400, (w * h) / 800))
      for (let i = 0; i < count; i++) {
        infall.push({
          r0: unit * 0.1 + Math.sqrt(Math.random()) * reach,
          th0: Math.random() * Math.PI * 2,
          delay: 0.05 + Math.random() * 0.45,
          dur: 0.9 + Math.random() * 0.8,
          spin: 0.8 + Math.random() * 0.8,
          tone: Math.random() < 0.7 ? 0 : 1 + ((Math.random() * 2) | 0),
          px: cx,
          py: cy,
          tx: cx,
          ty: cy,
          size: 0.6 + Math.random() * 1.4,
          alpha: 0,
          drawn: false,
        })
      }
    }
    // The horizon's radius in px, as the shader draws it: it opens, holds, then shrinks to a point
    const horizon = (t: number) => 0.085 * Math.min(w, h) * smooth(0, 0.7, t) * (1 - smooth(1.7, 2.25, t))

    // One list per colour, so each colour is set once per frame
    const palette = mode === "cosmos" ? TONES : [...HEAT, ...TONES]
    const groups: Seg[][] = palette.map(() => [])
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
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = "lighter"
      ctx.lineCap = "round"
      for (const l of groups) l.length = 0
      if (bangRef.current && !bangAt) bangAt = now
      const t = bangAt ? (now - bangAt) / 1000 : -1

      if (mode === "cosmos" && t >= 0) {
        // Then it all hands over to the galaxy behind the page
        const out = 1 - smooth(2.45, 2.85, t)
        // Galaxies: nearer ones drift out faster as space expands, a slow glide through the deep field
        for (const g of galaxies) {
          const lit = smooth(g.born, g.born + 0.4, t) * g.peak * out
          if (lit <= 0) continue
          const a = drift(t, g.z)
          const x = cx + g.qx * a
          const y = cy + g.qy * a
          if (x < -g.size || x > w + g.size || y < -g.size || y > h + g.size) continue
          const c = Math.cos(g.tilt) * g.size * dpr
          const s = Math.sin(g.tilt) * g.size * dpr
          ctx.globalAlpha = lit
          ctx.setTransform(c, s, -s * g.flat, c * g.flat, x * dpr, y * dpr)
          ctx.drawImage(sprites[g.kind], -0.5, -0.5, 1, 1)
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        // Arcs of lensed light around the heaviest cluster
        const bent = smooth(1.55, 1.95, t) * out
        if (bent > 0) {
          const a = drift(t)
          ctx.strokeStyle = "rgb(190,210,255)"
          ctx.globalAlpha = bent * 0.55
          for (const arc of arcs) {
            ctx.lineWidth = arc.width
            ctx.beginPath()
            ctx.arc(cx + lens.x * a, cy + lens.y * a, arc.r * a, arc.a0, arc.a0 + arc.span)
            ctx.stroke()
          }
        }
        // The first stars flare as they switch on, then settle
        if (halo)
          for (const f of firsts) {
            const on = t - f.ignite
            if (on <= 0) continue
            const flare = smooth(0, 0.06, on) * (1 + 1.5 * Math.exp(-Math.max(0, on - 0.06) * 4))
            const a = drift(t)
            const size = f.size * (0.6 + 0.25 * flare)
            ctx.globalAlpha = Math.min(1, 0.45 * flare) * out
            ctx.drawImage(halo, cx + f.qx * a - size / 2, cy + f.qy * a - size / 2, size, size)
          }
        for (const s of specks) {
          const lit = smooth(s.born, s.born + 0.3, t)
          if (lit <= 0) continue
          const a = drift(t, s.z)
          const x = cx + s.qx * a
          const y = cy + s.qy * a
          if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue
          // A zero-length line draws nothing, so each speck is a hair-length stroke (its round caps make the dot)
          s.px = x - 0.05
          s.py = y
          s.tx = x
          s.ty = y
          s.alpha = s.peak * lit * out
          groups[s.tone].push(s)
        }
      } else if (mode === "infall" && t >= 0) {
        const R = horizon(t)
        for (const m of infall) {
          const u = (t - m.delay) / m.dur
          if (u <= 0 || u >= 1) continue
          // Slow at first, then faster and faster; the closer in, the faster it turns (a tightening spiral)
          const r = m.r0 * (1 - u * u)
          if (r <= R * 0.95) continue
          const th = m.th0 + m.spin * Math.log(m.r0 / Math.max(r, 1))
          const x = cx + Math.cos(th) * r
          const y = cy + Math.sin(th) * r
          // Each frame draws the path since the last one, so the streaks lengthen as it speeds up
          m.px = m.drawn ? m.tx : x - 0.05
          m.py = m.drawn ? m.ty : y
          m.tx = x
          m.ty = y
          m.drawn = true
          // Heated as it nears the hole: white starlight turns orange, then white-hot
          const heat = Math.min(1.2, (R * 2.4) / r)
          m.alpha = smooth(0, 0.15, u) * smooth(R * 0.95, R * 1.8, r)
          groups[heat > 0.3 ? heatIndex(0.45 + heat * 0.6) : STEPS + m.tone].push(m)
        }
      }

      for (let i = 0; i < groups.length; i++) stroke(palette[i], groups[i])
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
