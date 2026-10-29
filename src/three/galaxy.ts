import * as THREE from "three"
import { createProps } from "./props"

export type Galaxy = {
  /** 0..1 — how far the camera has flown in from deep space */
  arrive: (on: boolean) => void
  setWarp: (amount: number) => void
  /** Skip rendering (the last frame stays on screen), e.g. while another scene owns the screen */
  setPaused: (paused: boolean) => void
  /** Shaders compiled and clouds baked: the first frames won't stall */
  ready: Promise<void>
  dispose: () => void
}

type Options = { reduce: boolean; mobile: boolean; /** The astronaut's suit has arrived (or failed to) */ onSuit?: () => void }

const galaxyVertex = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uWarp;
  uniform float uDim;
  attribute float aScale;
  attribute float aSeed;
  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // Differential rotation: inner stars orbit faster than the arms
    float r = length(world.xz);
    float angle = atan(world.x, world.z) + uTime * (0.9 / (r + 0.8)) * 0.18;
    world.x = sin(angle) * r;
    world.z = cos(angle) * r;
    vec4 view = viewMatrix * world;
    gl_Position = projectionMatrix * view;
    gl_PointSize = uSize * aScale * (1.0 + uWarp * 1.6) / -view.z;
    vColor = color;
    vTwinkle = (0.65 + 0.35 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 40.0)) * uDim;
  }
`

const galaxyFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    float strength = pow(max(0.0, 1.0 - d * 2.0), 2.6);
    gl_FragColor = vec4(vColor * strength * vTwinkle, strength);
  }
`

const starsVertex = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uDim;
  attribute float aSeed;
  varying float vAlpha;
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = uSize * (0.5 + aSeed) * (300.0 / -view.z);
    vAlpha = (0.45 + 0.55 * sin(uTime * (0.6 + aSeed * 2.0) + aSeed * 90.0)) * uDim;
  }
`

const starsFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    float s = pow(max(0.0, 1.0 - d * 2.0), 3.0);
    gl_FragColor = vec4(vec3(0.82, 0.9, 1.0) * s, s * vAlpha);
  }
`

// Space dust in a tunnel around the viewer, DEPTH units long. It drifts toward them as the page scrolls and
// wraps round to the far end, so scrolling reads as flying through space: the near-field parallax
// emotion-agency.com gets from its rocks and grass. Each speck is a line, a dot at rest, a streak in a hurry
const DEPTH = 40
const dustVertex = /* glsl */ `
  uniform float uTravel; // how far the viewer has flown, in units
  uniform float uStreak; // trail length, from how fast they are flying
  attribute float aEnd;  // 0 the speck, 1 the far end of its trail
  varying float vFade;
  void main() {
    vec3 p = position;
    p.z = mod(p.z + uTravel, ${DEPTH}.0) - ${DEPTH}.0 - aEnd * uStreak;
    // Faint far off, brightest close by, gone before it reaches the lens; the trail fades behind it
    vFade = smoothstep(-${DEPTH}.0, -${DEPTH * 0.55}.0, p.z) * (1.0 - smoothstep(-2.5, -0.6, p.z)) * (1.0 - aEnd * 0.85);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`
const dustFragment = /* glsl */ `
  uniform float uOpacity;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(vec3(0.78, 0.86, 1.0), vFade * uOpacity);
  }
`
// Units flown per px scrolled: about half the tunnel per screen
const FLIGHT = 0.022

