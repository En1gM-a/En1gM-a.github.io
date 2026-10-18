import * as THREE from "three"
import { createAstronaut } from "./astronaut"
import { spaceEnvironment } from "./env"
import { galaxyBus } from "./bus"
import { bakeNebulae, nebulaMaterial, quadVertex } from "./nebula"

/**
 * Life in the backdrop, drawn into the galaxy's scene: an astronaut in NASA's
 * EVA suit you can grab and throw, Hubble-palette gas clouds, stars with
 * diffraction spikes, tumbling asteroids, a satellite, shooting stars and
 * near-field dust. Everything rides in a rig attached to the camera, so each
 * piece keeps to the open side of the layout while the galaxy turns behind it.
 */
export type Props = {
  /** The gas clouds are baked */
  ready: Promise<void>
  /** arrive: 0..1 eased fly-in of the camera; the props come in with it */
  update: (dt: number, arrive: number) => void
  dispose: () => void
}

type Opts = { mobile: boolean; reduce: boolean; invalidate?: () => void; onSuit?: () => void }

// Astronaut placement per section: [x, y] as fractions of the half-viewport, depth in scene units
type Anchor = [number, number, number]
const WIDE: Anchor[] = [
  [0.84, 0.3, 16], // hero: right of the portrait
  [0.72, 0.3, 12], // about: the open right side
  [0.76, 0.45, 13.5], // skills: above the orbits
  [1.6, 0.3, 13.5], // projects: floats off before the voyage, which has its own astronaut
  [0.68, 0.45, 12], // contact: beside the heading
]
// On phones the text fills the width, so the astronaut keeps to the hero, then floats off to the right
const TALL: Anchor[] = [
  [0.6, 0.76, 22],
  [1.5, 0.6, 15],
  [1.5, 0.66, 15],
  [1.5, 0.6, 15],
  [1.5, 0.6, 15],
]
const SECTIONS = ["about", "skills", "projects", "contact"]
const INTERACTIVE = "a,button,input,textarea,select,label,[role='button']"

// Bright stars with Hubble-style diffraction spikes
const spikeVertex = /* glsl */ `
  uniform float uTime;
  uniform float uScroll;
  uniform float uViewH;
  uniform float uTan;
  uniform float uAspect;
  uniform float uPx;
  uniform float uFade;
  attribute vec3 aBase;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = 60.0;
    float halfH = uTan * d;
    float fy = fract(aBase.y + uScroll * 0.1 / uViewH);
    vec3 p = vec3(aBase.x * halfH * uAspect, (fy * 2.0 - 1.0) * halfH * 1.05, -d);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uPx * aBase.z;
    vColor = aColor;
    vAlpha = uFade * (0.8 + 0.2 * sin(uTime * (0.8 + aBase.z) + aBase.x * 40.0));
  }
`

const spikeFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p);
    float core = exp(-r * r * 220.0);
    float halo = exp(-r * r * 28.0) * 0.22;
    float spikes = (exp(-abs(p.x) * 70.0) * exp(-abs(p.y) * 5.5) + exp(-abs(p.y) * 70.0) * exp(-abs(p.x) * 5.5)) * 0.75;
    float a = (core + halo + spikes) * (1.0 - smoothstep(0.32, 0.5, r));
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.8), a * vAlpha);
  }
`

const dustVertex = /* glsl */ `
  uniform float uTime;
  uniform float uScroll;
  uniform float uViewH;
  uniform float uTan;
  uniform float uAspect;
  uniform float uSize;
  uniform float uFade;
  attribute vec3 aBase;
  attribute float aSeed;
  varying float vAlpha;
  void main() {
    float d = aBase.z;
    float halfH = uTan * d;
    // Nearer motes slide past faster as the page scrolls
    float rate = 1.2 / d;
    float fy = fract(aBase.y + uScroll * rate / uViewH + uTime * 0.01 * rate);
    vec3 p = vec3(aBase.x * halfH * uAspect * 1.05 + sin(uTime * 0.13 + aSeed * 30.0) * 0.04 * d, (fy * 2.0 - 1.0) * halfH * 1.1, -d);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (0.6 + aSeed) * (6.0 / d);
    vAlpha = (0.2 + 0.45 * aSeed) * uFade * (0.6 + 0.4 * sin(uTime * (0.5 + aSeed) + aSeed * 50.0));
  }
