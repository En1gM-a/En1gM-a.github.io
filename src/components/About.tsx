import { useRef, useState } from "react"
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react"
import { SectionHeading, reveal } from "./SectionHeading"
import { Counter } from "./fx/Counter"
import { useTilt } from "./fx/useTilt"
import { profile, stats } from "../data/content"

function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
        i % 2 ? (
          <strong key={i} className="font-semibold text-ink">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  )
}

function Word({ children, progress, range }: { children: string; progress: MotionValue<number>; range: [number, number] }) {
  // Unrevealed words stay at 3:1 contrast so the statement is never unreadable
  const opacity = useTransform(progress, range, [0.42, 1])
  const blur = useTransform(progress, range, ["blur(6px)", "blur(0px)"])
  return (
    <motion.span aria-hidden style={{ opacity, filter: blur }} className="inline-block">
      {children}&nbsp;
    </motion.span>
  )
}

/** The statement lights up word by word as it crosses the viewport */
function Statement() {
  const ref = useRef<HTMLParagraphElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.9", "end 0.5"] })
  const words = profile.statement.split(" ")
  return (
    <p ref={ref} className="max-w-5xl text-[clamp(30px,5.2vw,68px)] leading-[1.08] font-bold tracking-tight">
      <span className="sr-only">{profile.statement}</span>
      {reduce
        ? <span aria-hidden>{profile.statement}</span>
        : words.map((w, i) => {
            const start = (i / words.length) * 0.85
            return (
              <Word key={i} progress={scrollYProgress} range={[start, start + 0.15]}>
                {w}
              </Word>
            )
          })}
    </p>
  )
}

function Barcode() {
  const bars = [3, 1, 2, 1, 1, 3, 2, 1, 3, 1, 1, 2, 3, 1, 2, 2, 1, 3, 1, 2, 1, 1, 3, 2]
  let x = 0
  return (
    <svg aria-hidden viewBox="0 0 96 22" className="h-6 w-28 text-ink/80">
      {bars.map((w, i) => {
        const r = <rect key={i} x={x} y={0} width={i % 2 ? 0 : w} height={22} fill="currentColor" />
        x += w + 1.2
        return r
      })}
    </svg>
  )
}

function MissionPatch() {
  return (
    <svg aria-hidden viewBox="0 0 120 120" className="size-32">
      <defs>
        <linearGradient id="patch" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="56" fill="none" stroke="url(#patch)" strokeWidth="2" />
      <circle cx="60" cy="60" r="44" fill="rgb(255 255 255 / 0.03)" stroke="rgb(255 255 255 / 0.15)" />
      <ellipse cx="60" cy="60" rx="50" ry="16" fill="none" stroke="#67e8f9" strokeOpacity="0.7" transform="rotate(-24 60 60)" />
      <circle cx="60" cy="60" r="12" fill="url(#patch)" />
      <circle cx="101" cy="42" r="3.5" fill="#fff" />
      <text x="60" y="98" textAnchor="middle" fontFamily="JetBrains Mono Variable, monospace" fontSize="9" fill="#cfd6ea" letterSpacing="2">
        KAB · 0001
      </text>
    </svg>
  )
}