/** Soft radial blob drawn on a canvas, used for the core glow and nebula clouds */
function cloudTexture(inner: string, outer: string, noise = 0) {
  const size = 256
  const c = document.createElement("canvas")
  c.width = c.height = size
  const ctx = c.getContext("2d")!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, inner)
  g.addColorStop(0.45, outer)
  g.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  if (noise) {
    // Wispy structure: dim random blobs knocked out of the gradient
    ctx.globalCompositeOperation = "destination-out"
    for (let i = 0; i < noise; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = 10 + Math.random() * 40
      const h = ctx.createRadialGradient(x, y, 0, x, y, r)
      h.addColorStop(0, `rgba(0,0,0,${0.25 + Math.random() * 0.35})`)
      h.addColorStop(1, "rgba(0,0,0,0)")
      ctx.fillStyle = h
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function buildGalaxy(count: number) {
  const params = { radius: 6, branches: 4, spin: 1.05, randomness: 0.34, power: 2.8 }
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const scales = new Float32Array(count)
  const seeds = new Float32Array(count)
  const inside = new THREE.Color("#ffd6f5")
  const mid = new THREE.Color("#a78bfa")
  const outside = new THREE.Color("#22d3ee")
  const tmp = new THREE.Color()

  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    const radius = Math.pow(Math.random(), 1.35) * params.radius
    const branch = ((i % params.branches) / params.branches) * Math.PI * 2
    const spin = radius * params.spin
    const rand = () => Math.pow(Math.random(), params.power) * (Math.random() < 0.5 ? 1 : -1) * params.randomness * (radius + 0.4)
    positions[i3] = Math.cos(branch + spin) * radius + rand()
    positions[i3 + 1] = rand() * 0.45
    positions[i3 + 2] = Math.sin(branch + spin) * radius + rand()

    const t = radius / params.radius
    if (t < 0.35) tmp.copy(inside).lerp(mid, t / 0.35)
    else tmp.copy(mid).lerp(outside, (t - 0.35) / 0.65)
    colors[i3] = tmp.r
    colors[i3 + 1] = tmp.g
    colors[i3 + 2] = tmp.b
    scales[i] = 0.4 + Math.random() * 1.1
    seeds[i] = Math.random()
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
  geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1))
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1))
  return geo
}

function buildStars(count: number) {
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const r = 35 + Math.random() * 45
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.cos(phi)
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    seeds[i] = Math.random()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1))
  return geo
}

// Camera path keyed to page scroll: hero → about → skills (top-down) → projects → contact (dive to the core)
// Each look target sits beside the core so the galaxy stays off to one side of the content
const PATH = [
  new THREE.Vector3(0.5, 2.6, 10.5),
  new THREE.Vector3(7.5, 3.2, 7.5),
  new THREE.Vector3(2.5, 12, 4.5),
  new THREE.Vector3(-9, 1.6, 7),
  new THREE.Vector3(-4.5, 4.5, 10),
  new THREE.Vector3(0.6, 2.2, 7.5),
]
const LOOK = [
  new THREE.Vector3(5.2, -1.9, 0),
  new THREE.Vector3(1.5, 0.4, -5.5),
  new THREE.Vector3(-4.5, 0, -1.5),
  new THREE.Vector3(1.5, 1.2, -6),
  new THREE.Vector3(2.5, 1.5, -3),
  new THREE.Vector3(0, -0.2, 0),
]