`

const dustFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    float s = pow(max(0.0, 1.0 - d * 2.0), 2.0);
    gl_FragColor = vec4(vec3(0.75, 0.92, 1.0), s * vAlpha);
  }
`

const streakFragment = /* glsl */ `
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    float head = pow(vUv.x, 3.0);
    float across = pow(max(0.0, 1.0 - abs(vUv.y - 0.5) * 2.0), 2.0);
    float a = head * across * uAlpha;
    gl_FragColor = vec4(mix(vec3(0.55, 0.85, 1.0), vec3(1.0), head), a);
  }
`

const rgb = (hex: number) => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255)
const smooth = (k: number) => k * k * (3 - 2 * k)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

function solarPanelTexture() {
  const c = document.createElement("canvas")
  c.width = 256
  c.height = 96
  const x = c.getContext("2d")!
  x.fillStyle = "#0a1a46"
  x.fillRect(0, 0, 256, 96)
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 6; j++) {
      const g = x.createLinearGradient(i * 16, j * 16, i * 16 + 16, j * 16 + 16)
      g.addColorStop(0, "#1e3a8a")
      g.addColorStop(1, "#2f5bd3")
      x.fillStyle = g
      x.fillRect(i * 16 + 1, j * 16 + 1, 14, 14)
    }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** A lumpy rock: a sphere pushed in and out by a few random waves (a function of position, so no cracks) */
function asteroidGeometry() {
  const geo = new THREE.IcosahedronGeometry(1, 3)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const waves = Array.from({ length: 5 }, () => ({
    dir: new THREE.Vector3().randomDirection(),
    f: 1.5 + Math.random() * 4,
    ph: Math.random() * 6.28,
    amp: 0.05 + Math.random() * 0.12,
  }))
  const v = new THREE.Vector3()
  const stretch = new THREE.Vector3(1, 0.72 + Math.random() * 0.2, 0.82 + Math.random() * 0.15)
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize()
    let r = 1
    for (const w of waves) r += Math.sin(v.dot(w.dir) * w.f + w.ph) * w.amp
    v.multiplyScalar(r).multiply(stretch)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}

function createSatellite() {
  const sat = new THREE.Group()
  const foil = new THREE.MeshStandardMaterial({ color: 0xd2a24c, metalness: 0.9, roughness: 0.32, envMapIntensity: 1.2 })
  const white = new THREE.MeshStandardMaterial({ color: 0xdfe4ee, roughness: 0.5, metalness: 0.2, envMapIntensity: 0.6 })
  const panel = new THREE.MeshStandardMaterial({ map: solarPanelTexture(), metalness: 0.6, roughness: 0.28, envMapIntensity: 1.1 })
  sat.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.9), foil))
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), white)
    strut.rotation.z = Math.PI / 2
    strut.position.x = side * 0.52
    sat.add(strut)
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.035, 0.66), panel)
    wing.position.x = side * 1.65
    sat.add(wing)
  }
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ee, roughness: 0.5, metalness: 0.2, envMapIntensity: 0.6, side: THREE.DoubleSide })
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), dishMat)
  dish.rotation.x = -Math.PI / 2
  dish.position.z = 0.82
  sat.add(dish)
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 6), white)
  feed.rotation.x = Math.PI / 2
  feed.position.z = 0.7
  sat.add(feed)
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf43f5e, toneMapped: false }))
  light.position.set(0, 0.36, -0.3)
  sat.add(light)
  return { sat, light }
}

