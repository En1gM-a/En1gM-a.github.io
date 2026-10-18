import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { BigBang } from "./BigBang"
import { Plasma } from "./Plasma"

const COLLAPSE = 220 // ms: the star at the link contracts and brightens before it blows
const BLACKOUT_AT = COLLAPSE + 1250 // ms: the screen is dark, safe to jump to the top and restart
const DONE_AT = BLACKOUT_AT + 500

/** The blast hits like a camera knock: the page and the explosion jolt, then settle */
function shake(extra: (HTMLElement | null)[]) {
  const xs = [0, -9, 8, -6, 4, -2, 0]
  const ys = [0, 6, -7, 5, -3, 1, 0]
  const frames = xs.map((x, i) => ({ transform: `translate(${x}px, ${ys[i]}px)` }))
  const targets = [...document.querySelectorAll<HTMLElement>("main, footer"), ...extra]
  for (const el of targets) el?.animate(frames, { duration: 560, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" })
}

/**
 * "Back to orbit": the page goes supernova from the point that was clicked.
 * The star's core collapses, it flares brighter than everything around it,
 * and a shell of ejecta tears outward in filaments while debris cools from
 * white to red; the screen fades to the void, where the Big Bang replays.
 */
export function Supernova({
  origin,
  onBlackout,
  onDone,
}: {
  origin: { x: number; y: number }
  onBlackout: () => void
  onDone: () => void
}) {
  const handlers = useRef({ onBlackout, onDone })
  handlers.current = { onBlackout, onDone }
  const stage = useRef<HTMLDivElement>(null)
  const [blast, setBlast] = useState(false)

  useEffect(() => {
    const a = window.setTimeout(() => {
      setBlast(true)
      shake([stage.current])
    }, COLLAPSE)
    const b = window.setTimeout(() => handlers.current.onBlackout(), BLACKOUT_AT)
    const c = window.setTimeout(() => handlers.current.onDone(), DONE_AT)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
      window.clearTimeout(c)
    }
  }, [])

  return (
    <motion.div
      aria-hidden
      className="fixed inset-0 z-[95] overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{ duration: DONE_AT / 1000, times: [0, BLACKOUT_AT / DONE_AT, 1], ease: "easeOut" }}
    >
      <div ref={stage} className="absolute inset-0">
        <Plasma bang={blast} origin={origin} kind="supernova" />
        <BigBang bang={blast} origin={origin} mode="ejecta" />
      </div>

      {/* Fade to the void before the restart */}
      <motion.div
        className="absolute inset-0 bg-void"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: (COLLAPSE + 850) / 1000, duration: 0.4, ease: "easeIn" }}
      />
    </motion.div>
  )
}
