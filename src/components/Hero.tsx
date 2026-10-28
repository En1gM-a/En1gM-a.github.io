import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react"
import { BigBang } from "./BigBang"
import { Plasma } from "./Plasma"
import { makeClumps } from "./cosmos"
import { ParticlePortrait } from "./ParticlePortrait"
import { ArrowDown } from "./icons"
import { BANG_AT, STAGE } from "../hooks/useIntro"
import { useScramble } from "../hooks/useScramble"
import { profile } from "../data/content"

const NAME = "KARL"
const WORD = "PORTFOLIO"

// The letters condense out of the fog where they stand, a little out of step, like the first stars
const DELAYS = [0.08, 0, 0.14, 0.04]

// RGB split the letters carry as they condense, settling to a clean edge
const SPLIT = "-0.09em 0 0 rgba(34,211,238,0.85), 0.09em 0 0 rgba(244,114,182,0.85)"
const CLEAN = "0em 0 0 rgba(34,211,238,0), 0em 0 0 rgba(244,114,182,0)"

const LOG: [number, string, string][] = [
  [STAGE.spark, "singularity", "detected"],
  [STAGE.bang, "inflation", "t = 0"],
  [STAGE.letters, "first light", "380 kyr"],
  [STAGE.decrypt, "identity", "decrypting"],
  [STAGE.settle, "access", "granted"],
]

// Cosmic time and temperature as the intro plays, by seconds after the bang: [s, log10 seconds, log10 kelvin].
// The Planck epoch, inflation, the fog clearing (380 000 years), the first galaxies (a billion years), today
const CLOCK: [number, number, number][] = [
  [-1.15, -43, 32],
  [0, -36, 28],
  [0.3, -32, 27],
  [0.9, 13.08, 3.48],
  [1.6, 16.5, 1.29],
  [2.8, 17.64, 0.435],
]
const YEAR = 3.156e7
const SUPER = "⁰¹²³⁴⁵⁶⁷⁸⁹"
const power = (n: number) => `10${String(n).replace("-", "⁻").replace(/\d/g, (d) => SUPER[Number(d)])}`

function cosmicClock(t: number): [number, number] {
  let i = 0
  while (i < CLOCK.length - 2 && t > CLOCK[i + 1][0]) i++
  const [t0, s0, k0] = CLOCK[i]
  const [t1, s1, k1] = CLOCK[i + 1]
  const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))
  return [s0 + (s1 - s0) * f, k0 + (k1 - k0) * f]
}

function formatTime(logS: number) {
  const years = 10 ** logS / YEAR
  if (years < 1) return `${power(Math.round(logS))} s`
  if (years < 1e3) return `${Math.round(years)} yr`
  if (years < 1e6) return `${Math.round(years / 1e3)} 000 yr`
  if (years < 1e9) return `${Math.round(years / 1e6)} million yr`
  return `${(years / 1e9).toFixed(1)} billion yr`
}

function formatTemp(logK: number) {
  const k = 10 ** logK
  if (k >= 1e4) return `${power(Math.round(logK))} K`
  if (k >= 9.95) return `${Number(k.toPrecision(2))} K`
  return `${k.toFixed(1)} K`
}

