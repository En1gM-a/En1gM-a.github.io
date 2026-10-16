import { useEffect, useState } from "react"
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react"

/**
 * A targeting reticle that trails the mouse and locks onto interactive
 * elements. Decorative only: the native cursor stays visible, and it never
 * renders for touch input or reduced motion.
 */
export function Reticle() {
  const reduce = useReducedMotion()
  const [enabled, setEnabled] = useState(false)
  const [locked, setLocked] = useState(false)
  const [shown, setShown] = useState(false)
  const x = useSpring(useMotionValue(-100), { stiffness: 520, damping: 40, mass: 0.4 })
  const y = useSpring(useMotionValue(-100), { stiffness: 520, damping: 40, mass: 0.4 })

  useEffect(() => {
    setEnabled(!reduce && window.matchMedia("(pointer: fine)").matches)
  }, [reduce])

  useEffect(() => {
    if (!enabled) return
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      x.set(e.clientX)
      y.set(e.clientY)
      setShown(true)
      const t = e.target as Element | null
      setLocked(!!t?.closest?.("a, button, [data-reticle]"))
    }
    const onLeave = () => setShown(false)
    window.addEventListener("pointermove", onMove, { passive: true })
    document.addEventListener("pointerleave", onLeave)
    return () => {
      window.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerleave", onLeave)
    }
  }, [enabled, x, y])

  if (!enabled) return null

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[70] mix-blend-screen"
      style={{ x, y, translateX: "-50%", translateY: "-50%" }}
      animate={{ opacity: shown ? 1 : 0, scale: locked ? 1.55 : 1, rotate: locked ? 45 : 0 }}
      transition={{ type: "spring", bounce: 0.2, visualDuration: 0.25 }}
    >
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none" stroke="#67e8f9" strokeWidth="1.2">
        <circle cx="17" cy="17" r="9" strokeOpacity="0.55" />
        <path d="M17 2v6M17 26v6M2 17h6M26 17h6" strokeOpacity="0.9" />
        <circle cx="17" cy="17" r="1.2" fill="#67e8f9" stroke="none" />
      </svg>
    </motion.div>
  )
}
