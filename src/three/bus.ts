import { motionValue } from "motion/react"
import type { Galaxy } from "./galaxy"

// Lets any component nudge the background galaxy without prop drilling
let galaxy: Galaxy | null = null

export const galaxyBus = {
  attach: (g: Galaxy | null) => {
    galaxy = g
  },
  warp: (amount: number) => galaxy?.setWarp(amount),
  pause: (paused: boolean) => galaxy?.setPaused(paused),
  /** Extra dimming on top of the per-section fade, e.g. while the Projects voyage owns the screen */
  dim: motionValue(1),
}
