import { useEffect, useRef, useState } from "react"
import {
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react"
import { SectionHeading, reveal } from "./SectionHeading"
import { ArrowUpRight, GitHubIcon } from "./icons"
import { ProjectPreview } from "./previews"
import { useTilt } from "./fx/useTilt"
import { galaxyBus } from "../three/bus"
import type { Voyage as VoyageScene } from "../three/voyage"
import { archive, profile, projects, type Project } from "../data/content"

// Scroll choreography: each destination gets one screen of scroll — hold to read, then travel
const DWELL = 0.55 // share of each screen spent parked at the planet
const TAIL = 0.5 // extra hold at the final destination before the section scrolls on

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** Scroll progress (0…1) → position along the route (0…n-1) and warp intensity (0…1) */
function routeAt(q: number, n: number) {
  const u = q * (n - 1 + TAIL)
  const i = Math.floor(u)
  if (i >= n - 1) return { p: n - 1, warp: 0 }
  const f = u - i
  if (f <= DWELL) return { p: i, warp: 0 }
  const t = (f - DWELL) / (1 - DWELL)
  return { p: i + easeInOutCubic(t), warp: Math.sin(Math.PI * t) }
}

function useDesktop() {
  const query = "(min-width: 1024px)"
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setDesktop(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return desktop
}

function StatusBadge({ status }: { status: Project["status"] }) {
  if (status === "live")
    return (
      <span className="label flex items-center gap-2 text-signal">
        <span className="size-1.5 rounded-full bg-signal motion-safe:animate-pulse" /> Live
      </span>
    )
  if (status === "wip")
    return (
      <span className="label flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-amber-200">
        <span className="size-1.5 rounded-full bg-amber-300 motion-safe:animate-pulse" /> In development
      </span>
    )
  return null
}

function Preview({ project }: { project: Project }) {
  const ref = useRef<HTMLDivElement>(null)
  const play = useInView(ref, { amount: 0.35 })
  const { bind, rotate, glare } = useTilt(8)
  return (
    <div ref={ref} className="[perspective:1200px]" {...bind}>
      <motion.div className="relative aspect-[16/10] w-full" style={{ ...rotate, transformStyle: "preserve-3d" }}>
        <div className="absolute inset-0">
          <ProjectPreview kind={project.preview} play={play} />
        </div>
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-xl" style={{ background: glare }} />
        <span
          className="label absolute -bottom-3 left-4 rounded-full border border-line bg-void/90 px-3 py-1.5 text-[10px]"
          style={{ transform: "translateZ(50px)" }}
        >
          {project.preview === "kuryentipid" ? "Live screenshot" : "Recreated preview"}
        </span>
      </motion.div>
    </div>
  )
}

function Details({ project }: { project: Project }) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label">
          <span className="text-cyan">{project.code}</span> · {project.kind}
        </p>
        <StatusBadge status={project.status} />
      </div>
      <h3 className="display mt-4 text-[clamp(30px,3.1vw,48px)]">{project.name}</h3>
      <p className="mt-4 max-w-xl text-dim sm:text-lg">{project.summary}</p>
      <ul className="mt-5 space-y-1.5 font-mono text-[13px] text-dim">
        {project.highlights.map((h) => (
          <li key={h} className="flex gap-2">
            <span className="text-cyan" aria-hidden>
              ▸
            </span>
            {h}
          </li>
        ))}
      </ul>
      <ul className="mt-6 flex flex-wrap gap-2" aria-label="Tech stack">
        {project.stack.map((s) => (
          <li key={s} className="chip">
            {s}
          </li>
        ))}
      </ul>
      <div className="mt-7 flex flex-wrap gap-3">
        <a
          href={project.repo}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 items-center gap-2 rounded-full border border-line bg-void/40 px-5 text-sm backdrop-blur transition-colors hover:border-white/30 hover:bg-white/5"
        >
          <GitHubIcon width={16} height={16} /> Source
          <span className="sr-only"> code for {project.name} (opens in new tab)</span>
        </a>
        {project.live && (
          <a
            href={project.live}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-void transition-opacity hover:opacity-85"
          >
            Live site <ArrowUpRight width={16} height={16} />
            <span className="sr-only"> for {project.name} (opens in new tab)</span>
          </a>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Voyage (desktop) */

/** One destination's content: drifts in from the distance on arrival, rushes past and blurs on departure */
function Destination({
  project,
  index,
  route,
  entry,
  onFocusTravel,
}: {
  project: Project
  index: number
  route: MotionValue<number>
  entry: MotionValue<number>
  onFocusTravel: (i: number) => void
}) {
  const planetRight = index % 2 === 0
  const d = useTransform(route, (v) => v - index)
  const opacity = useTransform(() => {
    const v = d.get()
    const base = v < 0 ? smoothstep(-0.55, -0.12, v) : 1 - smoothstep(0.04, 0.38, v)
    return index === 0 ? base * smoothstep(0.55, 1, entry.get()) : base
  })
  const scale = useTransform(d, (v) => (v < 0 ? 0.86 + 0.14 * smoothstep(-1, 0, v) : 1 + 0.2 * smoothstep(0, 0.7, v)))
  const y = useTransform(d, (v) => (v < 0 ? (1 - smoothstep(-1, 0, v)) * 40 : 0))
  const filter = useTransform(d, (v) => {
    const blur = v < 0 ? 1 - smoothstep(-0.5, -0.06, v) : smoothstep(0.03, 0.35, v)
    return `blur(${(blur * 14).toFixed(2)}px)`
  })
  const pointerEvents = useTransform(d, (v) => (Math.abs(v) < 0.25 ? "auto" : "none"))

  return (
    <motion.article
      aria-labelledby={`planet-${index}`}
      onFocusCapture={() => onFocusTravel(index)}
      style={{ opacity, scale, y, filter, pointerEvents }}
      className="gutter absolute inset-0 grid grid-cols-12 items-center gap-8 pt-28 pb-24 xl:gap-10"
    >
      {/* The planet owns a third of the screen on its side; details and preview share the rest */}
      <div className={`row-start-1 col-span-4 ${planetRight ? "col-start-1" : "col-start-9"}`}>
        <p id={`planet-${index}`} className="label mb-3 text-cyan">
          Planet {project.planet.name}
        </p>
        <Details project={project} />
      </div>
      <div className={`row-start-1 col-span-5 ${planetRight ? "col-start-5" : "col-start-4"}`}>
        <Preview project={project} />
      </div>
    </motion.article>
  )
}

function Voyage() {
  const track = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const n = projects.length

  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] })
  // Spring-smoothed scroll (Motion's recommended scroll-linked smoothing) so the travel glides
  const smooth = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 })
  const route = useTransform(smooth, (q) => routeAt(q, n).p)
  const warp = useTransform(smooth, (q) => routeAt(q, n).warp)
  const { scrollYProgress: entryRaw } = useScroll({ target: track, offset: ["start end", "start start"] })
  const entry = useSpring(entryRaw, { stiffness: 100, damping: 30, restDelta: 0.001 })
  const { scrollYProgress: exit } = useScroll({ target: track, offset: ["end end", "end start"] })
  const fill = useTransform(route, (v) => v / (n - 1))
  const warpLabel = useTransform(warp, (v) => smoothstep(0.25, 0.65, v))
  const [active, setActive] = useState(0)
  const [next, setNext] = useState(1)

  useMotionValueEvent(route, "change", (v) => {
    setActive(Math.round(v))
    setNext(Math.min(n - 1, Math.floor(v) + 1))
  })
  // The background galaxy steps back and joins the jump while the voyage owns the screen
  useMotionValueEvent(warp, "change", (v) => galaxyBus.warp(v * 0.5))
  useEffect(() => {
    const update = () => galaxyBus.dim.set(1 - 0.7 * entryRaw.get() * (1 - exit.get()))
    const a = entryRaw.on("change", update)
    const b = exit.on("change", update)
    update()
    return () => {
      a()
      b()
      galaxyBus.dim.set(1)
      galaxyBus.warp(0)
    }
  }, [entryRaw, exit])

  useEffect(() => {
    let scene: VoyageScene | null = null
    let cancelled = false
    import("../three/voyage").then(({ createVoyage }) => {
      if (cancelled || !canvasRef.current) return
      scene = createVoyage(canvasRef.current, {
        palettes: projects.map((p) => p.planet.palette),
        mobile: false,
        read: () => ({ p: route.get(), warp: warp.get(), entry: entry.get() }),
      })
    })
    return () => {
      cancelled = true
      scene?.dispose()
    }
  }, [route, warp, entry])

  const travelTo = (i: number) => {
    const el = track.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY
    // Land a little into the destination's hold, so it is fully arrived
    window.scrollTo({ top: top + i * window.innerHeight + 8, behavior: "smooth" })
  }
  const onFocusTravel = (i: number) => {
    if (Math.round(route.get()) !== i) travelTo(i)
  }

  const current = projects[Math.min(n - 1, Math.max(0, active))]

  return (
    <div ref={track} className="relative" style={{ height: `${(n + TAIL) * 100}vh` }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
        {/* Edge falloff keeps text readable against bright planets */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_50%,transparent_40%,rgb(3_4_9/0.55)_100%)]" />

        {projects.map((p, i) => (
          <Destination key={p.code} project={p} index={i} route={route} entry={entry} onFocusTravel={onFocusTravel} />
        ))}

        {/* HUD */}
        <div aria-hidden className="gutter pointer-events-none absolute inset-x-0 top-20 flex items-center justify-between">
          <p className="label">
            Voyage <span className="text-cyan">//</span> Destination{" "}
            <span className="text-ink">
              {String(active + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
            </span>
          </p>
          <p className="label">
            Planet <span className="text-ink">{current.planet.name}</span>
          </p>
        </div>

        <motion.p
          aria-hidden
          className="label pointer-events-none absolute top-1/2 left-1/2 -translate-1/2 text-[12px] whitespace-nowrap text-cyan"
          style={{ opacity: warpLabel }}
        >
          Warp ▸ Planet {projects[next].planet.name}
        </motion.p>

        <nav aria-label="Project destinations" className="gutter absolute inset-x-0 bottom-7">
          <div className="relative mx-auto max-w-3xl">
            <div className="absolute top-[22px] right-[22px] left-[22px] h-px bg-line" />
            <motion.div className="absolute top-[22px] left-[22px] h-px w-[calc(100%-44px)] origin-left bg-cyan/70" style={{ scaleX: fill }} />
            <ol className="relative flex justify-between">
              {projects.map((p, i) => (
                <li key={p.code}>
                  <button
                    type="button"
                    onClick={() => travelTo(i)}
                    aria-current={active === i ? "step" : undefined}
                    className="group flex size-11 flex-col items-center justify-center"
                  >
                    <span
                      className={`size-2.5 rounded-full border transition-[transform,background-color,border-color] duration-300 ${
                        active === i ? "scale-125 border-cyan bg-cyan" : "border-white/40 bg-void group-hover:border-cyan/70"
                      }`}
                    />
                    <span className={`label mt-2 text-[9px] whitespace-nowrap ${active === i ? "text-ink" : ""}`}>{p.planet.name}</span>
                    <span className="sr-only"> — travel to {p.name}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </nav>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ List (mobile, reduced motion) */

function PlanetBadge({ project }: { project: Project }) {
  const { a, b, c, atmo } = project.planet.palette
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden
        className="size-9 shrink-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 32% 30%, ${c}, ${b} 42%, ${a} 82%)`,
          boxShadow: `0 0 24px ${atmo}66, inset -6px -8px 14px rgba(0,0,0,0.55)`,
        }}
      />
      <span className="label text-cyan">Planet {project.planet.name}</span>
    </span>
  )
}

function ProjectList() {
  return (
    <div className="gutter flex flex-col gap-6">
      {projects.map((p) => (
        <motion.article key={p.code} {...reveal} className="panel brackets relative overflow-hidden rounded-3xl p-6 sm:p-8">
          <PlanetBadge project={p} />
          <div className="mt-5 grid items-center gap-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Details project={p} />
            </div>
            <div className="lg:col-span-7">
              <Preview project={p} />
            </div>
          </div>
        </motion.article>
      ))}
    </div>
  )
}

export function Projects() {
  const reduce = useReducedMotion()
  const desktop = useDesktop()

  return (
    <section id="projects" className="relative scroll-mt-16 pt-24 sm:pt-32">
      <div className="gutter">
        <SectionHeading index="03" label="Mission log" title="Projects" />
      </div>

      {desktop && !reduce ? <Voyage /> : <ProjectList />}

      <div className="gutter pt-8 pb-24 sm:pb-32">
        <motion.aside
          {...reveal}
          className="panel flex flex-col justify-between gap-6 rounded-3xl p-6 sm:flex-row sm:items-center sm:p-8"
          aria-label="More projects"
        >
          <div>
            <p className="label">Archive · smaller builds</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {archive.map((a) => (
                <li key={a.name}>
                  <a
                    href={a.repo}
                    target="_blank"
                    rel="noreferrer"
                    className="chip flex min-h-11 items-center gap-2 px-4 transition-colors hover:border-white/30 hover:text-ink"
                  >
                    {a.name} <span className="text-faint">{a.lang}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <a href={profile.github} target="_blank" rel="noreferrer" className="group flex items-center gap-4">
            <span>
              <span className="block text-lg font-semibold">See everything on GitHub</span>
              <span className="font-mono text-sm text-faint">github.com/{profile.githubHandle}</span>
            </span>
            <span className="grid size-11 shrink-0 place-items-center rounded-full border border-line transition-colors group-hover:border-cyan/50 group-hover:text-cyan">
              <ArrowUpRight />
            </span>
          </a>
        </motion.aside>
      </div>
    </section>
  )
}
