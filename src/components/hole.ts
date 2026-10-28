/**
 * The black hole behind "Back to orbit", shared by its shader and its streaks so they agree.
 * Seen by someone falling into it: it opens small, looms faster and faster as they're pulled in,
 * then swells past every edge of the screen as they cross the horizon.
 */

/** When the page starts to fall in, and how long it takes (s after the hole opens) */
export const PULL_FROM = 0.15
export const PULL = 1.5

const smooth = (a: number, b: number, v: number) => {
  const x = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

/** The horizon's radius t seconds after the hole opens, in units of the screen's shorter side */
export function horizon(t: number) {
  // Falling toward it, it grows the way anything ahead does: slowly, then all at once
  const engulf = smooth(PULL_FROM + PULL, PULL_FROM + PULL + 0.4, t)
  return 0.02 * smooth(0, 0.25, t) * Math.exp(t * 1.85) + 1.4 * engulf * engulf
}