export function createGalaxy(canvas: HTMLCanvasElement, { reduce, mobile, onSuit }: Options): Galaxy | null {
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75)
  let renderer: THREE.WebGLRenderer
  try {
    // Smooth the astronaut's edges on low-density screens, where it is cheap
    renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 1.5, alpha: true, powerPreference: "high-performance" })
  } catch {
    return null
  }
  renderer.setPixelRatio(dpr)
  renderer.setClearColor(0x000000, 0)
  // Filmic response and soft shadows for the lit props; the shader-drawn galaxy is unaffected
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = !mobile

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200)
  // The props ride on the camera, so it has to be in the scene graph
  scene.add(camera)
  const path = new THREE.CatmullRomCurve3(PATH, false, "centripetal")
  const lookPath = new THREE.CatmullRomCurve3(LOOK, false, "centripetal")

  const galaxyMat = new THREE.ShaderMaterial({
    vertexShader: galaxyVertex,
    fragmentShader: galaxyFragment,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: 26 * dpr }, uWarp: { value: 0 }, uDim: { value: 1 } },
  })
  const galaxy = new THREE.Points(buildGalaxy(mobile ? 28000 : 70000), galaxyMat)
  galaxy.rotation.z = 0.12
  scene.add(galaxy)

  const starsMat = new THREE.ShaderMaterial({
    vertexShader: starsVertex,
    fragmentShader: starsFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: 1.6 * dpr }, uDim: { value: 1 } },
  })
  const stars = new THREE.Points(buildStars(mobile ? 1800 : 4200), starsMat)
  scene.add(stars)

  // Core glow
  const coreMat = new THREE.SpriteMaterial({
    map: cloudTexture("rgba(255,236,250,0.95)", "rgba(196,140,255,0.35)"),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  })
  const core = new THREE.Sprite(coreMat)
  core.scale.set(3.4, 3.4, 1)
  scene.add(core)

  // Nebula clouds drifting around the disc
  const nebulae: THREE.Sprite[] = []
  const tints: [string, string][] = [
    ["rgba(139,92,246,0.55)", "rgba(76,29,149,0.22)"],
    ["rgba(34,211,238,0.45)", "rgba(14,116,144,0.18)"],
    ["rgba(236,72,153,0.4)", "rgba(131,24,67,0.16)"],
    ["rgba(59,130,246,0.45)", "rgba(30,58,138,0.18)"],
  ]
  for (let i = 0; i < (mobile ? 5 : 9); i++) {
    const [a, b] = tints[i % tints.length]
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cloudTexture(a, b, 26),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.55,
        toneMapped: false,
        rotation: Math.random() * Math.PI,
      }),
    )
    const ang = (i / 9) * Math.PI * 2 + Math.random()
    const rad = 2 + Math.random() * 4.5
    s.position.set(Math.cos(ang) * rad, (Math.random() - 0.5) * 1.2, Math.sin(ang) * rad)
    const sc = 4 + Math.random() * 5
    s.scale.set(sc, sc, 1)
    nebulae.push(s)
    scene.add(s)
  }

  // Cyber layer: a faint polar targeting grid and a radar pulse ring under the disc
  const grid = new THREE.PolarGridHelper(9, 12, 8, 96, 0x22d3ee, 0x22d3ee)
  const gridMat = grid.material as THREE.LineBasicMaterial
  gridMat.transparent = true
  gridMat.opacity = 0.07
  gridMat.depthWrite = false
  gridMat.toneMapped = false
  grid.position.y = -0.9
  scene.add(grid)

  const pulseMat = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 128), pulseMat)
  pulse.rotation.x = -Math.PI / 2
  pulse.position.y = -0.88
  scene.add(pulse)

  // The dust rides with the camera, so it is always around the viewer, whichever way the path turns
  const specks = mobile ? 700 : 1600
  const dustAt = new Float32Array(specks * 6)
  const dustEnd = new Float32Array(specks * 2)
  for (let i = 0; i < specks; i++) {
    const x = (Math.random() - 0.5) * 30
    const y = (Math.random() - 0.5) * 18
    const z = -Math.random() * DEPTH
    dustAt.set([x, y, z, x, y, z], i * 6)
    dustEnd.set([0, 1], i * 2)
  }
  const dustGeo = new THREE.BufferGeometry()
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustAt, 3))
  dustGeo.setAttribute("aEnd", new THREE.BufferAttribute(dustEnd, 1))
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { uTravel: { value: 0 }, uStreak: { value: 0.02 }, uOpacity: { value: 0 } },
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const dust = new THREE.LineSegments(dustGeo, dustMat)
  dust.frustumCulled = false
  // A still page (reduced motion) doesn't travel
  dust.visible = !reduce
  camera.add(dust)
  let flown = 0
  let flying = 0
  let rushed = 0

  // A static (reduced-motion) page redraws when the suit lands
  const props = createProps(renderer, scene, camera, { mobile, reduce, invalidate: () => reduce && started && render(performance.now()), onSuit })

  // State
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
  let progress = 0
  let warp = 0
  let warpTarget = 0
  let arriveT = reduce ? 1 : 0
  let arriving = false
  let time = 0
  let last = performance.now()
  let raf = 0
  const camPos = new THREE.Vector3()
  const camLook = new THREE.Vector3()
  const away = new THREE.Vector3(-6, 16, 46)
  // From deep space the galaxy hangs in the upper corner, clear of the intro's star
  const awayLook = new THREE.Vector3(-11, -6, 0)

  const resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h, false)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    camera.aspect = w / h
    // Keep the disc framed on tall phone screens
    camera.fov = w < h ? 72 : 55
    camera.updateProjectionMatrix()
  }

  const scrollProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
  }

  const render = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now

    if (!reduce) {
      warp += (warpTarget - warp) * Math.min(1, dt * 3)
      time += dt * (1 + warp * 7)
      if (arriving && arriveT < 1) arriveT = Math.min(1, arriveT + dt / 2.6)
      // The camera keeps up with the (already smoothed) scroll, as emotion-agency.com's does, rather than easing
      // a second time behind it, so the sky moves with the page
      progress += (scrollProgress() - progress) * Math.min(1, dt * 10)
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3)
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3)
    }

    galaxyMat.uniforms.uTime.value = time
    galaxyMat.uniforms.uWarp.value = warp
    starsMat.uniforms.uTime.value = time
    // The galaxy leads in the hero, then steps back behind the content (the props keep their light)
    const h = window.innerHeight
    const dim = 1 - Math.min(1, Math.max(0, (window.scrollY - h * 0.3) / (h * 0.7))) * 0.5
    galaxyMat.uniforms.uDim.value = dim
    starsMat.uniforms.uDim.value = dim
    coreMat.opacity = dim

    path.getPointAt(progress, camPos)
    lookPath.getPointAt(progress, camLook)
    // Fly in from deep space on arrival, ease-out-quart
    const e = 1 - Math.pow(1 - arriveT, 4)
    camPos.lerpVectors(away, camPos, e)
    camLook.lerpVectors(awayLook, camLook, e)
    camPos.x += pointer.x * 0.55
    camPos.y += pointer.y * 0.35
    camera.position.copy(camPos)
    camera.lookAt(camLook)
    camera.fov += ((window.innerWidth < window.innerHeight ? 72 : 55) + warp * 18 - camera.fov) * 0.1
    camera.updateProjectionMatrix()

    for (let i = 0; i < nebulae.length; i++) {
      nebulae[i].material.rotation += dt * 0.02 * (i % 2 ? 1 : -1)
      nebulae[i].material.opacity = 0.55 * dim
    }
    const cycle = (time * 0.18) % 1
    pulse.scale.setScalar(0.5 + cycle * 8.5)
    pulseMat.opacity = (1 - cycle) * 0.22 * dim
    gridMat.opacity = 0.07 * dim
    stars.rotation.y = time * 0.004

    // The journey: the distance scrolled is the distance flown; a hyperspace jump rushes the dust on too
    const scrolled = progress * Math.max(0, document.documentElement.scrollHeight - h)
    rushed += warp * dt * 60
    const next = scrolled * FLIGHT + rushed
    flying += (Math.abs(next - flown) / Math.max(dt, 1e-3) - flying) * Math.min(1, dt * 6)
    flown = next
    dustMat.uniforms.uTravel.value = flown
    dustMat.uniforms.uStreak.value = 0.02 + Math.min(6, flying * 0.06 + warp * 5)
    dustMat.uniforms.uOpacity.value = (0.25 + 0.65 * Math.min(1, scrolled / (h * 0.6))) * e

    props.update(reduce ? 0 : dt, e)

    renderer.render(scene, camera)
  }

  let paused = false
  const loop = (now: number) => {
    if (paused) last = now
    else render(now)
    raf = requestAnimationFrame(loop)
  }

  const onPointer = (e: PointerEvent) => {
    pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2
    pointer.ty = -(e.clientY / window.innerHeight - 0.5) * 2
  }
  // Nothing renders until every shader has compiled (off the main thread)
  let started = false
  let live = true
  const onVisibility = () => {
    cancelAnimationFrame(raf)
    if (started && !document.hidden && !reduce) {
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
  }
  const onResize = () => {
    resize()
    if (reduce && started) render(performance.now())
  }
  const onScroll = () => reduce && started && ((progress = scrollProgress()), render(performance.now()))

  resize()
  window.addEventListener("resize", onResize)
  window.addEventListener("scroll", onScroll, { passive: true })
  window.addEventListener("pointermove", onPointer, { passive: true })
  document.addEventListener("visibilitychange", onVisibility)
  // Direct3D's shader compiler is slow: compile everything in the background, then start drawing
  const ready = Promise.all([renderer.compileAsync(scene, camera).catch(() => {}), props.ready]).then(() => {
    if (!live) return
    started = true
    if (reduce) render(performance.now())
    else raf = requestAnimationFrame(loop)
  })

  return {
    ready,
    arrive: (on) => {
      arriving = on
      // Leaving (a replayed Big Bang): back out to deep space, ready to fly in again
      if (!on && !reduce) arriveT = 0
      // Drop out of warp as we arrive: the stars streak, then settle
      if (on && !reduce) {
        warp = 1
        warpTarget = 0
      }
    },
    setPaused: (p) => {
      paused = p
    },
    setWarp: (amount) => {
      warpTarget = reduce ? 0 : amount
    },
    dispose: () => {
      live = false
      cancelAnimationFrame(raf)
      props.dispose()
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("pointermove", onPointer)
      document.removeEventListener("visibilitychange", onVisibility)
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
      renderer.dispose()
    },
  }
}
