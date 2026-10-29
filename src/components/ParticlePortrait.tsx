import { useEffect, useRef } from "react"
import { useReducedMotion } from "motion/react"
import * as THREE from "three"

const FLIGHT = 1.5 // seconds each chunk takes to reach its spot
const SETTLE = FLIGHT + 0.85 // all chunks have landed
const SCAN_EVERY = 6.5 // seconds between security sweeps
const REPEL = 95 // pointer influence radius in px

const vertex = /* glsl */ `
attribute vec3 aTarget; // its place in the sculpture (px from its centre; z toward the viewer)
attribute vec3 aStart;  // where it flies in from
attribute vec4 aSeed;   // delay, tumble speed, phase, size
attribute vec2 aTone;   // brightness in the photo, mineral cast (0 none, 1 violet, 2 rust)
uniform float uTime;
uniform vec3 uPointer;  // xy in the sculpture's px, z the reach
uniform float uScatter;
uniform float uScan;
varying vec3 vNormal;
varying vec2 vTone;
varying float vScan;

mat3 turn(vec3 k, float a) {
  float c = cos(a);
  float s = sin(a);
  vec3 t = k * (1.0 - c);
  return mat3(t.x * k.x + c, t.y * k.x + s * k.z, t.z * k.x - s * k.y,
              t.x * k.y - s * k.z, t.y * k.y + c, t.z * k.y + s * k.x,
              t.x * k.z + s * k.y, t.y * k.z - s * k.x, t.z * k.z + c);
}
float ease(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }

void main() {
  float landed = clamp((uTime - aSeed.x) / ${FLIGHT.toFixed(2)}, 0.0, 1.0);
  vec3 p = mix(aStart, aTarget, ease(landed));
  // Once landed, chunks near the pointer are shoved aside and toward the viewer, then settle back
  vec2 d = p.xy - uPointer.xy;
  float near = (1.0 - smoothstep(0.0, uPointer.z, length(d))) * step(1.0, landed);
  p += vec3(d / (length(d) + 0.001) * 26.0, 34.0) * near;
  // They drift apart as the hero scrolls away
  p += normalize(aTarget + vec3(0.0, 0.0, 1.0)) * uScatter * (0.4 + fract(aSeed.z * 13.37));
  // Each chunk tumbles slowly on its own axis
  vec3 axis = normalize(vec3(sin(aSeed.z * 7.1), cos(aSeed.z * 3.3), sin(aSeed.z * 5.7) + 0.3));
  mat3 r = turn(axis, aSeed.z + uTime * aSeed.y);
  vNormal = normalize(normalMatrix * (r * normal));
  vTone = aTone;
  vScan = 1.0 - smoothstep(0.0, 16.0, abs(aTarget.y - uScan));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p + r * position * aSeed.w * (0.35 + 0.65 * landed), 1.0);
}
`

const fragment = /* glsl */ `
varying vec3 vNormal;
varying vec2 vTone;
varying float vScan;
void main() {
  vec3 n = normalize(vNormal);
  // Rock lit from the upper left, with a cool rim on the facets turned away
  float key = max(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0);
  float rim = pow(1.0 - max(n.z, 0.0), 2.5);
  // Stone by the photo's brightness, contrast kept so the face reads: dark slate to pale stone,
  // a few chunks with a violet or rusty mineral cast
  float l = pow(vTone.x, 1.5);
  vec3 base = mix(vec3(0.1, 0.12, 0.2), vec3(0.86, 0.88, 0.94), l);
  base *= vTone.y > 1.5 ? vec3(1.12, 0.86, 0.66) : mix(vec3(1.0), vec3(0.95, 0.78, 1.18), vTone.y);
  vec3 c = base * (0.25 + 0.95 * key) + vec3(0.45, 0.6, 1.0) * rim * 0.2 * (0.3 + l);
  // The security sweep
  c = mix(c, vec3(0.4, 0.91, 0.98), vScan * 0.8);
  gl_FragColor = vec4(c, 1.0);
}
`

/**
 * The portrait as a sculpture of asteroids: thousands of small faceted rocks,
 * sampled from the photo (brighter areas lighter, and nearer on a gentle dome,
 * so the face has depth). They fly in and assemble behind the title, tumble
 * slowly, turn with the pointer as one piece, get shoved aside where it passes,
 * take a periodic scan sweep, and drift apart as the hero scrolls away. The
 * source is a cut-out with a transparent background; only the person becomes rock.
 */
