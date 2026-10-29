import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { BigBang } from "./BigBang"
import { Plasma } from "./Plasma"
import { PULL, PULL_FROM, holeFilm } from "./hole"
import { holdScroll } from "../smoothScroll"

const BLACKOUT_AT = 2300 // ms: the hole has swallowed everything, the view included; safe to jump to the top and restart
const FILM_BLACKOUT_AT = 3100 // ms: the same moment in the film, whose fall ends in the dark at 3 s
const REVEAL_AFTER = 250 // ms: the intro has taken over underneath, so the dark can lift
const LIFT = 650 // ms the dark takes to lift
// The film's shadow as it falls in, as a share of the film's height, over its first 2 s (measured from the clip).
// A soft black disc a little larger stands in for it over the page, since screen blending can't draw black
const SHADOW = [0, 0.08, 0.1, 0.14, 0.18, 0.24, 0.37]
const SHADOW_TIMES = [0, 0.075, 0.33, 0.5, 0.67, 0.83, 1]

const ease = "cubic-bezier(0.32, 0, 0.67, 0)" // slowly at first, then all at once

/**
 * Spaghettify what is on screen into the hole at its centre. Every visible part of the page is torn loose,
 * stretched toward the hole and squeezed thin as it spirals in, the nearest first, as tides do, and the sky
 * swirls down after it. Returns a function that puts it all back
 */
function spaghettify() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const reach = Math.hypot(vw, vh) / 2
  // The parts: anything with its own text, media or a visible box, each taken whole
  const found = new Set<HTMLElement>()
  for (const el of document.querySelectorAll<HTMLElement>("main *, header, header *, footer, footer *")) {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue
    const css = getComputedStyle(el)
    const own =
      el.matches("img, svg, canvas, video, input, textarea, button") ||
      [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) ||
      css.backgroundColor !== "rgba(0, 0, 0, 0)" ||
      css.backgroundImage !== "none" ||
      parseFloat(css.borderTopWidth) > 0
    if (!own) continue
    // Inline boxes can't be transformed, so the block they sit in goes instead
    let part = el
    while (getComputedStyle(part).display === "inline" && part.parentElement) part = part.parentElement
    found.add(part)
  }
  const parts = [...found].filter((el) => ![...found].some((other) => other !== el && other.contains(el)))
  const falls: Animation[] = []
  for (const el of parts) {
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2 - vw / 2
    const y = r.top + r.height / 2 - vh / 2
    const far = Math.min(1, Math.hypot(x, y) / reach)
    // On linear time: the spiral and the stretch below already accelerate, so the strands lengthen from the start
    const frames = [0, 0.2, 0.4, 0.6, 0.75, 0.88, 1].map((p) => {
      // Spiralling in as it falls; stretched along the line to the hole, squeezed across it
      const turn = 1.5 * p * p
      const left = 1 - p * p
      const nx = (x * Math.cos(turn) - y * Math.sin(turn)) * left
      const ny = (x * Math.sin(turn) + y * Math.cos(turn)) * left
      const toHole = Math.atan2(ny, nx)
      return {
        offset: p,
        transform: `translate(${nx - x}px, ${ny - y}px) rotate(${toHole}rad) scale(${1 + 7 * p ** 1.6}, ${1 / (1 + 5 * p)}) rotate(${turn - toHole}rad)`,
        opacity: p <= 0.65 ? 1 : 1 - ((p - 0.65) / 0.35) ** 2,
      }
    })
    // The nearer a part is, the sooner the tide takes it; all of it is in by the time the hole passes the corners
    falls.push(el.animate(frames, { delay: (PULL_FROM + far * 0.3) * 1000, duration: (PULL - far * 0.3) * 1000, fill: "forwards" }))
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-backdrop]"))
    falls.push(
      el.animate([{ transform: "rotate(0deg) scale(1)", opacity: 1 }, { transform: "rotate(110deg) scale(0.12)", opacity: 0 }], {
        delay: PULL_FROM * 1000,
        duration: PULL * 1000,
        easing: ease,
        fill: "forwards",
      }),
    )
  return () => falls.forEach((f) => f.cancel())
}

