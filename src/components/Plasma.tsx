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
 * Supernova, as telescopes see one: a star flaring with diffraction spikes,
 * then a thin shell of ejecta torn into filaments around a blue inner glow.
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
uniform float uReach;
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
  // Noise follows the direction from the centre (a unit vector), never the angle, which would seam at 180 degrees
  vec2 dir = p / max(r, 0.0001);
  vec3 col = vec3(0.0);

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
    // A supernova really is an explosion, seen the way telescopes see one
    if (uT < 0.0) {
      // The star flickers and contracts as its core gives way
      float g = clamp(uPre / 0.22, 0.0, 1.0);
      col = vec3(0.85, 0.93, 1.0) * exp(-r * r * (1400.0 - 900.0 * g)) * (0.5 + 1.2 * g);
    } else {
      float t = uT;
      // One star outshines everything, flaring with diffraction spikes
      float flare = exp(-t * 2.6);
      float core = 0.0008 / (r * r + 0.0001);
      float spikes = exp(-abs(p.y) * 240.0) * exp(-abs(p.x) * 3.0) + exp(-abs(p.x) * 240.0) * exp(-abs(p.y) * 3.0);
      col = vec3(0.86, 0.93, 1.0) * (core * 0.3 + spikes * 1.4) * flare;
      col += vec3(1.0) * exp(-t * 6.0) * 0.5;
      // The remnant: a thin shell of ejecta racing out, torn into red and orange filaments
      float R = uReach * 1.15 * (1.0 - exp(-t * 1.6));
      float n = fbm(dir * 6.0 + vec2(t * 0.5, 0.0) + p * 3.0);
      float shell = exp(-pow((r - R * (0.9 + 0.2 * n)) / (0.025 + 0.05 * t), 2.0));
      float fil = pow(fbm(dir * 14.0 + p * 6.0 - t), 2.5) * 2.0;
      col += mix(vec3(1.0, 0.45, 0.25), vec3(0.95, 0.28, 0.55), n) * shell * (0.6 + fil) * exp(-t * 0.9);
      // Inside, the blue glow of the newborn pulsar's wind
      float inside = (1.0 - smoothstep(R * 0.4, R * 0.95, r)) * exp(-t * 1.2);
      col += vec3(0.35, 0.55, 1.0) * inside * 0.35 * (0.6 + 0.6 * fbm(p * 5.0 + t));
    }
  }
  float alpha = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
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
  kind?: "bigbang" | "supernova"
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const bangRef = useRef(bang)
  bangRef.current = bang

  useEffect(() => {
    const canvas = ref.current
    const gl = canvas?.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false })
    if (!canvas || !gl) return
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
    let uReach: WebGLUniformLocation | null = null
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
      uReach = u("uReach")
      gl.uniform1f(u("uKind"), kind === "supernova" ? 1 : 0)
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
      // Far enough, in screen heights, to reach the farthest corner
      gl.uniform1f(uReach, Math.hypot(Math.max(ox, w - ox), Math.max(oy, h - oy)) / h)
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
      // Once the fog has cleared (or the remnant faded) there is nothing left to draw
      if (t < (kind === "supernova" ? 3.4 : 2)) raf = requestAnimationFrame(frame)
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
    }
    // The blast is set up once; origin and kind are fixed for its lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />
}
