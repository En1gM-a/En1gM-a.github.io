import type { PointerEvent } from "react"
import { useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react"

const SPRING = { stiffness: 220, damping: 22, mass: 0.6 }

/**
 * Pointer-driven 3D tilt. Spread `bind` on the element and apply `style`
 * (it carries rotateX/rotateY plus a glare gradient you can use as a background).
 */
export function useTilt(max = 10) {
  const reduce = useReducedMotion()
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const sx = useSpring(px, SPRING)
  const sy = useSpring(py, SPRING)
  const rotateY = useTransform(sx, [0, 1], [-max, max])
  const rotateX = useTransform(sy, [0, 1], [max, -max])
  const gx = useTransform(sx, (v) => `${v * 100}%`)
  const gy = useTransform(sy, (v) => `${v * 100}%`)
  const glare = useMotionTemplate`radial-gradient(520px circle at ${gx} ${gy}, rgb(255 255 255 / 0.10), transparent 45%)`

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (reduce || e.pointerType !== "mouse") return
    const r = e.currentTarget.getBoundingClientRect()
    px.set((e.clientX - r.left) / r.width)
    py.set((e.clientY - r.top) / r.height)
  }
  const onPointerLeave = () => {
    px.set(0.5)
    py.set(0.5)
  }

  return {
    bind: { onPointerMove, onPointerLeave },
    rotate: reduce ? {} : { rotateX, rotateY },
    glare,
  }
}
