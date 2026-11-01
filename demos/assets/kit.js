// Shared by the project demos. Every scene is a pure function of time t (seconds): render(t) places the cursor,
// the camera, typed text and counters, so a frame is the same however often it is seeked, and t = 0 matches t = end
window.kit = (() => {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
  /** 0..1 progress of t through [a, b] */
  const seg = (t, a, b) => clamp((t - a) / (b - a))
  const mix = (a, b, u) => a + (b - a) * u
  const ease = {
    inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
    out: (u) => 1 - Math.pow(1 - u, 3),
    in: (u) => u * u * u,
    back: (u) => 1 + 2.6 * Math.pow(u - 1, 3) + 1.6 * Math.pow(u - 1, 2),
  }
  /** Eased value of t through [a, b], from `from` to `to` */
  const tween = (t, a, b, from, to, fn = ease.inOut) => mix(from, to, fn(seg(t, a, b)))
  /** In over [a, a+fade], out over [b-fade, b]: 0..1 */
  const window_ = (t, a, b, fade = 0.25) => Math.min(ease.out(seg(t, a, a + fade)), 1 - ease.in(seg(t, b - fade, b)))

  /** Interpolates objects keyed by time: [{ t, x, y, ... }]; eased between neighbours, held at the ends */
  const keys = (list, t, fn = ease.inOut) => {
    if (t <= list[0].t) return { ...list[0] }
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]
      const b = list[i]
      if (t <= b.t) {
        const u = fn(seg(t, a.t, b.t))
        const out = {}
        for (const k in b) out[k] = typeof b[k] === "number" && typeof a[k] === "number" ? mix(a[k], b[k], u) : u < 1 ? a[k] : b[k]
        return out
      }
    }
    return { ...list[list.length - 1] }
  }

  /** The first characters of text, typed at cps from start */
  const typed = (text, t, start, cps = 22) => text.slice(0, clamp(Math.floor((t - start) * cps), 0, text.length))
  /** A caret that blinks twice a second, solid while typing */
  const caret = (t, typing) => (typing || Math.floor(t * 2) % 2 === 0 ? 1 : 0)
  /** 0..1..0 over 0.3 s after a click */
  const press = (t, at) => {
    const u = seg(t, at, at + 0.3)
    return u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0
  }
  /** Expanding ring after a click: { s: scale, o: opacity } */
  const ring = (t, at) => {
    const u = seg(t, at, at + 0.55)
    return u <= 0 || u >= 1 ? { s: 0, o: 0 } : { s: mix(0.4, 1.8, ease.out(u)), o: (1 - u) * 0.55 }
  }
  const peso = (n, decimals = 0) => "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

  /**
   * The camera: zoom z toward focus point (fx, fy) in stage units, kept inside the stage so no edge shows.
   * Returns a CSS transform for a wrapper with transform-origin 0 0
   */
  const camera = (z, fx, fy, w, h) => {
    const x = clamp(w / 2 - fx * z, w - w * z, 0)
    const y = clamp(h / 2 - fy * z, h - h * z, 0)
    return `translate(${x}px, ${y}px) scale(${z})`
  }

  /** One paused GSAP timeline that drives render(t); the scene registers it on window.__timelines */
  const run = (duration, render) => {
    const state = { t: 0 }
    const tl = gsap.timeline({ paused: true })
    tl.to(state, { t: duration, duration, ease: "none", onUpdate: () => render(state.t) }, 0)
    render(0)
    return tl
  }

  return { clamp, seg, mix, ease, tween, window: window_, keys, typed, caret, press, ring, peso, camera, run }
})()
