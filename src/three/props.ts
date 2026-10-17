import * as THREE from "three"
import { createAstronaut } from "./astronaut"

/**
 * Life in the backdrop, drawn into the galaxy's scene: a drifting astronaut on a
 * data tether, gas clouds, tumbling asteroids, a satellite, shooting stars and
 * near-field dust. Everything rides in a rig attached to the camera, so each
 * piece keeps to the empty side of the layout while the galaxy turns behind it.
 */
export type Props = {
  /** arrive: 0..1 eased fly-in of the camera; the props come in with it */
  update: (dt: number, arrive: number) => void
  dispose: () => void
}

type Opts = { mobile: boolean; reduce: boolean }

// Astronaut placement per section: [x, y] as fractions of the half-viewport, depth in scene units
type Anchor = [number, number, number]
const WIDE: Anchor[] = [
  [0.84, 0.3, 15], // hero: right of the portrait
  [0.7, 0.3, 9.5], // about: the open right side
  [0.74, 0.45, 11], // skills: above the orbits
  [0.74, 0.3, 11], // projects (the voyage covers the backdrop)
  [0.66, 0.45, 9.5], // contact: beside the heading
]
// On phones the text fills the width, so the astronaut keeps to the hero, then floats off to the right
const TALL: Anchor[] = [
  [0.6, 0.76, 19],
  [1.5, 0.6, 15],
  [1.5, 0.66, 15],
  [1.5, 0.6, 15],
  [1.5, 0.6, 15],
]
const SECTIONS = ["about", "skills", "projects", "contact"]

const cloudVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Domain-warped fbm, baked once per cloud into a texture
const bakeFragment = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  uniform float uSeed;
  varying vec2 vUv;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 6; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
    return v;
  }
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    vec2 q = p * 1.7 + uSeed;
    vec2 w = vec2(fbm(q), fbm(q + vec2(5.2, 1.3)));
    vec2 w2 = vec2(fbm(q + 3.0 * w + vec2(1.7, 9.2)), fbm(q + 3.0 * w + vec2(8.3, 2.8)));
    float n = fbm(q + 3.5 * w2);
    float edge = smoothstep(1.0, 0.2, length(p * vec2(1.0, 1.15)) + (w.x - 0.5) * 0.5);
    float dens = pow(clamp(n * 1.35 - 0.3, 0.0, 1.0), 1.5) * edge;
    float dust = smoothstep(0.52, 0.72, fbm(q * 2.3 + w * 2.0 + 11.0));
    vec3 col = mix(uA, uB, clamp(length(w2) * 0.9, 0.0, 1.0));
    col = mix(col, uC, clamp(pow(n, 3.0) * 2.2, 0.0, 1.0));
    col *= dens * (1.0 - dust * 0.75);
    gl_FragColor = vec4(col, 1.0);
  }
`

// Two slowly counter-rotating samples of the baked cloud, so it seems to billow
const cloudFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  vec2 rot(vec2 uv, float a) { uv -= 0.5; float c = cos(a); float s = sin(a); return mat2(c, -s, s, c) * uv + 0.5; }
  void main() {
    float a = uTime * 0.012;
    vec3 c1 = texture2D(uMap, rot(vUv, a)).rgb;
    vec3 c2 = texture2D(uMap, rot((vUv - 0.5) * 0.94 + 0.5, -a * 1.4 + 0.6)).rgb;
    vec3 col = mix(c1, c2, 0.3 + 0.2 * sin(uTime * 0.05));
    col *= smoothstep(0.5, 0.3, length(vUv - 0.5));
    gl_FragColor = vec4(col, uOpacity);
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

/** Dim space with a violet galaxy band and a few coloured glows, for the visor and metal to reflect */
function spaceEnvironment(renderer: THREE.WebGLRenderer) {
  const c = document.createElement("canvas")
  c.width = 512
  c.height = 256
  const x = c.getContext("2d")!
  const g = x.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, "#0b0f2a")
  g.addColorStop(0.5, "#1a1240")
  g.addColorStop(1, "#05060f")
  x.fillStyle = g
  x.fillRect(0, 0, 512, 256)
  const band = x.createLinearGradient(0, 96, 0, 160)
  band.addColorStop(0, "rgba(167,139,250,0)")
  band.addColorStop(0.5, "rgba(196,160,255,0.55)")
  band.addColorStop(1, "rgba(167,139,250,0)")
  x.fillStyle = band
  x.fillRect(0, 96, 512, 64)
  const blob = (cx: number, cy: number, r: number, col: string) => {
    const h = x.createRadialGradient(cx, cy, 0, cx, cy, r)
    h.addColorStop(0, col)
    h.addColorStop(1, "rgba(0,0,0,0)")
    x.fillStyle = h
    x.fillRect(cx - r, cy - r, r * 2, r * 2)
  }
  blob(150, 70, 70, "rgba(255,225,245,0.95)")
  blob(380, 120, 90, "rgba(34,211,238,0.6)")
  blob(260, 180, 80, "rgba(236,72,153,0.45)")
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`
    x.fillRect(Math.random() * 512, Math.random() * 256, 1, 1)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromEquirectangular(tex).texture
  tex.dispose()
  pmrem.dispose()
  return env
}

