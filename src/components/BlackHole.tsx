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
// The hole the film is seen through, in vmax: it opens small, then swells past every corner as the viewer falls in
const HOLE = [0, 9, 90]
const opening: Transition = { duration: 1.6, times: [0, 0.2, 1], ease: ["easeOut", [0.7, 0, 0.84, 0]] }

/** Spiral what is on screen into its centre: the page, the nav and the sky. Returns a function that puts it all back */
function pull() {
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2
  const restore: (() => void)[] = []
  for (const el of document.querySelectorAll<HTMLElement>("main, footer, header, [data-backdrop]")) {
    const r = el.getBoundingClientRect()
    if (r.bottom < 0 || r.top > window.innerHeight) continue
    // Only the part on screen goes in (the rest of the page never needs drawing), turning about the screen's centre
    el.style.clipPath = `inset(${Math.max(0, -r.top)}px 0 ${Math.max(0, r.bottom - window.innerHeight)}px 0)`
    el.style.transformOrigin = `${cx - r.left}px ${cy - r.top}px`
    const fall = el.animate(
      [
        { transform: "rotate(0deg) scale(1)", opacity: 1 },
        { transform: "rotate(16deg) scale(1.35)", opacity: 1, offset: 0.5 },
        { transform: "rotate(75deg) scale(3.4)", opacity: 0 },
      ],
      // The viewer is pulled in, so the page rushes outward past them, twisting, slowly at first, then all at once
      { delay: PULL_FROM * 1000, duration: PULL * 1000, easing: "cubic-bezier(0.32, 0, 0.67, 0)", fill: "forwards" },
    )
    restore.push(() => {
      fall.cancel()
      el.style.clipPath = ""
      el.style.transformOrigin = ""
    })
  }
  return () => restore.forEach((f) => f())
}

/**
 * "Back to orbit": a small black hole opens at the centre of the screen and
 * pulls the viewer in. It looms faster and faster as they fall; the page, the
 * nav and the sky rush outward past them, twisting, while streaks of starlight
 * stream past like a warp and the view rolls as they spiral. Then they cross
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
    const release = pull()
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
