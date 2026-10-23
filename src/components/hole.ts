/**
 * The black hole behind "Back to orbit", shared by its shader and its infalling particles so they agree.
 * It opens small, grows as it swallows the page (on the same accelerating curve as the page's fall),
 * then swells past every edge of the screen, taking the view with it.
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
  const fed = Math.min(1, Math.max(0, (t - PULL_FROM) / PULL)) ** 3
  const engulf = smooth(PULL_FROM + PULL - 0.03, PULL_FROM + PULL + 0.4, t)
  return 0.022 * smooth(0, 0.35, t) + 0.1 * fed + 1.6 * engulf * engulf
}
