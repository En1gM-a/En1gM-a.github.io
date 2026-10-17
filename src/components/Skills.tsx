import { useEffect, useRef, useState, type PointerEvent } from "react"
import { motion, useAnimationFrame, useReducedMotion } from "motion/react"
import { SectionHeading, reveal } from "./SectionHeading"
import { skillGroups } from "../data/content"

// Orbit radius (fraction of half the stage width) and angular speed per group
const ORBITS = [
  { r: 0.3, speed: 0.32 },
  { r: 0.48, speed: -0.22 },
  { r: 0.66, speed: 0.16 },
  { r: 0.86, speed: -0.11 },
]
const TINTS = ["#67e8f9", "#a78bfa", "#f472b6", "#4ade80"]

/** Planet with skill chips on tilted elliptical orbits; depth-sorted every frame without React renders */
function OrbitSystem({ active }: { active: number | null }) {
  const stage = useRef<HTMLDivElement>(null)
  const nodes = useRef<(HTMLSpanElement | null)[]>([])
  const reduce = useReducedMotion()
  const steer = useRef({ speed: 1, tilt: 0.34, targetSpeed: 1, targetTilt: 0.34 })
  const t = useRef(0)
  // Narrow screens get three chips per orbit; the full lists are in the cards below
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setCompact(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])

  const flat = skillGroups.flatMap((g, gi) => {
    const items = compact ? g.items.slice(0, 3) : g.items
    return items.map((item, ii) => ({ item, gi, phase: (ii / items.length) * Math.PI * 2 + gi }))
  })

  useAnimationFrame((_, delta) => {
    const el = stage.current
    if (!el) return
    const s = steer.current
    s.speed += (s.targetSpeed - s.speed) * 0.06
    s.tilt += (s.targetTilt - s.tilt) * 0.06
    if (!reduce) t.current += (delta / 1000) * s.speed
    const half = el.clientWidth / 2
    for (let i = 0; i < flat.length; i++) {
      const n = nodes.current[i]
      if (!n) continue
      const { gi, phase } = flat[i]
      const o = ORBITS[gi]
      const a = phase + t.current * o.speed
      const x = Math.cos(a) * o.r * half
      const y = Math.sin(a) * o.r * half * s.tilt
      const depth = (Math.sin(a) + 1) / 2 // 0 = behind the planet, 1 = in front
      const dimmed = active !== null && active !== gi
      n.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${0.72 + depth * 0.36})`
      n.style.zIndex = depth > 0.5 ? "3" : "1"
      n.style.opacity = String((dimmed ? 0.18 : 0.4 + depth * 0.6).toFixed(3))
    }
  })

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    steer.current.targetSpeed = 1 + px * 3.2
    steer.current.targetTilt = 0.34 + py * 0.3
  }
  const onPointerLeave = () => {
    steer.current.targetSpeed = 1
    steer.current.targetTilt = 0.34
  }

  return (
    <div
      ref={stage}
      aria-hidden
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="relative mx-auto h-[clamp(300px,42vw,500px)] w-full max-w-5xl select-none"
    >
      {/* Orbit paths */}
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="-100 -50 200 100" preserveAspectRatio="none">
        {ORBITS.map((o, i) => (
          <ellipse
            key={i}
            cx="0"
            cy="0"
            rx={o.r * 100}
            ry={o.r * 100 * 0.34}
            fill="none"
            stroke={TINTS[i]}
            strokeOpacity={active === null || active === i ? 0.32 : 0.08}
            strokeDasharray="1.2 1.6"
            vectorEffect="non-scaling-stroke"
            className="transition-[stroke-opacity] duration-300"
          />
        ))}
      </svg>

      {/* Planet core */}
      <div className="absolute top-1/2 left-1/2 z-[2] size-[clamp(84px,12vw,148px)] -translate-1/2">
        <div className="absolute -inset-[45%] rounded-full bg-[radial-gradient(circle,rgb(167_139_250/0.35),transparent_62%)]" />
        <div className="relative size-full overflow-hidden rounded-full bg-[radial-gradient(circle_at_32%_28%,#e9e3ff_0%,#a78bfa_22%,#4c1d95_58%,#120a2e_100%)] shadow-[inset_-14px_-18px_32px_rgba(3,4,9,0.85),0_0_60px_rgba(167,139,250,0.35)]">
          <div className="absolute inset-0 animate-[planet-drift_18s_linear_infinite] bg-[repeating-linear-gradient(-18deg,transparent_0px,transparent_9px,rgb(255_255_255/0.07)_10px,transparent_14px)] bg-[length:200%_100%] mix-blend-screen" />
        </div>
        <span className="label absolute inset-0 grid place-items-center text-[10px] text-white/80">KAB</span>
      </div>

      {flat.map(({ item, gi }, i) => (
        <span
          key={item}
          ref={(el) => {
            nodes.current[i] = el
          }}
          className="chip absolute top-1/2 left-1/2 transition-[border-color] duration-300 will-change-transform"
          style={{ borderColor: active === gi ? TINTS[gi] : undefined, color: active === gi ? "#eef1f8" : undefined }}
        >
          {item}
        </span>
      ))}
    </div>
  )
}

function Marquee({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  return (
    <div className="group flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
      {[0, 1].map((copy) => (
        <ul
          key={copy}
          aria-hidden={copy === 1}
          className={`flex shrink-0 items-center gap-8 pr-8 motion-safe:animate-[marquee_42s_linear_infinite] group-hover:[animation-play-state:paused] ${
            reverse ? "[animation-direction:reverse]" : ""
          }`}
        >
          {items.map((s) => (
            <li key={s} className="display flex items-center gap-8 text-[clamp(28px,4vw,54px)] whitespace-nowrap text-[#5d6480]">
              {s}
              <span className="text-[0.4em] text-cyan/50">✦</span>
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}

export function Skills() {
  const [active, setActive] = useState<number | null>(null)
  const all = skillGroups.flatMap((g) => g.items)

  return (
    <section id="skills" className="relative scroll-mt-16 py-24 sm:py-32">
      <div className="gutter">
        <SectionHeading title="Skills" note={`${all.length} tools I've shipped with, across ${skillGroups.length} areas: frontend, backend and data, mobile and desktop, and automation.`} />
        <motion.div {...reveal}>
          <OrbitSystem active={active} />
          <p className="label mt-2 text-center">Move across the system to steer the orbits</p>
        </motion.div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 sm:gap-5">
          {skillGroups.map((g, i) => (
            <motion.article
              key={g.id}
              {...reveal}
              transition={{ ...reveal.transition, delay: 0.06 * i }}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              className="panel group rounded-2xl p-6 transition-colors hover:border-white/20 sm:p-7"
              style={{ borderColor: active === i ? `${TINTS[i]}66` : undefined }}
            >
              <div className="flex items-center justify-between">
                <span className="label" style={{ color: TINTS[i] }}>
                  {g.id}
                </span>
                <span className="label flex items-center gap-2">
                  <span className="size-1.5 rounded-full" style={{ background: TINTS[i] }} /> Orbit {i + 1}
                </span>
              </div>
              <h3 className="mt-4 text-2xl font-bold tracking-tight sm:text-[28px]">{g.title}</h3>
              <ul className="mt-5 flex flex-wrap gap-2" aria-label={`${g.title} skills`}>
                {g.items.map((s) => (
                  <li key={s} className="chip transition-colors group-hover:border-white/20">
                    {s}
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </div>
      </div>

      <div className="mt-20 space-y-4">
        <Marquee items={all.slice(0, 12)} />
        <Marquee items={all.slice(12)} reverse />
      </div>
    </section>
  )
}
