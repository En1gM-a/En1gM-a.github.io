import { useEffect, useRef } from "react"
import { motion } from "motion/react"
import { BigBang } from "./BigBang"

const BLACKOUT_AT = 1050 // ms: the screen is fully dark, safe to jump to the top and restart
const DONE_AT = 1550

/**
 * "Back to orbit": the page goes supernova from the point that was clicked —
 * a swelling white blast, debris and shockwaves — then fades to the void, where
 * the Big Bang replays.
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

  useEffect(() => {
    const a = window.setTimeout(() => handlers.current.onBlackout(), BLACKOUT_AT)
    const b = window.setTimeout(() => handlers.current.onDone(), DONE_AT)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [])

  // Far enough to cover the screen from any corner
  const reach = Math.hypot(window.innerWidth, window.innerHeight) * 2.2

  return (
    <motion.div
      aria-hidden
      className="fixed inset-0 z-[95] overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{ duration: DONE_AT / 1000, times: [0, BLACKOUT_AT / DONE_AT, 1], ease: "easeOut" }}
    >
      <BigBang bang origin={origin} infall={false} />

      {[
        ["border-white/80", 0.9, 0],
        ["border-cyan/70", 1.2, 0.06],
        ["border-violet/60", 1.5, 0.14],
      ].map(([cls, duration, delay]) => (
        <motion.span
          key={String(cls)}
          className={`absolute size-10 rounded-full border-2 ${cls}`}
          style={{ left: origin.x - 20, top: origin.y - 20 }}
          initial={{ scale: 0, opacity: 0.9 }}
          animate={{ scale: 60, opacity: 0 }}
          transition={{ duration: Number(duration), delay: Number(delay), ease: [0.16, 1, 0.3, 1] }}
        />
      ))}

      {/* The blast swells out of the button, accelerating, until it swallows the page */}
      <motion.span
        className="absolute size-10 rounded-full bg-[radial-gradient(circle,#ffffff_0%,#e8f9ff_45%,#a5f3fc_75%,rgb(167_139_250/0.6)_100%)] shadow-[0_0_120px_60px_rgba(200,240,255,0.7)]"
        style={{ left: origin.x - 20, top: origin.y - 20 }}
        initial={{ scale: 0 }}
        animate={{ scale: reach / 40 }}
        transition={{ duration: 0.62, delay: 0.08, ease: [0.7, 0, 0.84, 0] }}
      />

      {/* Fade to the void before the restart */}
      <motion.div
        className="absolute inset-0 bg-void"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.62, duration: 0.38, ease: "easeIn" }}
      />
    </motion.div>
  )
}
