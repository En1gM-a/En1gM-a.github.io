import { useEffect, useState } from "react"

// Extra-wide glyphs (M, W, Q, @, %, &) are left out so the noise never outgrows the final word
const GLYPHS = "ABCDEFGHJKLNOPRSTUVXYZ0123456789#$?<>/\\"

const randomGlyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0]

/**
 * Decrypts `from` into `to`: characters resolve left to right while the
 * unresolved tail cycles through random glyphs.
 */
export function useScramble(from: string, to: string, run: boolean, duration = 900) {
  const [text, setText] = useState(from)

  useEffect(() => {
    if (!run) return
    let raf = 0
    let lastSwap = 0
    const start = performance.now()

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      // Throttle glyph swaps so the noise is readable rather than a blur
      if (now - lastSwap > 45 || p === 1) {
        lastSwap = now
        const revealed = Math.floor(p * to.length)
        const length = Math.min(
          to.length,
          from.length + Math.ceil(p * 1.8 * (to.length - from.length)),
        )
        let out = ""
        for (let i = 0; i < length; i++) {
          if (i < revealed) out += to[i]
          else if (p < 0.12 && i < from.length) out += from[i]
          else out += randomGlyph()
        }
        setText(p === 1 ? to : out)
      }
      if (p < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, from, to, duration])

  return text
}