export function createProps(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  { mobile, reduce, invalidate, onSuit }: Opts,
): Props {
  const env = spaceEnvironment(renderer)
  scene.environment = env
  const rig = new THREE.Group()
  camera.add(rig)

  // Lights ride with the camera: a white sun, a teal rim from the gas, warm bounce from the dust
  const hemi = new THREE.HemisphereLight(0x6fa8c8, 0x3a2414, 0.45)
  const key = new THREE.DirectionalLight(0xfff3e6, 3.2)
  const KEY_DIR = new THREE.Vector3(-5, 6, 4).normalize()
  key.target.position.set(0, 0, -10)
  key.position.copy(KEY_DIR).multiplyScalar(10).add(key.target.position)
  const rim = new THREE.DirectionalLight(0x4fd1c5, 2.8)
  rim.position.set(6, 1, -12)
  rim.target.position.set(0, 0, -8)
  const shadows = !mobile
  if (shadows) {
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    const sc = key.shadow.camera
    sc.left = -1.8
    sc.right = 1.8
    sc.top = 1.8
    sc.bottom = -1.8
    sc.near = 1
    sc.far = 25
    key.shadow.bias = -0.0005
    key.shadow.normalBias = 0.02
  }
  camera.add(hemi, key, key.target, rim, rim.target)

  // Gas clouds: baked once, then billowing slowly; they slide up the screen at a crawl as the page scrolls
  // Kept to the edges and corners, clear of the text columns and the portrait
  const cloudSpecs: { x: number; y: number; size: number; tint: number; alpha: number }[] = mobile
    ? [
        { x: 1.1, y: -0.42, size: 1.0, tint: 0, alpha: 0.6 }, // hero, top-right corner
        { x: -1.15, y: 0.62, size: 0.9, tint: 1, alpha: 0.45 }, // hero, bottom-left corner
        { x: 1.05, y: 1.0, size: 1.0, tint: 2, alpha: 0.55 },
        { x: 1.05, y: 1.85, size: 1.05, tint: 1, alpha: 0.6 },
      ]
    : [
        { x: 1.0, y: -0.28, size: 1.35, tint: 0, alpha: 0.9 }, // hero, top right, behind the astronaut
        { x: -1.08, y: 0.6, size: 1.05, tint: 1, alpha: 0.6 }, // hero, bottom-left corner
        { x: 0.92, y: 0.98, size: 1.25, tint: 2, alpha: 0.8 }, // about and skills, right
        { x: -1.1, y: 0.75, size: 1.0, tint: 0, alpha: 0.45 }, // about, left edge below the text
        { x: 0.95, y: 1.85, size: 1.35, tint: 1, alpha: 0.85 }, // contact, right
        { x: -0.98, y: 2.3, size: 1.15, tint: 2, alpha: 0.6 }, // contact, bottom left
      ]
  let baked: THREE.WebGLRenderTarget[] = []
  const ready = bakeNebulae(
    renderer,
    [
      [0x1f7f8a, 0xe39445, 0x6e3218, 0xffd7a0], // pillars: teal gas, amber and rust dust
      [0x3157c8, 0xe0609e, 0x5b2a6e, 0xffe2f2], // cluster: blue gas, pink and violet dust
      [0x22a3b6, 0xf2b24c, 0x5a2b12, 0xfff0c8], // gold: cyan gas, gold dust
    ],
    mobile ? 512 : 768,
  ).then((targets) => {
    baked = targets
    for (const c of clouds) c.mat.uniforms.uMap.value = targets[c.tint].texture
  })
    // Clouds are decoration: if the bake fails, the galaxy still starts
    .catch(() => {})
  const CLOUD_DEPTH = 70
  const clouds = cloudSpecs.map((s) => {
    const mat = nebulaMaterial()
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    m.position.z = -CLOUD_DEPTH
    m.renderOrder = -1
    rig.add(m)
    return { m, mat, ...s }
  })

  // Bright stars with diffraction spikes, mostly toward the edges
  const SPIKES = mobile ? 28 : 60
  const spikeBase = new Float32Array(SPIKES * 3)
  const spikeColor = new Float32Array(SPIKES * 3)
  const tints = [0xcfe6ff, 0xcfe6ff, 0xffffff, 0xffc58a, 0xff8a6a]
  for (let i = 0; i < SPIKES; i++) {
    const edge = Math.random() < 0.7
    spikeBase[i * 3] = edge ? (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 0.45) : Math.random() * 2 - 1
    spikeBase[i * 3 + 1] = Math.random()
    spikeBase[i * 3 + 2] = 0.35 + Math.pow(Math.random(), 2.2) * 0.95
    const c = rgb(tints[Math.floor(Math.random() * tints.length)])
    spikeColor.set([c.x, c.y, c.z], i * 3)
  }
  const spikeGeo = new THREE.BufferGeometry()
  spikeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPIKES * 3), 3))
  spikeGeo.setAttribute("aBase", new THREE.BufferAttribute(spikeBase, 3))
  spikeGeo.setAttribute("aColor", new THREE.BufferAttribute(spikeColor, 3))
  const dpr = renderer.getPixelRatio()
  const spikeMat = new THREE.ShaderMaterial({
    vertexShader: spikeVertex,
    fragmentShader: spikeFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uViewH: { value: window.innerHeight },
      uTan: { value: 0.5 },
      uAspect: { value: 1 },
      uPx: { value: 34 * dpr },
      uFade: { value: 0 },
    },
  })
  const spikeStars = new THREE.Points(spikeGeo, spikeMat)
  spikeStars.frustumCulled = false
  rig.add(spikeStars)

  // Asteroids along the edges, tumbling, with scroll parallax by depth
  const rockGeos = [asteroidGeometry(), asteroidGeometry(), asteroidGeometry()]
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3641, roughness: 1, metalness: 0.05, flatShading: true, envMapIntensity: 0.2, transparent: true })
  const rockSpecs = [
    { x: 0.93, y: 0.15, d: 9, s: 0.3 },
    { x: 0.66, y: 0.55, d: 16, s: 0.42 },
    { x: 0.82, y: 0.8, d: 22, s: 0.6 },
    { x: 0.97, y: 0.68, d: 7, s: 0.16 },
    { x: 0.55, y: 0.02, d: 26, s: 0.5 },
  ].slice(0, mobile ? 3 : 5)
  const rocks = rockSpecs.map((r, i) => {
    const m = new THREE.Mesh(rockGeos[i % 3], rockMat.clone())
    m.scale.setScalar(r.s)
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
    rig.add(m)
    return { m, ...r, spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5) }
  })

  const { sat, light: satLight } = createSatellite()
  rig.add(sat)

  // Near-field dust
  const DUST = mobile ? 110 : 240
  const dustGeo = new THREE.BufferGeometry()
  const base = new Float32Array(DUST * 3)
  const seeds = new Float32Array(DUST)
  for (let i = 0; i < DUST; i++) {
    base[i * 3] = Math.random() * 2 - 1
    base[i * 3 + 1] = Math.random()
    base[i * 3 + 2] = 2.5 + Math.random() * 9
    seeds[i] = Math.random()
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(DUST * 3), 3))
  dustGeo.setAttribute("aBase", new THREE.BufferAttribute(base, 3))
  dustGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1))
  const dustMat = new THREE.ShaderMaterial({
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uViewH: { value: window.innerHeight },
      uTan: { value: 0.5 },
      uAspect: { value: 1 },
      uSize: { value: 2.2 * dpr },
      uFade: { value: 0 },
    },
  })
  const dust = new THREE.Points(dustGeo, dustMat)
  dust.frustumCulled = false
  rig.add(dust)

  // Shooting stars: a small pool, fired every few seconds
  const streaks = Array.from({ length: 2 }, () => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: streakFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uAlpha: { value: 0 } },
    })
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    m.visible = false
    rig.add(m)
    return { m, mat, t: -1, dur: 1, x: 0, y: 0, dx: 1, dy: 0, len: 1 }
  })
  let nextStreak = 2.5

  const astro = createAstronaut({
    shadows,
    warm: (suit) => renderer.compileAsync(suit, camera, scene),
    onReady: () => {
      invalidate?.()
      onSuit?.()
    },
  })
  rig.add(astro.root)

  // Section stops: the scroll position at which each anchor applies
  let stops = [0, 1, 2, 3, 4]
  const measure = () => {
    const h = window.innerHeight
    let prev = 0
    stops = [
      0,
      ...SECTIONS.map((id) => {
        const el = document.getElementById(id)
        prev = Math.max(prev + 1, el ? el.getBoundingClientRect().top + window.scrollY - h * 0.4 : prev + h)
        return prev
      }),
    ]
  }
  measure()
  let remeasure = 0

  // Input. Mouse: grab him, drag, throw. Touch: tap to poke him spinning (dragging would fight the page scroll)
  const pointer = { x: -1, y: -1 }
  const look = { x: 0, y: 0 }
  const screen = new THREE.Vector3()
  const astroPx = { x: -999, y: -999, r: 0 }
  const hist: { x: number; y: number; t: number }[] = []
  let grab: { dx: number; dy: number; t: number; x: number; y: number } | null = null
  let tap: { t: number; x: number; y: number } | null = null
  let grabbable = false
  let unit = 0.01
  let view = { halfW: 1, halfH: 1 }
  let cursor = ""
  const off = new THREE.Vector2()
  const vel = new THREE.Vector2()
  let spin = 0
  let spinVel = 0
  let pitch = 0
  let pitchVel = 0
  const hit = (x: number, y: number) => grabbable && Math.hypot(x - astroPx.x, y - astroPx.y) < astroPx.r
  const onControl = (t: EventTarget | null) => !!(t as Element | null)?.closest?.(INTERACTIVE)
  const setCursor = (c: string) => {
    if (c === cursor) return
    cursor = c
    document.documentElement.style.cursor = c
  }
  const toView = (x: number, y: number) => ({
    x: ((x / window.innerWidth) * 2 - 1) * view.halfW,
    y: -((y / window.innerHeight) * 2 - 1) * view.halfH,
  })

  const onMove = (e: PointerEvent) => {
    pointer.x = e.clientX
    pointer.y = e.clientY
    if (grab) {
      hist.push({ x: e.clientX, y: e.clientY, t: performance.now() })
      if (hist.length > 8) hist.shift()
      return
    }
    if (e.pointerType === "mouse") setCursor(hit(e.clientX, e.clientY) && !onControl(e.target) ? "grab" : "")
  }
  const onDown = (e: PointerEvent) => {
    if (!hit(e.clientX, e.clientY) || onControl(e.target)) return
    if (e.pointerType === "touch") {
      tap = { t: performance.now(), x: e.clientX, y: e.clientY }
      return
    }
    const p = toView(e.clientX, e.clientY)
    grab = { dx: astro.root.position.x - p.x, dy: astro.root.position.y - p.y, t: performance.now(), x: e.clientX, y: e.clientY }
    hist.length = 0
    hist.push({ x: e.clientX, y: e.clientY, t: grab.t })
    document.body.style.userSelect = "none"
    setCursor("grabbing")
  }
  const onUp = (e: PointerEvent) => {
    const now = performance.now()
    if (tap) {
      if (now - tap.t < 350 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 12) {
        // A poke: off he spins in a random direction, then the tether reels him in
        const a = Math.random() * Math.PI * 2
        vel.x += Math.cos(a) * 160 * unit
        vel.y += Math.sin(a) * 160 * unit
        spinVel += (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2)
        astro.twirl()
      }
      tap = null
    }
    if (!grab) return
    const quick = now - grab.t < 250 && Math.hypot(e.clientX - grab.x, e.clientY - grab.y) < 8
    if (quick) astro.twirl()
    else {
      // Throw: carry the cursor's last ~100 ms of motion
      const recent = hist.filter((h) => now - h.t < 100)
      if (recent.length >= 2) {
        const a = recent[0]
        const b = recent[recent.length - 1]
        const s = Math.max(0.016, (b.t - a.t) / 1000)
        const vx = THREE.MathUtils.clamp((b.x - a.x) / s, -3000, 3000)
        const vy = THREE.MathUtils.clamp((b.y - a.y) / s, -3000, 3000)
        vel.set(vx * unit * 0.9, -vy * unit * 0.9)
        spinVel += -vel.x * 0.18
        pitchVel += -vel.y * 0.1
      }
    }
    grab = null
    document.body.style.userSelect = ""
    setCursor(hit(e.clientX, e.clientY) ? "grab" : "")
  }
  if (!reduce) {
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerdown", onDown, { passive: true })
    window.addEventListener("pointerup", onUp, { passive: true })
    window.addEventListener("pointercancel", onUp, { passive: true })
  }
  window.addEventListener("resize", measure)

  let time = 0
  let lastScroll = window.scrollY
  let scrollVel = 0
  const pos = new THREE.Vector3()
  let placed = false
  let loadedAt = -1

  return {
    ready,
    update: (dt, arrive) => {
      time += dt
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const aspect = camera.aspect
      const vh = window.innerHeight
      const sy = window.scrollY
      const jumped = Math.abs(sy - lastScroll) > vh * 2
      scrollVel = jumped ? 0 : scrollVel + ((dt > 0 ? (sy - lastScroll) / dt : 0) - scrollVel) * Math.min(1, dt * 6)
      lastScroll = sy
      remeasure -= dt
      if (remeasure <= 0 || dt === 0) {
        measure()
        remeasure = 2
      }
      const fade = smooth(Math.min(1, Math.max(0, (arrive - 0.35) / 0.65)))

      // Astronaut: pick the anchor for this scroll position, then float toward it
      const anchors = aspect < 1 ? TALL : WIDE
      let i = 0
      while (i < stops.length - 2 && sy >= stops[i + 1]) i++
      // He drifts to the next spot over the last stretch before it (at most about a screen), so through
      // a long section such as the voyage he stays parked where the previous anchor put him
      const span = Math.min((stops[i + 1] - stops[i]) * 0.65, vh * 1.1)
      const k = smooth(Math.min(1, Math.max(0, 1 - (stops[i + 1] - sy) / span)))
      const a0 = anchors[i]
      const a1 = anchors[Math.min(anchors.length - 1, i + 1)]
      const d = THREE.MathUtils.lerp(a0[2], a1[2], k)
      const halfH = tan * d
      const halfW = halfH * aspect
      view = { halfW, halfH }
      // Narrower landscape screens: text runs further right, so keep closer to the edge
      const edge = aspect >= 1 && aspect < 1.45 ? 0.1 : 0
      const target = new THREE.Vector3(
        (THREE.MathUtils.lerp(a0[0], a1[0], k) + edge) * halfW,
        THREE.MathUtils.lerp(a0[1], a1[1], k) * halfH,
        -d,
      )
      // Drifts in from off-screen right once the camera has arrived and the suit has streamed in
      if (astro.loaded() && loadedAt < 0) loadedAt = time
      const enter = loadedAt < 0 ? 0 : reduce ? 1 : smooth(Math.min(1, (time - loadedAt) / 1.8))
      target.x += (1 - fade * enter) * halfW * 0.9
      if (!placed || reduce || jumped) {
        pos.copy(target)
        placed = true
      } else pos.lerp(target, Math.min(1, dt * 1.6))

      // Physics: held, he follows the cursor; let go, he drifts and tumbles until the tether reels him in
      unit = (2 * halfH) / vh
      if (grab) {
        const p = toView(pointer.x, pointer.y)
        const gx = p.x + grab.dx - pos.x
        const gy = p.y + grab.dy - pos.y
        const f = 1 - Math.exp(-dt * 18)
        const nx = off.x + (gx - off.x) * f
        const ny = off.y + (gy - off.y) * f
        if (dt > 0) vel.set((nx - off.x) / dt, (ny - off.y) / dt)
        off.set(nx, ny)
        // Leans into the drag
        spinVel += ((THREE.MathUtils.clamp(-vel.x * 0.05, -0.7, 0.7) - spin) * 8 - spinVel * 3) * dt
      } else {
        const lag = THREE.MathUtils.clamp(scrollVel * 0.12, -120, 120) * unit
        vel.x += (-off.x * 2 - vel.x * 1.4) * dt
        vel.y += ((lag - off.y) * 2 - vel.y * 1.4) * dt
        off.addScaledVector(vel, dt)
        off.x = THREE.MathUtils.clamp(off.x, -halfW * 1.6, halfW * 1.6)
        off.y = THREE.MathUtils.clamp(off.y, -halfH * 1.6, halfH * 1.6)
        spinVel += (-wrap(spin) * 1.6 - spinVel * 1.1) * dt
      }
      spin += spinVel * dt
      pitchVel += (-wrap(pitch) * 1.6 - pitchVel * 1.1) * dt
      pitch += pitchVel * dt

      astro.root.position.set(
        pos.x + off.x + Math.cos(time * 0.45) * 0.1 * (d / 10),
        pos.y + off.y + Math.sin(time * 0.6) * 0.14 * (d / 10),
        pos.z,
      )
      astro.root.rotation.set(pitch, 0, spin)

      // Where he sits on screen, for grabbing and for the cursor he watches
      screen.copy(astro.root.position).applyMatrix4(camera.projectionMatrix)
      astroPx.x = (screen.x * 0.5 + 0.5) * window.innerWidth
      astroPx.y = (-screen.y * 0.5 + 0.5) * vh
      astroPx.r = (1.25 / halfH) * vh * 0.5
      grabbable = !reduce && astro.loaded() && fade * enter > 0.9 && galaxyBus.dim.get() > 0.5
      if (!grabbable && !grab && cursor === "grab") setCursor("")
      if (pointer.x >= 0) {
        look.x = THREE.MathUtils.clamp((pointer.x - astroPx.x) / (window.innerWidth * 0.5), -1, 1)
        look.y = THREE.MathUtils.clamp(-(pointer.y - astroPx.y) / (vh * 0.5), -1, 1)
      }
      astro.update(time, dt, look)

      // The sun's shadow camera follows him
      if (shadows) {
        key.target.position.copy(astro.root.position)
        key.position.copy(KEY_DIR).multiplyScalar(10).add(astro.root.position)
      }

      // Clouds
      const cloudHalfH = tan * CLOUD_DEPTH
      const pan = sy / vh
      for (const c of clouds) {
        const y = c.y - pan * 0.14
        c.m.position.set(c.x * cloudHalfH * aspect, -y * cloudHalfH * 2, -CLOUD_DEPTH)
        const s = c.size * cloudHalfH * 2 * (aspect < 1 ? 1.25 : 1)
        c.m.scale.set(s, s, 1)
        c.mat.uniforms.uTime.value += dt
        c.mat.uniforms.uOpacity.value = c.alpha * fade
      }

      // Asteroids: wrap vertically, nearer ones faster
      for (const r of rocks) {
        const h = tan * r.d
        const fy = (((r.y + (sy / vh) * (1.4 / r.d) + time * 0.004) % 1) + 1) % 1
        r.m.position.set(r.x * h * aspect, (fy * 2 - 1) * h * 1.3, -r.d - (1 - fade) * 30)
        ;(r.m.material as THREE.MeshStandardMaterial).opacity = 1 - smooth(Math.min(1, Math.max(0, (r.m.position.y / h - 0.6) / 0.25)))
        r.m.rotation.x += r.spin.x * dt
        r.m.rotation.y += r.spin.y * dt
        r.m.rotation.z += r.spin.z * dt
      }

      // Satellite: a slow pass across the top every minute
      {
        const sd = mobile ? 34 : 28
        const h = tan * sd
        const ph = (time / 60 + 0.62) % 1
        sat.position.set((ph * 2.6 - 1.3) * h * aspect, (0.64 + Math.sin(ph * Math.PI * 2) * 0.06) * h, -sd - (1 - fade) * 30)
        sat.rotation.set(0.45 + Math.sin(time * 0.2) * 0.1, time * 0.22, 0.25)
        satLight.visible = time % 1.4 < 0.12
      }

      for (const m of [dustMat, spikeMat]) {
        m.uniforms.uTime.value = time
        m.uniforms.uScroll.value = sy
        m.uniforms.uViewH.value = vh
        m.uniforms.uTan.value = tan
        m.uniforms.uAspect.value = aspect
        m.uniforms.uFade.value = fade
      }

      // Shooting stars
      if (!reduce) {
        nextStreak -= dt
        if (nextStreak <= 0 && fade > 0.9) {
          const s = streaks.find((x) => x.t < 0)
          if (s) {
            const h = tan * 50
            const right = Math.random() < 0.75
            const a = 0.3 + Math.random() * 0.35
            s.t = 0
            s.dur = 0.7 + Math.random() * 0.5
            s.len = (0.35 + Math.random() * 0.3) * h
            s.dx = Math.cos(a) * (right ? 1 : -1)
            s.dy = -Math.sin(a)
            s.x = ((right ? -0.9 : -0.3) + Math.random() * 1.2) * h * aspect
            s.y = (0.25 + Math.random() * 0.6) * h
            s.m.rotation.z = Math.atan2(s.dy, s.dx)
            s.m.visible = true
          }
          nextStreak = (mobile ? 5 : 3.5) + Math.random() * 5
        }
        for (const s of streaks) {
          if (s.t < 0) continue
          s.t += dt
          const p = s.t / s.dur
          if (p >= 1) {
            s.t = -1
            s.m.visible = false
            continue
          }
          const travel = p * s.len * 2.2
          s.m.position.set(s.x + s.dx * travel, s.y + s.dy * travel, -50)
          s.m.scale.set(s.len, s.len * 0.012 + 0.03, 1)
          s.mat.uniforms.uAlpha.value = Math.sin(Math.PI * p)
        }
      }
    },
    dispose: () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      window.removeEventListener("resize", measure)
      document.documentElement.style.cursor = ""
      document.body.style.userSelect = ""
      baked.forEach((rt) => rt.dispose())
      rockMat.dispose()
      scene.environment = null
      env.dispose()
      rig.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          ;(x as THREE.MeshStandardMaterial).map?.dispose()
          x.dispose()
        }
      })
      camera.remove(rig, hemi, key, key.target, rim, rim.target)
    },
  }
}