function bakeClouds(renderer: THREE.WebGLRenderer, palettes: [number, number, number][]) {
  const scene = new THREE.Scene()
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const mat = new THREE.ShaderMaterial({
    vertexShader: cloudVertex,
    fragmentShader: bakeFragment,
    uniforms: { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uC: { value: new THREE.Vector3() }, uSeed: { value: 0 } },
  })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
  scene.add(quad)
  const targets = palettes.map(([a, b, c], i) => {
    const rt = new THREE.WebGLRenderTarget(512, 512)
    mat.uniforms.uA.value.copy(rgb(a))
    mat.uniforms.uB.value.copy(rgb(b))
    mat.uniforms.uC.value.copy(rgb(c))
    mat.uniforms.uSeed.value = 3.7 + i * 11.3
    renderer.setRenderTarget(rt)
    renderer.clear()
    renderer.render(scene, cam)
    return rt
  })
  renderer.setRenderTarget(null)
  quad.geometry.dispose()
  mat.dispose()
  return targets
}

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

function createSatellite(env: THREE.Texture) {
  const sat = new THREE.Group()
  const foil = new THREE.MeshStandardMaterial({ color: 0xd2a24c, metalness: 0.9, roughness: 0.32, envMap: env, envMapIntensity: 1.2 })
  const white = new THREE.MeshStandardMaterial({ color: 0xdfe4ee, roughness: 0.5, metalness: 0.2, envMap: env, envMapIntensity: 0.6 })
  const panel = new THREE.MeshStandardMaterial({ map: solarPanelTexture(), metalness: 0.6, roughness: 0.28, envMap: env, envMapIntensity: 1.1 })
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
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ee, roughness: 0.5, metalness: 0.2, envMap: env, envMapIntensity: 0.6, side: THREE.DoubleSide })
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), dishMat)
  dish.rotation.x = -Math.PI / 2
  dish.position.z = 0.82
  sat.add(dish)
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 6), white)
  feed.rotation.x = Math.PI / 2
  feed.position.z = 0.7
  sat.add(feed)
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf43f5e }))
  light.position.set(0, 0.36, -0.3)
  sat.add(light)
  return { sat, light }
}

