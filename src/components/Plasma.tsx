import { useEffect, useRef } from "react"

/**
 * The hot gas of an explosion, drawn by one fragment shader at low resolution
 * (plasma is soft, so it costs little): before the blast, matter swirling into
 * the singularity (or a star contracting before it collapses); then a flash, a
 * turbulent fireball that cools like real hot matter (white, yellow, orange,
 * red), a shock front racing ahead of it, and the cooled gas lingering as
 * violet and teal haze. Without WebGL 2 it draws nothing and the particles
 * carry the moment on their own.
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
// Colour of hot matter as it cools: blue-white, white, yellow, orange, deep red, dark
vec3 heat(float k) {
  k = clamp(k, 0.0, 1.25);
  vec3 c = mix(vec3(0.0), vec3(0.42, 0.04, 0.1), smoothstep(0.0, 0.25, k));
  c = mix(c, vec3(1.0, 0.36, 0.08), smoothstep(0.2, 0.5, k));
  c = mix(c, vec3(1.0, 0.8, 0.38), smoothstep(0.45, 0.75, k));
  c = mix(c, vec3(1.0, 0.97, 0.92), smoothstep(0.7, 0.95, k));
  return mix(c, vec3(0.82, 0.9, 1.0), smoothstep(0.95, 1.25, k));
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = (frag - uOrigin) / uRes.y;
  float r = length(p);
  // Noise follows the direction from the centre (a unit vector), never the angle, which would seam at 180 degrees
  vec2 dir = p / max(r, 0.0001);
  vec3 col = vec3(0.0);

  if (uT < 0.0) {
    float g = clamp(uPre / (uKind < 0.5 ? 1.15 : 0.22), 0.0, 1.0);
    if (uKind < 0.5) {
      // Matter spiralling in: a ring of gas tightening around the singularity, heating as it falls
      float s = 4.0 * log(r + 0.001) - uPre * 3.0;
      float spiral = fbm(mat2(cos(s), -sin(s), sin(s), cos(s)) * p * 7.0 + 3.0);
      float ring = exp(-pow((r - 0.04 - 0.3 * (1.0 - g)) * 8.0, 2.0));
      col = heat(0.3 + 0.55 * g) * ring * spiral * spiral * 1.6 * g;
      col += vec3(0.75, 0.9, 1.0) * (0.00012 / (r * r + 0.0004)) * g;
    } else {
      // A star contracting and brightening before it collapses
      col = vec3(0.85, 0.93, 1.0) * exp(-r * r * (1400.0 - 900.0 * g)) * (0.5 + 1.2 * g);
    }
  } else {
    float t = uT;
    float sn = step(0.5, uKind);
    // Fireball: grows fast then slows, with a turbulent edge
    float R = uReach * (1.0 - exp(-t * 1.9));
    float n = fbm(dir * 2.5 + vec2(7.0, r * 3.0 - t * 1.5) + p * 4.0);
    float edge = R * (0.82 + 0.36 * n) + 0.001;
    float body = 1.0 - smoothstep(edge * 0.55, edge, r);
    float rim = exp(-pow((r - edge * 0.92) / (0.05 + 0.12 * t), 2.0));
    float temp = 1.2 * exp(-t * 1.25) * (1.0 - 0.45 * r / edge);
    float turb = 0.55 + 0.8 * fbm(p * 5.0 - vec2(t * 0.7, t * 0.4));
    col = heat(temp) * (body * 0.75 + rim * 0.9) * turb;
    // Supernova: filaments of debris shot out through the shell
    float rays = pow(fbm(dir * 9.0 + vec2(0.0, r * 1.5 - t * 2.0)), 3.0) * 2.4;
    col += heat(temp * 0.9 + 0.2) * rays * body * sn;
    // Shock front racing ahead of the fireball
    float S = uReach * 1.4 * (1.0 - exp(-t * 2.6));
    col += vec3(0.85, 0.94, 1.0) * exp(-pow((r - S) * 34.0, 2.0)) * exp(-t * 1.3) * 1.6;
    // The cooled cloud lingers as violet and teal gas
    float haze = fbm(p * 2.2 + vec2(t * 0.15, 0.0)) * smoothstep(0.4, 1.4, t) * exp(-max(t - 1.4, 0.0) * 1.1);
    col += mix(vec3(0.42, 0.25, 0.85), vec3(0.15, 0.75, 0.85), fbm(p * 3.0 + 9.0)) * haze * 0.55 * (1.0 - 0.5 * smoothstep(0.0, edge * 1.1, r));
    // The first instant overexposes everything
    col += vec3(1.0, 0.98, 0.95) * exp(-t * 6.5) * (0.5 + 0.6 / (r * 6.0 + 0.4));
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
      // Past the afterglow there is nothing left to draw
      if (t < 3.4) raf = requestAnimationFrame(frame)
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
