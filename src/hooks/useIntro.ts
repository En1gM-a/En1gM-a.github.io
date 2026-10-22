import { useCallback, useEffect, useRef, useState } from "react"
import { useReducedMotion } from "motion/react"
import { bootReady } from "../boot"

/**
 * Intro timeline, the Big Bang after NASA's visualisation of it:
 * -1 the loader · 0 a violet point of light gathers · 1 it blooms, and the universe glows as an even fog
 * 2 the fog thins, the first stars light up, KARL condenses · 3 the deep field, glitch-decrypt to PORTFOLIO
 * 4 the galaxy arrives + stars assemble the photo · 5 online
 */
export const STAGE = { wait: -1, spark: 0, bang: 1, letters: 2, decrypt: 3, settle: 4, done: 5 } as const

const TIMELINE: [number, number][] = [
  [STAGE.bang, 1150],
  [STAGE.letters, 2000],
  [STAGE.decrypt, 3000],
  [STAGE.settle, 3950],
  [STAGE.done, 4800],
]

export function useIntro() {
  const reduce = useReducedMotion()
  const [stage, setStage] = useState<number>(reduce ? STAGE.done : STAGE.wait)
  const [skipped, setSkipped] = useState(!!reduce)
  const timers = useRef<number[]>([])
  const stageRef = useRef(stage)
  stageRef.current = stage

  const schedule = useCallback(() => {
    timers.current.forEach(clearTimeout)
    setStage(STAGE.spark)
    timers.current = TIMELINE.map(([s, at]) => window.setTimeout(() => setStage(s), at))
  }, [])

  /** Run the whole Big Bang again from the singularity (the page should already be at the top) */
  const replay = useCallback(() => {
    if (reduce) return
    setSkipped(false)
    schedule()
  }, [reduce, schedule])

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
    // Wait for the loader: fonts, the portrait and the 3D scenes are ready, so nothing lands mid-animation
    bootReady.then(() => {
      if (cancelled || stageRef.current !== STAGE.wait) return
      schedule()
    })
    return () => {
      cancelled = true
      timers.current.forEach(clearTimeout)
    }
  }, [reduce, schedule])

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

  return { stage, skipped, skip, replay }
}
