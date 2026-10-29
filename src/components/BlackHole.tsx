import { useEffect, useRef, useState } from "react"
import { motion, type Transition } from "motion/react"
import { BigBang } from "./BigBang"
import { Plasma } from "./Plasma"
import { PULL, PULL_FROM, holeFilm } from "./hole"
import { holdScroll } from "../smoothScroll"

const BLACKOUT_AT = 2300 // ms: the hole has swallowed everything, the view included; safe to jump to the top and restart
const FILM_BLACKOUT_AT = 3100 // ms: the same moment in the film, whose fall ends in the dark at 3 s
const REVEAL_AFTER = 250 // ms: the intro has taken over underneath, so the dark can lift
const LIFT = 650 // ms the dark takes to lift
// The hole the film is seen through, in vmax: it opens small and stays a small mouth while the page streams
// into it, then swells past every corner as the viewer falls in (ease-in quad, close to how anything ahead looms)
const HOLE = [0, 9, 16, 90]
const opening: Transition = { duration: 2.1, times: [0, 0.14, 0.71, 1], ease: ["easeOut", "linear", [0.55, 0.085, 0.68, 0.53]] }

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
 * Once its film has loaded, the fall plays as that film, seen through the hole as it opens, and its dark hands over the same way.
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

  return (
    <motion.div
      aria-hidden
      className="fixed inset-0 z-[95] overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ opacity: reveal ? 0 : 1 }}
      transition={{ duration: (LIFT - 50) / 1000, ease: "easeOut" }}
    >
      {film ? (
        <>
          <motion.video
            src={film}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover brightness-[.85]"
            initial={{ clipPath: "circle(0vmax at 50% 50%)" }}
            animate={{ clipPath: HOLE.map((r) => `circle(${r}vmax at 50% 50%)`) }}
            transition={opening}
          />
          {/* Light dims toward the hole: its edge fades into the dark, and so does the page around it (dark ring at 50% = the hole's edge) */}
          <motion.div
            className="absolute top-1/2 left-1/2 size-[120vmax] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,transparent_35%,#030409_50%,transparent)]"
            initial={{ scale: 0 }}
            animate={{ scale: HOLE.map((r) => r / 30) }}
            transition={opening}
          />
        </>
      ) : (
        <>
          <Plasma bang kind="blackhole" />
          <BigBang bang mode="infall" />
        </>
      )}
    </motion.div>
  )
}
