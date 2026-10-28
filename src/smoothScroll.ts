import Lenis from "lenis"
import "lenis/dist/lenis.css"

// While set, wheel input doesn't scroll (the black hole holds the page still)
let held = false
export const holdScroll = (on: boolean) => {
  held = on
}

/**
 * Inertial wheel scrolling (Lenis), the glide award-winning sites have. Touch keeps the phone's own
 * momentum, and it pauses by itself whenever the page's overflow is hidden (the intro's lock).
 */
export function startSmoothScroll() {
  const lenis = new Lenis({ autoRaf: true, autoToggle: true, virtualScroll: () => !held })
  // A click (a nav jump, a voyage stop, Back to orbit) ends any glide, so it never fights the jump
  const settle = () => lenis.scrollTo(window.scrollY, { immediate: true })
  window.addEventListener("click", settle, true)
  return () => {
    window.removeEventListener("click", settle, true)
    lenis.destroy()
  }
}