function IntroStage({ stage, onSkip }: { stage: number; onSkip: () => void }) {
  const banged = stage >= STAGE.bang
  // Where the first stars will ignite: the shader clears the fog there, the particles light the stars
  const [clumps] = useState(() => makeClumps(window.innerWidth, window.innerHeight))
  const clockRef = useRef<HTMLSpanElement>(null)
  const heatRef = useRef<HTMLSpanElement>(null)
  // The clock keeps time with the bang itself, as the shader and the particles do
  const bangedAt = useRef(0)
  useEffect(() => {
    if (banged && !bangedAt.current) bangedAt.current = performance.now()
  }, [banged])

  // The cosmic clock, written straight to the page, so it costs no renders
  useEffect(() => {
    const start = performance.now()
    let raf = 0
    let shown = ""
    const tick = (now: number) => {
      // Before the bang it counts towards it, but never past it
      const t = bangedAt.current ? (now - bangedAt.current) / 1000 : Math.min(0, (now - start - BANG_AT) / 1000)
      const [logS, logK] = cosmicClock(t)
      const time = formatTime(logS)
      const temp = formatTemp(logK)
      if (time + temp !== shown && clockRef.current && heatRef.current) {
        clockRef.current.textContent = time
        heatRef.current.textContent = temp
        shown = time + temp
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center"
      onPointerDown={onSkip}
      // Fades away as the page arrives (or on skip) instead of vanishing in one frame
      exit={{ opacity: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }}
    >
      <Plasma bang={banged} clumps={clumps} />
      <BigBang bang={banged} clumps={clumps} />

      {/* The singularity: a violet point of light gathering calmly, then blooming into the glow that fills everything */}
      <motion.span
        aria-hidden
        className="absolute top-1/2 left-1/2 -mt-[5px] -ml-[5px] size-[10px] rounded-full bg-white shadow-[0_0_12px_4px_rgba(214,196,255,0.9),0_0_48px_16px_rgba(150,110,255,0.45),0_0_110px_36px_rgba(110,70,220,0.25)]"
        initial={{ scale: 0, opacity: 0 }}
        animate={
          banged
            ? { scale: 4, opacity: 0, transition: { duration: 0.22, ease: "easeIn" } }
            : { scale: [0, 0.7, 1, 1.3], opacity: [0, 0.75, 0.9, 1], transition: { duration: 1.15, times: [0, 0.35, 0.7, 1], ease: "easeInOut" } }
        }
      />

      {stage < STAGE.decrypt && (
        // Same PORTFOLIO-wide box as the decrypting word, so KARL stays put when the glyphs take over
        <div className="display hero-word grid" aria-hidden>
          <span className="invisible col-start-1 row-start-1 whitespace-nowrap">{WORD}</span>
          <div className="col-start-1 row-start-1 flex items-end">
            {NAME.split("").map((ch, i) => (
              <motion.span
                key={ch + i}
                className="silver inline-block"
                initial={{ opacity: 0 }}
                animate={
                  stage >= STAGE.letters
                    ? { opacity: [0, 1], scale: [1.18, 1], filter: ["blur(14px)", "blur(0px)"], textShadow: [SPLIT, CLEAN] }
                    : undefined
                }
                transition={{
                  duration: 0.9,
                  delay: DELAYS[i],
                  ease: [0.22, 1, 0.36, 1],
                  opacity: { duration: 0.5, delay: DELAYS[i] },
                  textShadow: { duration: 0.9, delay: DELAYS[i] + 0.15, ease: "easeOut" },
                }}
              >
                {ch}
              </motion.span>
            ))}
          </div>
        </div>
      )}

      {/* Mission log, typed in as each beat lands; every line keeps its slot so nothing shifts */}
      {/* On phones it sits above the skip button, which would otherwise cut into its right-hand column */}
      <ul aria-hidden className="label absolute bottom-20 left-[var(--gutter)] space-y-1.5 text-[10px] sm:bottom-7 sm:text-[11px]">
        <li className="flex gap-3">
          <span className="w-28 shrink-0 whitespace-nowrap text-faint">cosmic time</span>
          <span ref={clockRef} className="text-ink normal-case tabular-nums" />
        </li>
        <li className="flex gap-3 pb-1.5">
          <span className="w-28 shrink-0 whitespace-nowrap text-faint">temperature</span>
          <span ref={heatRef} className="text-ink normal-case tabular-nums" />
        </li>
        {LOG.map(([at, k, v]) => (
          <motion.li
            key={k}
            className="flex gap-3"
            initial={{ opacity: 0, x: -8 }}
            animate={stage >= at ? { opacity: 1, x: 0 } : undefined}
            transition={{ duration: 0.25 }}
          >
            <span className="w-28 shrink-0 whitespace-nowrap text-faint">{k}</span>
            <span className={v === "granted" ? "text-signal" : "text-cyan"}>{v}</span>
          </motion.li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onSkip}
        className="label absolute right-[var(--gutter)] bottom-6 flex min-h-11 items-center gap-2 rounded-full border border-line bg-void/70 px-4 text-dim backdrop-blur-sm transition-colors hover:border-cyan/50 hover:text-ink"
      >
        Skip intro <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px]">esc</kbd>
      </button>
    </motion.div>
  )
}

export function Hero({ stage, skipped, onSkip }: { stage: number; skipped: boolean; onSkip: () => void }) {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] })
  // Spring-smoothed, so the parallax glides instead of stepping with each wheel notch
  const leave = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 })
  const y = useTransform(leave, [0, 1], [0, -140])
  const opacity = useTransform(leave, [0, 0.75], [1, 0])
  const online = stage >= STAGE.done
  const settled = stage >= STAGE.settle
  const text = useScramble(NAME, WORD, stage >= STAGE.decrypt, 950)
  const shown = settled ? WORD : text
  const [blip, setBlip] = useState(false)

  // An occasional signal glitch on the title once the hero is live
  useEffect(() => {
    if (!online || reduce) return
    let off = 0
    const id = window.setInterval(() => {
      setBlip(true)
      off = window.setTimeout(() => setBlip(false), 280)
    }, 6500)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(off)
    }
  }, [online, reduce])

  const glitching = (stage === STAGE.decrypt || blip) && !reduce

  return (
    <section ref={ref} id="home" className="relative h-svh min-h-[620px] overflow-hidden">
      <h1 className="sr-only">
        {profile.name} — {profile.role} portfolio
      </h1>

      <AnimatePresence>
        {stage < STAGE.settle && (
          <motion.div
            key="vignette"
            aria-hidden
            className="vignette fixed inset-0 z-30"
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{stage >= STAGE.spark && stage < STAGE.settle && <IntroStage key="intro" stage={stage} onSkip={onSkip} />}</AnimatePresence>

      <div aria-hidden className="grid-overlay absolute inset-0 opacity-60" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] h-1/3 bg-gradient-to-t from-void via-void/60 to-transparent"
      />
      <ParticlePortrait src="/karl-grad.webp" active={settled} instant={skipped} />

      <motion.div
        style={{ y, opacity }}
        className={`gutter pointer-events-none absolute inset-0 z-40 flex flex-col ${
          settled ? "items-start justify-end pb-[clamp(28px,7vh,84px)]" : "items-center justify-center"
        }`}
      >
        {/* Sized by the word, so the subtitle row spans exactly PORTFOLIO and never reaches the photo.
            The whole block glides from centre to bottom-left as one layout animation (no layout shift). */}
        <motion.div
          layout="position"
          layoutDependency={settled}
          transition={{ type: "spring", bounce: 0.18, visualDuration: 0.85 }}
          className="flex flex-col"
        >
        {stage >= STAGE.decrypt && (
          <motion.div
            className="display hero-word grid whitespace-nowrap"
            aria-hidden
            initial={skipped ? { opacity: 0, y: 40 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0.18, visualDuration: 0.85 }}
          >
            {/* The box is always PORTFOLIO-wide and the text grows left to right, so decrypting never shifts layout */}
            <span className="invisible col-start-1 row-start-1">{WORD}</span>
            {/* inline-size containment: wide scramble glyphs can't grow the box past PORTFOLIO */}
            <span
              className="silver glitch col-start-1 row-start-1 [contain:inline-size]"
              data-text={shown}
              data-glitch={glitching ? "on" : "off"}
            >
              {shown}
            </span>
          </motion.div>
        )}

        {settled && (
          <motion.div
            className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 sm:mt-5"
            initial={{ opacity: 0, y: 14 }}
            animate={online ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div>
              <p className="text-xl leading-tight sm:text-3xl">
                <span className="font-bold">Full Stack</span>{" "}
                <span className="font-light text-dim italic">Developer</span>
              </p>
              <p className="label mt-2">
                {profile.education} <span className="text-cyan">//</span> Systems online
              </p>
            </div>

            <div className="pointer-events-auto flex items-center gap-3">
              <a
                href="#about"
                aria-label="Scroll to About"
                className="grid size-11 place-items-center rounded-full border border-line text-dim transition-colors hover:border-cyan/50 hover:text-ink"
              >
                <ArrowDown width={16} height={16} />
              </a>
              <a
                href="#contact"
                className="flex h-11 items-center rounded-full border border-line px-6 text-sm italic transition-colors hover:border-cyan/50 hover:bg-white/5"
              >
                Contact
              </a>
            </div>
          </motion.div>
        )}
        </motion.div>
      </motion.div>

      <motion.div
        aria-hidden
        className="label gutter absolute top-24 right-0 left-0 z-10 hidden justify-between md:flex"
        initial={{ opacity: 0 }}
        animate={{ opacity: online ? 1 : 0 }}
        transition={{ duration: 0.8, delay: online ? 0.2 : 0 }}
      >
        <span>
          Crew ID <span className="text-ink">KAB-0001</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-signal" /> Uplink secure
        </span>
      </motion.div>
    </section>
  )
}