export function createProps(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, { mobile, reduce }: Opts): Props {
  const env = spaceEnvironment(renderer)
  const rig = new THREE.Group()
  camera.add(rig)

  // Lights ride with the camera: warm key from the galaxy core's side, cyan rim, violet fill
  const hemi = new THREE.HemisphereLight(0x9d8cff, 0x0a0f24, 0.9)
  const key = new THREE.DirectionalLight(0xfff1fa, 2.4)
  key.position.set(-5, 6, 4)
  key.target.position.set(0, 0, -10)
  const rim = new THREE.DirectionalLight(0x67e8f9, 3)
  rim.position.set(6, 1, -12)
  rim.target.position.set(0, 0, -8)
  camera.add(hemi, key, key.target, rim, rim.target)

  // Gas clouds: baked once, then billowing slowly; they slide up the screen at a crawl as the page scrolls
  const cloudSpecs: { x: number; y: number; size: number; tint: number; alpha: number }[] = [
    { x: 0.98, y: -0.42, size: 1.05, tint: 0, alpha: 0.62 },
    { x: -1.05, y: 0.62, size: 0.95, tint: 1, alpha: 0.4 },
    { x: 0.85, y: 0.95, size: 1.15, tint: 2, alpha: 0.55 },
    { x: 0.9, y: 1.85, size: 1.15, tint: 0, alpha: 0.6 },
    { x: -0.9, y: 2.25, size: 1.0, tint: 1, alpha: 0.5 },
    { x: 0.2, y: 1.35, size: 1.3, tint: 2, alpha: 0.45 },
  ].slice(0, mobile ? 4 : 6)
  const baked = bakeClouds(renderer, [
    [0x6d28d9, 0xdb2777, 0xfde4ff],
    [0x0e7490, 0x2563eb, 0xa5f3fc],
    [0xbe185d, 0x6d28d9, 0xfdba74],
  ])
  const CLOUD_DEPTH = 70
  const clouds = cloudSpecs.map((s) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: cloudVertex,
      fragmentShader: cloudFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: baked[s.tint].texture }, uTime: { value: Math.random() * 100 }, uOpacity: { value: 0 } },
    })
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    m.position.z = -CLOUD_DEPTH
    m.renderOrder = -1
    rig.add(m)
    return { m, mat, ...s }
  })

  // Asteroids along the edges, tumbling, with scroll parallax by depth
  const rockGeos = [asteroidGeometry(), asteroidGeometry(), asteroidGeometry()]
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3641, roughness: 1, metalness: 0.05, flatShading: true, envMap: env, envMapIntensity: 0.2 })
  const rockSpecs = [
    { x: 0.93, y: 0.15, d: 9, s: 0.3 },
    { x: 0.66, y: 0.55, d: 16, s: 0.42 },
    { x: 0.82, y: 0.8, d: 22, s: 0.6 },
    { x: 0.97, y: 0.68, d: 7, s: 0.16 },
    { x: 0.55, y: 0.02, d: 26, s: 0.5 },
  ].slice(0, mobile ? 3 : 5)
  const rocks = rockSpecs.map((r, i) => {
    const m = new THREE.Mesh(rockGeos[i % 3], rockMat)
    m.scale.setScalar(r.s)
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
    rig.add(m)
    return { m, ...r, spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5) }
  })

  const { sat, light: satLight } = createSatellite(env)
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
  const dpr = renderer.getPixelRatio()
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
      vertexShader: cloudVertex,
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

  const astro = createAstronaut(env)
  rig.add(astro.root)

  // Section stops: the scroll position at which each anchor applies
  let stops = [0, 1, 2, 3, 4]
  const measure = () => {
    const h = window.innerHeight
    let prev = 0
    stops = [0, ...SECTIONS.map((id) => {
      const el = document.getElementById(id)
      prev = Math.max(prev + 1, el ? el.getBoundingClientRect().top + window.scrollY - h * 0.4 : prev + h)
      return prev
    })]
  }
  measure()
  let remeasure = 0

  // Input: the astronaut watches the cursor, gets nudged by it and twirls when tapped
  const pointer = { x: -1, y: -1, moved: 0 }
  const look = { x: 0, y: 0 }
  const screen = new THREE.Vector3()
  const astroPx = { x: 0, y: 0, r: 0 }
  const off = new THREE.Vector2()
  const vel = new THREE.Vector2()
  let cooldown = 0
  const onMove = (e: PointerEvent) => {
    pointer.x = e.clientX
    pointer.y = e.clientY
    pointer.moved = 0.25
  }
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element | null)?.closest?.("a,button,input,textarea,select,label,[role='button']")) return
    if (Math.hypot(e.clientX - astroPx.x, e.clientY - astroPx.y) < astroPx.r) {
      astro.twirl()
      astro.wave()
    }
  }
  if (!reduce) {
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerdown", onDown, { passive: true })
  }
  window.addEventListener("resize", measure)

  let time = 0
  let lastScroll = window.scrollY
  let scrollVel = 0
  const pos = new THREE.Vector3()
  let placed = false
  const smooth = (k: number) => k * k * (3 - 2 * k)

  return {
    update: (dt, arrive) => {
      time += dt
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const aspect = camera.aspect
      const vh = window.innerHeight
      const sy = window.scrollY
      scrollVel += ((dt > 0 ? (sy - lastScroll) / dt : 0) - scrollVel) * Math.min(1, dt * 6)
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
      const u = Math.min(1, Math.max(0, (sy - stops[i]) / (stops[i + 1] - stops[i])))
      const k = smooth(Math.min(1, Math.max(0, (u - 0.35) / 0.65)))
      const a0 = anchors[i]
      const a1 = anchors[Math.min(anchors.length - 1, i + 1)]
      const d = THREE.MathUtils.lerp(a0[2], a1[2], k)
      const halfH = tan * d
      const halfW = halfH * aspect
      // Narrower landscape screens: text runs further right, so keep closer to the edge
      const edge = aspect >= 1 && aspect < 1.45 ? 0.1 : 0
      const target = new THREE.Vector3(
        (THREE.MathUtils.lerp(a0[0], a1[0], k) + edge) * halfW,
        THREE.MathUtils.lerp(a0[1], a1[1], k) * halfH,
        -d,
      )
      // Drifts in from off-screen right as the camera arrives
      target.x += (1 - fade) * halfW * 0.9
      if (!placed || reduce) {
        pos.copy(target)
        placed = true
      } else pos.lerp(target, Math.min(1, dt * 1.6))

      // Springy offset: lags behind fast scrolling, pushed by the cursor
      const unit = (2 * halfH) / vh
      cooldown -= dt
      pointer.moved -= dt
      if (!reduce && pointer.moved > 0 && cooldown <= 0) {
        const dx = astroPx.x - pointer.x
        const dy = astroPx.y - pointer.y
        const dist = Math.hypot(dx, dy)
        if (dist < astroPx.r) {
          const push = (1 - dist / astroPx.r) * 260 * unit
          vel.x += (dx / (dist || 1)) * push
          vel.y -= (dy / (dist || 1)) * push
          cooldown = 0.35
        }
      }
      const lag = THREE.MathUtils.clamp(scrollVel * 0.12, -120, 120) * unit
      vel.x += (-off.x * 5 - vel.x * 2.4) * dt
      vel.y += ((lag - off.y) * 5 - vel.y * 2.4) * dt
      off.addScaledVector(vel, dt)

      astro.root.position.set(
        pos.x + off.x + Math.cos(time * 0.45) * 0.1 * (d / 10),
        pos.y + off.y + Math.sin(time * 0.6) * 0.14 * (d / 10),
        pos.z,
      )
      astro.root.rotation.z = THREE.MathUtils.clamp(off.x * -0.25, -0.5, 0.5)

      // Where it sits on screen, for the cursor
      screen.copy(astro.root.position).applyMatrix4(camera.projectionMatrix)
      astroPx.x = (screen.x * 0.5 + 0.5) * window.innerWidth
      astroPx.y = (-screen.y * 0.5 + 0.5) * vh
      astroPx.r = (1.5 / halfH) * vh * 0.5
      if (pointer.x >= 0) {
        look.x = THREE.MathUtils.clamp((pointer.x - astroPx.x) / (window.innerWidth * 0.5), -1, 1)
        look.y = THREE.MathUtils.clamp(-(pointer.y - astroPx.y) / (vh * 0.5), -1, 1)
      }
      astro.update(time, dt, look)

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

      // Dust
      dustMat.uniforms.uTime.value = time
      dustMat.uniforms.uScroll.value = sy
      dustMat.uniforms.uViewH.value = vh
      dustMat.uniforms.uTan.value = tan
      dustMat.uniforms.uAspect.value = aspect
      dustMat.uniforms.uFade.value = fade

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
      window.removeEventListener("resize", measure)
      baked.forEach((rt) => rt.dispose())
      env.dispose()
      rockMat.dispose()
      rig.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
        const map = (mat as THREE.MeshStandardMaterial | undefined)?.map
        map?.dispose()
      })
      camera.remove(rig, hemi, key, key.target, rim, rim.target)
    },
  }
}