export function ParticlePortrait({ src, active, instant = false }: { src: string; active: boolean; instant?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!active) return
    const canvas = ref.current
    if (!canvas) return
    const coarse = window.matchMedia("(pointer: coarse)").matches
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !coarse, powerPreference: "high-performance" })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2))
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 8000)
    const uniforms = {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector3(1e5, 1e5, REPEL) },
      uScatter: { value: 0 },
      uScan: { value: 1e5 },
    }
    const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms })

    // One rock, roughened: the same corner always moves the same way, so its faces stay joined
    const rock = coarse ? new THREE.OctahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 0)
    const corners = rock.attributes.position
    for (let i = 0; i < corners.count; i++) {
      const x = corners.getX(i)
      const y = corners.getY(i)
      const z = corners.getZ(i)
      const k = 0.72 + 0.56 * ((Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719)) * 43758.5453) % 1)
      corners.setXYZ(i, x * k, y * k * 0.82, z * k)
    }
    rock.computeVertexNormals()
    let mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial> | null = null

    const img = new Image()
    img.src = src
    let w = 0
    let h = 0
    let top = 0
    let drawH = 0
    let raf = 0
    let start = 0
    let ready = false
    let running = false
    let onScreen = true
    let disposed = false
    const pointer = { x: 1e5, y: 1e5, nx: 0, ny: 0 }
    const smoothPointer = new THREE.Vector2(1e5, 1e5)
    const tilt = new THREE.Vector2()

    const build = () => {
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      // One unit is one px where the sculpture stands
      camera.position.set(0, 0, h / 2 / Math.tan(THREE.MathUtils.degToRad(15)))
      camera.far = camera.position.z * 4
      camera.updateProjectionMatrix()

      // Large and right of centre on desktop, the title crossing the collar; centred above it on phones
      const wide = w >= 1024
      drawH = h * (wide ? 0.86 : 0.58)
      let drawW = drawH * (img.width / img.height)
      if (drawW > w * 0.92) {
        drawW = w * 0.92
        drawH = drawW / (img.width / img.height)
      }
      const cx = w * (wide ? 0.62 : 0.5)
      top = h * (wide ? 0.04 : 0.08)
      const cy = top + drawH / 2
      const gap = Math.max(3.5, drawH / (wide ? 140 : 110))
      const cols = Math.round(drawW / gap)
      const rows = Math.round(drawH / gap)

      const off = document.createElement("canvas")
      off.width = cols
      off.height = rows
      const octx = off.getContext("2d", { willReadFrequently: true })
      if (!octx) return
      octx.drawImage(img, 0, 0, cols, rows)
      const data = octx.getImageData(0, 0, cols, rows).data

      const targets: number[] = []
      const starts: number[] = []
      const seeds: number[] = []
      const tones: number[] = []
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
          const i = (row * cols + col) * 4
          const a = data[i + 3] / 255
          if (a < 0.08) continue
          const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
          const lift = Math.min(1, Math.pow(lum, 0.75) * 1.25) * a
          if (lift < 0.05) continue
          const x = (col + 0.5) * (drawW / cols) - drawW / 2
          const y = drawH / 2 - (row + 0.5) * (drawH / rows)
          // A gentle dome, the brighter parts a little nearer, so the face has depth when it turns
          const dome = Math.sqrt(Math.max(0, 1 - (x / (drawW * 0.55)) ** 2 - (y / (drawH * 0.55)) ** 2))
          targets.push(x, y, (dome * 0.8 + lift * 0.35 - 0.4) * drawH * 0.2 + (Math.random() - 0.5) * gap * 2)
          starts.push((Math.random() - 0.5) * w * 1.6, (Math.random() - 0.5) * h * 1.6, (Math.random() - 0.5) * h)
          seeds.push(Math.random() * 0.55 + (row / rows) * 0.25, 0.3 + Math.random() * 1.2, Math.random() * 6.283, gap * (0.28 + 0.48 * lift))
          const mineral = Math.random()
          tones.push(lift, mineral < 0.03 ? 1 : mineral < 0.06 ? 2 : 0)
        }

      const geo = new THREE.InstancedBufferGeometry().copy(rock as unknown as THREE.InstancedBufferGeometry)
      geo.setAttribute("aTarget", new THREE.InstancedBufferAttribute(new Float32Array(targets), 3))
      geo.setAttribute("aStart", new THREE.InstancedBufferAttribute(new Float32Array(starts), 3))
      geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(seeds), 4))
      geo.setAttribute("aTone", new THREE.InstancedBufferAttribute(new Float32Array(tones), 2))
      geo.instanceCount = tones.length / 2
      if (mesh) {
        mesh.geometry.dispose()
        mesh.geometry = geo
      } else {
        mesh = new THREE.Mesh(geo, material)
        // The rocks are placed in the shader, so the base shape's bounds say nothing about where they are
        mesh.frustumCulled = false
        scene.add(mesh)
      }
      mesh.position.set(cx - w / 2, h / 2 - cy, 0)
    }

    const render = (t: number, still: boolean) => {
      if (!mesh) return
      const scroll = still ? 0 : Math.min(1, Math.max(0, window.scrollY / h))
      canvas.style.opacity = String(1 - THREE.MathUtils.smoothstep(scroll, 0.55, 0.95))
      uniforms.uTime.value = still ? SETTLE + 10 : t
      uniforms.uScatter.value = scroll * scroll * 340
      // The pointer, in the sculpture's own px, eased so the shove glides
      smoothPointer.lerp(new THREE.Vector2(pointer.x - w / 2 - mesh.position.x, h / 2 - pointer.y - mesh.position.y), 0.2)
      uniforms.uPointer.value.set(smoothPointer.x, smoothPointer.y, REPEL)
      // The whole sculpture turns toward the pointer, and sways a little on its own
      tilt.lerp(new THREE.Vector2(pointer.ny * 0.18, pointer.nx * 0.32), still ? 1 : 0.05)
      mesh.rotation.set(-tilt.x + (still ? 0 : Math.sin(t * 0.5) * 0.03), tilt.y + (still ? 0 : Math.sin(t * 0.37) * 0.08), 0)
      // Periodic security sweep down the assembled portrait
      const cycle = !still && t > SETTLE ? ((t - SETTLE) % SCAN_EVERY) / 1.6 : 2
      uniforms.uScan.value = cycle <= 1 ? drawH / 2 - drawH * cycle : 1e5
      renderer.render(scene, camera)
    }

    const loop = (now: number) => {
      render((now - start) / 1000, false)
      raf = requestAnimationFrame(loop)
    }
    const play = () => {
      if (reduce || !ready || running || document.hidden || !onScreen) return
      running = true
      raf = requestAnimationFrame(loop)
    }
    const pause = () => {
      running = false
      cancelAnimationFrame(raf)
    }

    const onResize = () => {
      build()
      if (reduce) render(0, true)
    }
    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = e.clientX - rect.left
      pointer.y = e.clientY - rect.top
      pointer.nx = (e.clientX / window.innerWidth) * 2 - 1
      pointer.ny = (e.clientY / window.innerHeight) * 2 - 1
    }
    const onLeave = () => {
      pointer.x = 1e5
      pointer.y = 1e5
      pointer.nx = 0
      pointer.ny = 0
    }
    const onVisibility = () => (document.hidden ? pause() : play())
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (onScreen) play()
      else pause()
    })

    img.onload = () => {
      build()
      // Compiled in the background, so the hand-over from the intro never stutters on it
      renderer
        .compileAsync(scene, camera)
        .catch(() => {})
        .then(() => {
          if (disposed) return
          ready = true
          start = performance.now() - (instant ? SETTLE * 1000 : 0)
          // Reduced motion: a still sculpture, no fly-in, tumble, sweep or scatter
          if (reduce) render(0, true)
          else play()
          io.observe(canvas)
        })
    }

    window.addEventListener("resize", onResize)
    window.addEventListener("pointermove", onPointer, { passive: true })
    document.addEventListener("pointerleave", onLeave)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      disposed = true
      pause()
      io.disconnect()
      window.removeEventListener("resize", onResize)
      window.removeEventListener("pointermove", onPointer)
      document.removeEventListener("pointerleave", onLeave)
      document.removeEventListener("visibilitychange", onVisibility)
      // Clear the last frame, so a replayed intro starts from an empty sky
      renderer.clear()
      mesh?.geometry.dispose()
      rock.dispose()
      material.dispose()
      renderer.dispose()
    }
  }, [active, src, reduce, instant])

  // In front of the intro film, which plays on behind the page as it arrives
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-[32] h-full w-full" />
}
