import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import type { Galaxy } from "../three/galaxy"
import { galaxyBus } from "../three/bus"
import { Starfield } from "./Starfield"

/**
 * Fixed WebGL galaxy behind the whole page. Three.js loads lazily so the intro
 * paints at once; without WebGL the 2D starfield stands in. The galaxy dims
 * itself behind the content (see galaxy.ts); the voyage hides it via galaxyBus.dim.
 */
export function GalaxyBackground({ shown, arrived }: { shown: boolean; arrived: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const galaxy = useRef<Galaxy | null>(null)
  const [ready, setReady] = useState(false)
  const [fallback, setFallback] = useState(false)
  const reduce = useReducedMotion()
  const arrivedRef = useRef(arrived)
  arrivedRef.current = arrived


  useEffect(() => {
    let cancelled = false
    import("../three/galaxy").then(({ createGalaxy }) => {
      if (cancelled || !ref.current) return
      const g = createGalaxy(ref.current, {
        reduce: !!reduce,
        mobile: window.matchMedia("(max-width: 767px), (pointer: coarse)").matches,
      })
      if (!g) return setFallback(true)
      galaxy.current = g
      galaxyBus.attach(g)
      // A scene created after the intro finished must arrive straight away
      if (arrivedRef.current) g.arrive(true)
      setReady(true)
    })
    return () => {
      cancelled = true
      galaxyBus.attach(null)
      galaxy.current?.dispose()
      galaxy.current = null
    }
  }, [reduce])

  useEffect(() => {
    galaxy.current?.arrive(arrived)
  }, [arrived])

  if (fallback) return <Starfield visible={arrived} />

  return (
    <motion.div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={{ opacity: galaxyBus.dim }}>
      <canvas
        ref={ref}
        className="absolute inset-0 transition-opacity duration-[1200ms] ease-out"
        style={{ opacity: ready && shown ? 1 : 0 }}
      />
    </motion.div>
  )
}