/**
 * "Back to orbit": a small black hole opens at the centre of the screen and
 * spaghettifies the page: every part of it, the nav included, is stretched
 * toward the hole and squeezed thin as it spirals in, the nearest first, and
 * the sky swirls down after it. The hole looms faster and faster as the viewer
 * falls in, while streaks of starlight stream past like a warp. Then they cross
 * the horizon and the dark swallows everything; in it a violet point of light
 * appears, the singularity the Big Bang intro starts from, so the intro picks
 * up from that same point.
 * Once its film has loaded, the fall plays as that film, screen-blended over the page so the whole black hole shows
 * while the page streams into its horizon; its dark hands over the same way.
 */
export function BlackHole({ onBlackout, onDone }: { onBlackout: () => void; onDone: () => void }) {
  const handlers = useRef({ onBlackout, onDone })
  handlers.current = { onBlackout, onDone }
  const [reveal, setReveal] = useState(false)
  const [film] = useState(() => holeFilm)

  useEffect(() => {
    const blackout = film ? FILM_BLACKOUT_AT : BLACKOUT_AT
    const release = spaghettify()
    // Nothing scrolls while it falls in (the smooth scroller is told too, since it ignores prevented wheels)
    holdScroll(true)
    const hold = (e: Event) => e.preventDefault()
    window.addEventListener("wheel", hold, { passive: false })
    window.addEventListener("touchmove", hold, { passive: false })
    const b = window.setTimeout(() => {
      release()
      handlers.current.onBlackout()
    }, blackout)
    const r = window.setTimeout(() => setReveal(true), blackout + REVEAL_AFTER)
    const c = window.setTimeout(() => handlers.current.onDone(), blackout + REVEAL_AFTER + LIFT)
    return () => {
      window.clearTimeout(b)
      window.clearTimeout(r)
      window.clearTimeout(c)
      window.removeEventListener("wheel", hold)
      window.removeEventListener("touchmove", hold)
      holdScroll(false)
      release()
    }
  }, [film])

  const lift = { duration: (LIFT - 50) / 1000, ease: "easeOut" } as const

  if (film) {
    // How tall the film is on screen (object-cover), so the stand-in shadow matches the film's own
    const filmHeight = Math.max(window.innerHeight, (window.innerWidth * 9) / 16)
    // Three loose layers, not one wrapper: a wrapper would be a stacking context of its own, and the film could
    // only blend with that, not with the page
    return (
      <>
        {/* The dark the viewer falls into: clear while the page streams into the hole, closing in once it's gone */}
        <motion.div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[95] bg-void"
          initial={{ opacity: 0 }}
          animate={reveal ? { opacity: 0 } : { opacity: [0, 0, 1] }}
          transition={reveal ? lift : { duration: 1.9, times: [0, 0.71, 1], ease: "easeInOut" }}
        />
        {/* The event horizon: the page's strands vanish into it */}
        <motion.div
          aria-hidden
          className="pointer-events-none fixed top-1/2 left-1/2 z-[95] size-[100px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,#030409_72%,transparent)]"
          initial={{ scale: 0 }}
          animate={reveal ? { opacity: 0 } : { scale: SHADOW.map((s) => (s * 1.4 * filmHeight) / 100) }}
          transition={reveal ? lift : { duration: 2, times: SHADOW_TIMES, ease: "linear" }}
        />
        {/* The whole black hole over the page, uncropped: screen blending shows its disk, photon ring, glow and
            stars, while its empty sky lets the page show through; once the dark is in, it is the film itself */}
        <motion.video
          src={film}
          autoPlay
          muted
          playsInline
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[96] h-full w-full object-cover mix-blend-screen brightness-[.85]"
          initial={{ opacity: 0 }}
          animate={{ opacity: reveal ? 0 : 1 }}
          transition={reveal ? lift : { duration: 0.3 }}
        />
      </>
    )
  }

  return (
    <motion.div
      aria-hidden
      className="fixed inset-0 z-[95] overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ opacity: reveal ? 0 : 1 }}
      transition={lift}
    >
      <Plasma bang kind="blackhole" />
      <BigBang bang mode="infall" />
    </motion.div>
  )
}
