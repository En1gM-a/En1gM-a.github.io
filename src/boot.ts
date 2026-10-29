/**
 * First load. The themed loader in index.html paints before any script runs;
 * this module tracks the heavy one-time work (fonts, the portrait, the galaxy
 * and its shaders, NASA's suit) and only then
 * hands over to the intro, so none of it lands mid-animation. Past MAX_WAIT the
 * intro starts anyway, and late pieces fade in afterwards.
 */
export type BootTask = "fonts" | "portrait" | "galaxy" | "suit" | "voyage" | "film"

const TASKS: Record<BootTask, { label: string; weight: number }> = {
  fonts: { label: "Syncing typefaces", weight: 1 },
  portrait: { label: "Calibrating the portrait", weight: 1 },
  galaxy: { label: "Charting the galaxy", weight: 3 },
  suit: { label: "Suiting up the astronaut", weight: 3 },
  // The project planets' shaders: on a first visit their compile can hold the page still for seconds
  voyage: { label: "Plotting the voyage", weight: 2 },
  // The intro's Big Bang film, held in memory so it plays without waiting on the network
  film: { label: "Rendering the Big Bang", weight: 2 },
}
const ORDER = Object.keys(TASKS) as BootTask[]
const TOTAL = ORDER.reduce((s, t) => s + TASKS[t].weight, 0)
const MAX_WAIT = 9000 // ms: a slow connection still gets its intro
const MIN_SHOW = 700 // ms: no flash of a loader on a warm cache
const HANDOFF = 260 // ms from the loader starting to fade to the intro starting
// The suit only appears after the intro and joins the scene without a hitch whenever it lands,
// so a slow download shouldn't hold the intro back for long
const SUIT_WAIT = 3500

/** The intro film as a local blob URL once loaded; empty if it could not load (the intro then draws it live) */
export let filmUrl = ""

const done = new Set<BootTask>()
let resolveReady: () => void = () => {}
/** Resolves when the intro may start */
export const bootReady = new Promise<void>((r) => (resolveReady = r))
let started = 0
let finished = false

export function bootDone(task: BootTask) {
  if (done.has(task)) return
  done.add(task)
  // Visible in DevTools' performance timeline, to see what the loader waited on
  performance.mark(`boot:${task}`)
  if (done.size === ORDER.length) finish()
}

/** Call a function after the given number of rendered frames (shader compiles happen on the first ones) */
export function afterFrames(n: number, fn: () => void) {
  if (n <= 0) return fn()
  requestAnimationFrame(() => afterFrames(n - 1, fn))
}

function finish() {
  if (finished) return
  finished = true
  const el = document.getElementById("boot")
  if (!el) return resolveReady()
  window.setTimeout(
    () => {
      // The ring and readout go first; the loader's star stays where the intro's singularity appears
      el.classList.add("boot-ready")
      const sr = el.querySelector("#boot-sr")
      if (sr) sr.textContent = "Portfolio loaded"
      window.setTimeout(() => {
        el.classList.add("boot-out")
        resolveReady()
        window.setTimeout(() => el.remove(), 700)
      }, HANDOFF)
    },
    Math.max(0, MIN_SHOW - (performance.now() - started)),
  )
}

export function startBoot() {
  started = performance.now()
  const el = document.getElementById("boot")
  if (!el) {
    finished = true
    resolveReady()
    return
  }
  const pct = el.querySelector<HTMLElement>("#boot-pct")
  const fill = el.querySelector<HTMLElement>("#boot-fill")
  const label = el.querySelector<HTMLElement>("#boot-task")

  // The readout eases toward the real progress, so it never jumps or stalls visibly
  let shown = 0
  let text = ""
  const tick = () => {
    if (!el.isConnected) return
    const target = finished ? 1 : ORDER.reduce((s, t) => s + (done.has(t) ? TASKS[t].weight : 0), 0) / TOTAL
    shown += (target - shown) * (finished ? 0.25 : 0.1)
    if (pct) pct.textContent = `${Math.round(shown * 100)}%`
    if (fill) fill.style.transform = `scaleX(${Math.max(0.03, shown).toFixed(3)})`
    const next = ORDER.find((t) => !done.has(t))
    const now = finished || !next ? "Ready" : TASKS[next].label
    if (label && now !== text) label.textContent = text = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  ;(document.fonts?.ready ?? Promise.resolve()).then(() => bootDone("fonts"))
  const portrait = new Image()
  portrait.src = `${import.meta.env.BASE_URL}karl-grad.webp`
  portrait
    .decode()
    .catch(() => {})
    .then(() => bootDone("portrait"))
  window.setTimeout(() => bootDone("suit"), SUIT_WAIT)
  // With reduced motion there is no intro to play it in
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) bootDone("film")
  else
    fetch(`${import.meta.env.BASE_URL}media/big-bang.mp4`)
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => (filmUrl = URL.createObjectURL(b)))
      .catch(() => {})
      .then(() => bootDone("film"))
  window.setTimeout(finish, MAX_WAIT)
}
