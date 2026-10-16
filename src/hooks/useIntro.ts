import { useCallback, useEffect, useRef, useState } from "react"
import { useReducedMotion } from "motion/react"

/**
 * Intro timeline, a Big Bang:
 * -1 waiting for fonts · 0 a singularity gathers matter · 1 the Big Bang · 2 KARL flies out of the blast
 * 3 glitch-decrypt to PORTFOLIO · 4 hyperspace arrival + stars assemble the photo · 5 online
 */
export const STAGE = { wait: -1, spark: 0, bang: 1, letters: 2, decrypt: 3, settle: 4, done: 5 } as const

// Starting before the display font lands would reflow the intro mid-flight
const FONT_WAIT_MAX = 900

const TIMELINE: [number, number][] = [
  [STAGE.bang, 1150],
  [STAGE.letters, 1500],
  [STAGE.decrypt, 2650],
  [STAGE.settle, 3650],
  [STAGE.done, 4500],
]

export function useIntro() {
  const reduce = useReducedMotion()
  const [stage, setStage] = useState<number>(reduce ? STAGE.done : STAGE.wait)
  const [skipped, setSkipped] = useState(!!reduce)
  const timers = useRef<number[]>([])
  const stageRef = useRef(stage)
  stageRef.current = stage

  const skip = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    // Before the decrypt there is no word on screen to fly into place, so fade it in instead
    if (stageRef.current < STAGE.decrypt) setSkipped(true)
    setStage(STAGE.done)
  }, [])

  useEffect(() => {
    if (reduce) {
      setStage(STAGE.done)
      setSkipped(true)
      return
    }
    if ("scrollRestoration" in history) history.scrollRestoration = "manual"
    window.scrollTo(0, 0)
    let cancelled = false
    const fonts = document.fonts?.ready ?? Promise.resolve()
    Promise.race([fonts, new Promise((r) => setTimeout(r, FONT_WAIT_MAX))]).then(() => {
      if (cancelled || stageRef.current !== STAGE.wait) return
      setStage(STAGE.spark)
      timers.current = TIMELINE.map(([s, at]) => window.setTimeout(() => setStage(s), at))
    })
    return () => {
      cancelled = true
      timers.current.forEach(clearTimeout)
    }
  }, [reduce])

  // Hold the page still while the intro plays
  useEffect(() => {
    const root = document.documentElement
    root.style.overflow = stage < STAGE.done ? "hidden" : ""
    return () => {
      root.style.overflow = ""
    }
  }, [stage])

  useEffect(() => {
    if (stage >= STAGE.settle) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") skip()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [stage, skip])

  return { stage, skipped, skip }
}
