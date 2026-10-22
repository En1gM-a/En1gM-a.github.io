import { useEffect, useRef } from "react"

/**
 * The light of the opening, drawn by one fragment shader at low resolution
 * (it is soft, so it costs little).
 *
 * Big Bang, after NASA's own visualisation of it, which is not an explosion:
 * no fireball, no blast front, no fire. A violet point of light blooms into a
 * cool glow (white heart, cyan, blue rim) that fills everything; the whole
 * universe then glows evenly as a pale fog whose folds stretch as space
 * expands, dims as it cools, and thins away until light travels freely and
 * the first galaxies show through.
 *
 * Black hole, for "Back to orbit": a shadow edged by its photon ring and a
 * tilted disk of infalling gas (white-hot at its inner edge, brighter on the
 * side turning toward us, its far side bent into view over the top) while the
 * dark spreads over the screen; then it shrinks to a violet point of light,
 * the singularity the intro starts from.
 * Without WebGL 2 it draws nothing and the particles carry the moment.
 */

const vertex = /* glsl */ `#version 300 es
in vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }
`

const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uOrigin;
uniform float uPre;
uniform float uT;
uniform float uKind;
out vec4 o;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = (frag - uOrigin) / uRes.y;
  float r = length(p);
  vec3 col = vec3(0.0);
  // Darkness that covers the page even where nothing glows (the black hole's)
  float dark = 0.0;

  if (uKind < 0.5) {
    if (uT < 0.0) {
      // Before: a violet point of light, slowly gathering
      float g = clamp(uPre / 1.15, 0.0, 1.0);
      col = vec3(0.62, 0.46, 1.0) * (0.00005 / (r * r + 0.0002)) * (0.25 + 0.75 * g);
      col += vec3(0.38, 0.24, 0.8) * exp(-r * 8.0) * 0.14 * g * g;
    } else {
      float t = uT;
      // The light blooms (inflation) and is past every edge of the screen within a few frames
      float R = 0.05 * exp(t * 11.0);
      float u = r / R;
      vec3 bloom = mix(vec3(0.93, 0.95, 1.0), vec3(0.48, 0.86, 0.96), smoothstep(0.2, 0.65, u));
      bloom = mix(bloom, vec3(0.2, 0.36, 0.88), smoothstep(0.6, 1.05, u));
      bloom *= exp(-u * u * 0.8);
      // Then the universe glows evenly, everywhere: a pale fog whose soft folds stretch as space expands
      vec2 q = p / (1.0 + t * 0.6);
      float folds = fbm(q * 2.4 + vec2(t * 0.12, -t * 0.08) + 3.1);
      vec3 fog = vec3(0.85, 0.87, 0.91) * (1.0 + (folds - 0.5) * 1.1 * smoothstep(0.25, 0.9, t));
      col = mix(bloom, fog, smoothstep(0.18, 0.45, t));
      // It dims as it cools and thins unevenly until it clears: light can finally travel, and galaxies show through
      float clearing = smoothstep(0.9, 1.75, t);
      float keep = smoothstep(clearing - 0.3, clearing + 0.05, folds);
      col *= 0.88 * exp(-max(0.0, t - 0.35) * 1.5) * keep * smoothstep(0.0, 0.05, t);
    }
  } else {
    // A black hole opens here and takes everything, then shrinks to a point of light
    float t = max(uT, 0.0);
    // Sized by the screen's shorter side, so on a phone the disk still fits across
    float R = 0.085 * min(1.0, uRes.x / uRes.y) * smoothstep(0.0, 0.7, t) * (1.0 - smoothstep(1.7, 2.25, t));
    float iR = 1.0 / max(R, 0.0005);
    float shadow = 1.0 - smoothstep(R * 0.92, R * 1.02 + 0.0005, r);
    float lit = smoothstep(0.15, 0.8, t) * (1.0 - smoothstep(1.55, 2.1, t));
    // Its disk of infalling gas, tilted toward us: turning faster the closer in, white-hot at the inner edge
    vec2 dp = vec2(p.x, p.y / 0.24);
    float d = length(dp);
    float u = d * iR;
    float a = t * 3.2 / pow(max(u, 1.0), 1.5);
    float gas = fbm(mat2(cos(a), -sin(a), sin(a), cos(a)) * dp * iR * 1.6 + 7.0);
    float band = smoothstep(1.3, 1.8, u) * (1.0 - smoothstep(2.8, 5.0, u));
    float heat = clamp(2.4 / (u * u + 0.0001), 0.0, 1.0);
    vec3 hot = mix(vec3(0.85, 0.24, 0.05), vec3(1.0, 0.72, 0.36), smoothstep(0.08, 0.4, heat));
    hot = mix(hot, vec3(1.0, 0.96, 0.9), smoothstep(0.45, 1.0, heat));
    // The side turning toward us is beamed brighter; the far half passes behind the shadow
    float beam = 1.0 + 0.6 * dp.x / max(d, 0.0001);
    float behind = (1.0 - smoothstep(-0.003, 0.003, p.y)) * shadow;
    col = hot * band * (0.35 + 1.1 * gas) * beam * (1.0 - behind);
    // Light from the far side, bent over the top and under the bottom of the shadow
    float zb = (r - R * 1.42) / (R * 0.2 + 0.0001);
    float a2 = t * 2.4;
    float arc = fbm(mat2(cos(a2), -sin(a2), sin(a2), cos(a2)) * p * iR * 1.4 + 3.0);
    col += vec3(1.0, 0.7, 0.36) * exp(-zb * zb) * (1.0 - shadow) * (0.35 + 0.8 * arc);
    // The photon ring, hugging the edge of the shadow
    float zr = (r - R * 1.05) / (R * 0.04 + 0.0001);
    col += vec3(1.0, 0.93, 0.82) * exp(-zr * zr) * 0.9;
    col *= lit;
    // The dark spreads: around the hole first, then over everything once it has all fallen in
    float near = (1.0 - smoothstep(R, R * 6.0 + 0.001, r)) * 0.5 * smoothstep(0.0, 0.7, t);
    dark = max(shadow, max(near, smoothstep(1.45, 1.9, t)));
    // What is left is a point of light: the singularity the Big Bang starts from
    col += vec3(0.62, 0.46, 1.0) * (0.00005 / (r * r + 0.0002)) * smoothstep(1.8, 2.25, t);
  }
  float alpha = clamp(max(max(col.r, max(col.g, col.b)), dark), 0.0, 1.0);
  o = vec4(min(col, vec3(alpha)), alpha);
}
`

export function Plasma({
  bang,
  origin,
  kind = "bigbang",
}: {
  bang: boolean
  /** Viewport px; defaults to the centre */
  origin?: { x: number; y: number }
  kind?: "bigbang" | "blackhole"
}) {
  const ref = useRef<HTMLDivElement>(null)
  const bangRef = useRef(bang)
  bangRef.current = bang

  useEffect(() => {
    const host = ref.current
    if (!host) return
    // A fresh canvas each run, so its context can be freed on cleanup and a remount (React's
    // StrictMode does one in development) never inherits a lost one
    const canvas = document.createElement("canvas")
    canvas.className = "absolute inset-0 h-full w-full"
    host.appendChild(canvas)
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false })
    if (!gl) return () => canvas.remove()
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertex))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragment))
    gl.linkProgram(prog)
    // With parallel compilation the driver links in the background; until then, frames just skip drawing
    const parallel = gl.getExtension("KHR_parallel_shader_compile")
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    let uRes: WebGLUniformLocation | null = null
    let uOrigin: WebGLUniformLocation | null = null
    let uPre: WebGLUniformLocation | null = null
    let uT: WebGLUniformLocation | null = null
    let linked = false
    let broken = false
    // Once linked: bind the program, its quad and its uniforms
    const setup = () => {
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return (broken = true)
      gl.useProgram(prog)
      const loc = gl.getAttribLocation(prog, "pos")
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
      const u = (n: string) => gl.getUniformLocation(prog, n)
      uRes = u("uRes")
      uOrigin = u("uOrigin")
      uPre = u("uPre")
      uT = u("uT")
      gl.uniform1f(u("uKind"), kind === "blackhole" ? 1 : 0)
      linked = true
      resize()
    }

    // Soft by nature, so a fraction of the screen's pixels is plenty
    const scale = window.matchMedia("(pointer: coarse)").matches ? 0.35 : 0.5
    let w = 0
    let h = 0
    const resize = () => {
      w = Math.max(1, Math.round(window.innerWidth * scale))
      h = Math.max(1, Math.round(window.innerHeight * scale))
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
      if (!linked) return
      gl.uniform2f(uRes, w, h)
      const ox = (origin?.x ?? window.innerWidth / 2) * scale
      const oy = (origin?.y ?? window.innerHeight / 2) * scale
      gl.uniform2f(uOrigin, ox, oy)
    }
    resize()

    const start = performance.now()
    let bangAt = 0
    let raf = 0
    const frame = (now: number) => {
      if (bangRef.current && !bangAt) bangAt = now
      if (!linked) {
        if (!parallel || gl.getProgramParameter(prog, parallel.COMPLETION_STATUS_KHR)) setup()
        if (broken) return
        if (!linked) {
          raf = requestAnimationFrame(frame)
          return
        }
      }
      const t = bangAt ? (now - bangAt) / 1000 : -1
      gl.uniform1f(uPre, (now - start) / 1000)
      gl.uniform1f(uT, t)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      // Once the fog has cleared (or the black hole's overlay has faded) there is nothing left to draw
      if (t < (kind === "blackhole" ? 3.4 : 2)) raf = requestAnimationFrame(frame)
      else gl.clear(gl.COLOR_BUFFER_BIT)
    }
    raf = requestAnimationFrame(frame)
    window.addEventListener("resize", resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.getExtension("WEBGL_lose_context")?.loseContext()
      canvas.remove()
    }
    // Set up once; origin and kind are fixed for its lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0" />
}
