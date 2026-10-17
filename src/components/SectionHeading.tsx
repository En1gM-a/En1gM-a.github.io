import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

export const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { type: "spring", bounce: 0, visualDuration: 0.7 },
} as const

/** Section title: letters flip up in 3D with a short signal glitch; the note underneath adds facts the title doesn't */
export function SectionHeading({ title, note }: { title: string; note: string }) {
  const reduce = useReducedMotion()
  const [glitch, setGlitch] = useState(false)
  const pulse = () => {
    if (reduce) return
    setGlitch(true)
    window.setTimeout(() => setGlitch(false), 420)
  }

  return (
    <header className="mb-10 sm:mb-14">
      <motion.h2
        className="display glitch text-[clamp(56px,11vw,150px)] text-ink"
        style={{ perspective: 900 }}
        data-text={title}
        data-glitch={glitch ? "on" : "off"}
        onPointerEnter={pulse}
        initial="hidden"
        whileInView="shown"
        viewport={{ once: true, amount: 0.6 }}
        onAnimationComplete={pulse}
        variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.045 } } }}
      >
        <span className="sr-only">{title}</span>
        <span aria-hidden className="inline-block" style={{ transformStyle: "preserve-3d" }}>
          {title.split("").map((ch, i) => (
            <motion.span
              key={i}
              className="inline-block origin-bottom"
              variants={{
                hidden: { opacity: 0, rotateX: -100, y: "0.25em" },
                shown: { opacity: 1, rotateX: 0, y: "0em", transition: { type: "spring", bounce: 0.25, visualDuration: 0.7 } },
              }}
            >
              {ch}
            </motion.span>
          ))}
        </span>
      </motion.h2>
      <motion.p {...reveal} className="mt-4 max-w-2xl text-dim sm:text-lg">
        {note}
      </motion.p>
    </header>
  )
}
