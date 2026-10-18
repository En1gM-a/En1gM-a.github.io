import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react"
import { BigBang } from "./BigBang"
import { Plasma } from "./Plasma"
import { ParticlePortrait } from "./ParticlePortrait"
import { ArrowDown } from "./icons"
import { STAGE } from "../hooks/useIntro"
import { useScramble } from "../hooks/useScramble"
import { profile } from "../data/content"

const NAME = "KARL"
const WORD = "PORTFOLIO"

// Each letter is flung out of the blast with its own spin
const SPINS = [-160, 120, -100, 170]

// RGB-split trail the letters carry while they fly, settling to a clean edge
const SPLIT = "-0.09em 0 0 rgba(34,211,238,0.85), 0.09em 0 0 rgba(244,114,182,0.85)"
const CLEAN = "0em 0 0 rgba(34,211,238,0), 0em 0 0 rgba(244,114,182,0)"

const LOG: [number, string, string][] = [
  [STAGE.spark, "singularity", "detected"],
  [STAGE.bang, "big bang", "t = 0"],
  [STAGE.decrypt, "identity", "decrypting"],
  [STAGE.settle, "access", "granted"],
]

function IntroStage({ stage, onSkip }: { stage: number; onSkip: () => void }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([])
  const [offsets, setOffsets] = useState<number[]>(NAME.split("").map(() => 0))
  const banged = stage >= STAGE.bang

  // How far each letter sits from the blast at the centre of the PORTFOLIO-wide box
  useLayoutEffect(() => {
    const measure = () => {
      const row = rowRef.current
      if (!row) return
      setOffsets(letterRefs.current.map((el) => (el ? row.offsetWidth / 2 - (el.offsetLeft + el.offsetWidth / 2) : 0)))
    }
    measure()
    document.fonts?.ready.then(measure)
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center"
      onPointerDown={onSkip}
      // The blast knocks the camera, then it settles
      animate={banged ? { x: [0, -8, 7, -5, 3, -1, 0], y: [0, 5, -6, 4, -2, 1, 0] } : undefined}
      transition={{ duration: 0.55, ease: [0.2, 0.7, 0.3, 1] }}
    >
      <Plasma bang={banged} />
      <BigBang bang={banged} />

      {/* The singularity: unstable, gathering, then gone in the flash */}
      <motion.span
        aria-hidden
        className="absolute top-1/2 left-1/2 -mt-[5px] -ml-[5px] size-[10px] rounded-full bg-white shadow-[0_0_14px_4px_rgba(230,248,255,0.95),0_0_60px_18px_rgba(103,232,249,0.45),0_0_120px_40px_rgba(167,139,250,0.25)]"
        initial={{ scale: 0, opacity: 0 }}
        animate={
          banged
            ? { scale: 46, opacity: 0, transition: { duration: 0.42, ease: "easeOut" } }
            : {
                scale: [0, 0.8, 0.65, 1.1, 0.85, 1.5],
                opacity: [0, 1, 0.8, 1, 0.85, 1],
                x: [0, 0, 1.5, -1.5, 2, -2],
                transition: { duration: 1.15, times: [0, 0.2, 0.4, 0.6, 0.8, 1], ease: "easeInOut" },
              }
        }
      >
        {/* Diffraction spikes */}
        <span className="absolute top-1/2 left-1/2 h-px w-16 -translate-1/2 bg-gradient-to-r from-transparent via-white/90 to-transparent" />
        <span className="absolute top-1/2 left-1/2 h-10 w-px -translate-1/2 bg-gradient-to-b from-transparent via-white/80 to-transparent" />
      </motion.span>

      {stage < STAGE.decrypt && (
        // Same PORTFOLIO-wide box as the decrypting word, so KARL stays put when the glyphs take over
        <div className="display hero-word grid" aria-hidden>
          <span className="invisible col-start-1 row-start-1 whitespace-nowrap">{WORD}</span>
          <div ref={rowRef} className="col-start-1 row-start-1 flex items-end">
            {NAME.split("").map((ch, i) => (
              <motion.span
                key={ch + i}
                ref={(el) => {
                  letterRefs.current[i] = el
                }}
                className="silver inline-block"
                initial={{ opacity: 0 }}
                animate={
                  stage >= STAGE.letters
                    ? {
                        opacity: [0, 1],
                        x: [offsets[i], 0],
                        y: ["0.1em", "0em"],
                        rotate: [SPINS[i], 0],
                        scale: [0.15, 1],
                        filter: ["blur(12px)", "blur(0px)"],
                        textShadow: [SPLIT, CLEAN],
                      }
                    : undefined
                }
                transition={{
                  type: "spring",
                  bounce: 0.32,
                  visualDuration: 0.6,
                  delay: i * 0.12,
                  opacity: { duration: 0.2, delay: i * 0.12 },
                  textShadow: { duration: 0.9, delay: i * 0.12 + 0.15, ease: "easeOut" },
                  filter: { duration: 0.5, delay: i * 0.12, ease: "easeOut" },
                }}
              >
                {ch}
              </motion.span>
            ))}
          </div>
        </div>
      )}

      {/* Mission log, typed in as each beat lands; every line keeps its slot so nothing shifts */}
      <ul aria-hidden className="label absolute bottom-7 left-[var(--gutter)] space-y-1.5 text-[10px] sm:text-[11px]">
        {LOG.map(([at, k, v]) => (
          <motion.li
            key={k}
            className="flex gap-3"
            initial={{ opacity: 0, x: -8 }}
            animate={stage >= at ? { opacity: 1, x: 0 } : undefined}
            transition={{ duration: 0.25 }}
          >
            <span className="w-24 text-faint">{k}</span>
            <span className={v === "granted" ? "text-signal" : "text-cyan"}>{v}</span>
          </motion.li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onSkip}
        className="label absolute right-[var(--gutter)] bottom-6 flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-dim transition-colors hover:border-cyan/50 hover:text-ink"
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
  const y = useTransform(scrollYProgress, [0, 1], [0, -140])
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0])
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

      {stage >= STAGE.spark && stage < STAGE.settle && <IntroStage stage={stage} onSkip={onSkip} />}

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
        animate={online ? { opacity: 1 } : undefined}
        transition={{ duration: 0.8, delay: 0.2 }}
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