/** Holographic crew ID: tilts toward the pointer, flips to show the mission patch */
function CrewCard() {
  const [flipped, setFlipped] = useState(false)
  const { bind, rotate, glare } = useTilt(12)

  return (
    <div className="mx-auto w-full max-w-[380px] [perspective:1100px]">
      <motion.div {...bind} style={{ ...rotate, transformStyle: "preserve-3d" }} className="relative">
        <motion.div
          className="relative aspect-[5/7] w-full"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ type: "spring", bounce: 0.2, visualDuration: 0.7 }}
        >
          {/* Front */}
          <div className="panel brackets absolute inset-0 flex flex-col overflow-hidden rounded-2xl p-5 [backface-visibility:hidden]">
            <div className="flex items-center justify-between">
              <p className="label text-cyan">Crew ID</p>
              <p className="label">KAB-0001</p>
            </div>
            <div className="mt-4 flex min-h-0 flex-1 gap-4">
              {/* The whole photo, uncropped: the panel takes the picture's own proportions */}
              <div className="relative aspect-[416/952] h-full shrink-0 overflow-hidden rounded-lg border border-line">
                <img
                  src="/karl-full.webp"
                  alt="Karl Adrian Bensi on a forest trail"
                  width={416}
                  height={952}
                  loading="lazy"
                  className="h-full w-full"
                />
                <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgb(255_255_255/0.04)_0px,rgb(255_255_255/0.04)_1px,transparent_1px,transparent_4px)]" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
                <dl className="space-y-3">
                  <div>
                    <dt className="label text-[10px]">Name</dt>
                    <dd className="mt-0.5 text-lg leading-tight font-bold tracking-tight">{profile.name}</dd>
                  </div>
                  <div>
                    <dt className="label text-[10px]">Role</dt>
                    <dd className="mt-0.5 text-sm leading-snug text-dim">{profile.role}</dd>
                  </div>
                  <div>
                    <dt className="label text-[10px]">Studying</dt>
                    <dd className="mt-0.5 text-sm leading-snug text-dim">BS Computer Engineering</dd>
                  </div>
                </dl>
                <div className="space-y-2">
                  <Barcode />
                  <p className="label flex items-center gap-1.5 text-signal">
                    <span className="size-1.5 rounded-full bg-signal" /> Cleared
                  </p>
                </div>
              </div>
            </div>
            <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: glare }} />
          </div>

          {/* Back */}
          <div className="panel brackets absolute inset-0 flex flex-col items-center justify-between overflow-hidden rounded-2xl p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <p className="label self-start text-cyan">Mission patch</p>
            <MissionPatch />
            <div className="grid w-full grid-cols-3 gap-3 border-t border-line pt-5">
              {stats.map((s) => (
                <div key={s.label}>
                  <Counter to={Number(s.value)} className="display block text-4xl text-ink" />
                  <p className="mt-1.5 text-xs leading-snug text-faint">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="label flex items-center gap-2 self-start text-signal">
              <span className="size-1.5 rounded-full bg-signal" /> Open to opportunities
            </p>
          </div>
        </motion.div>
      </motion.div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-pressed={flipped}
        className="label mx-auto mt-5 flex min-h-11 items-center gap-2 rounded-full border border-line px-5 text-dim transition-colors hover:border-cyan/50 hover:text-ink"
      >
        <span aria-hidden>↻</span> {flipped ? "Show ID" : "Flip card"}
      </button>
    </div>
  )
}

export function About() {
  return (
    <section id="about" className="gutter relative scroll-mt-16 py-24 sm:py-32">
      <SectionHeading title="About" note="BS Computer Engineering student and full-stack developer, open to internships, freelance and full-time roles." />

      <Statement />

      <div className="mt-16 grid items-start gap-10 lg:mt-24 lg:grid-cols-12 lg:gap-12">
        <motion.div {...reveal} className="panel rounded-2xl p-6 sm:p-9 lg:col-span-7">
          <div className="space-y-5 text-[17px] leading-relaxed text-dim sm:text-lg">
            {profile.bio.map((p) => (
              <p key={p.slice(0, 24)}>
                <Rich text={p} />
              </p>
            ))}
          </div>
          <dl className="mt-8 grid gap-x-6 gap-y-3 border-t border-line pt-6 font-mono text-[13px] sm:grid-cols-2">
            {[
              ["Studying", "BS Computer Engineering"],
              ["Focus", "Full-stack · web, mobile, desktop"],
              ["Interests", "Software, hardware, space"],
              ["Status", "Open to opportunities"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-24 shrink-0 text-faint uppercase">{k}</dt>
                <dd className="text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-7 font-mono text-sm text-faint">
            <span className="text-cyan">&gt;</span> {profile.footnote}
          </p>
        </motion.div>

        <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.1 }} className="lg:col-span-5">
          <CrewCard />
        </motion.div>
      </div>
    </section>
  )
}
