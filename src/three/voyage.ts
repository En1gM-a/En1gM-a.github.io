import * as THREE from "three"
import { createAstronaut } from "./astronaut"
import { spaceEnvironment } from "./env"

export type Palette = {
  /** Deep base, mid tone, band highlight, atmosphere glow */
  a: string
  b: string
  c: string
  atmo: string
  ring?: string
  /** Under construction: an amber scaffold ring */
  wip?: boolean
}

/** p: position along the route (0 … n-1, fractional while travelling); warp 0…1; entry 0…1 as the section arrives */
export type VoyageState = { p: number; warp: number; entry: number }

export type Voyage = { dispose: () => void }

const SPACING = 70 // distance between destinations along the route
const SIDE_X = 15 // how far each planet sits off the route

const planetVertex = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vPos;
  varying vec3 vViewDir;
  void main() {
    vPos = position;
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const planetFragment = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  uniform vec3 uAtmo;
  uniform vec3 uLight;
  uniform float uTime;
  uniform float uSeed;
  uniform float uBands;
  varying vec3 vNormalV;
  varying vec3 vPos;
  varying vec3 vViewDir;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i);
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z
    );
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int k = 0; k < OCTAVES; k++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 p = normalize(vPos);
    float n = fbm(p * 2.4 + vec3(uSeed) + vec3(uTime * 0.015, 0.0, 0.0));
    float warpN = fbm(p * 5.0 + n * 1.5 + uSeed);
    float bands = sin(p.y * uBands + n * 5.0 + warpN * 2.0) * 0.5 + 0.5;
    vec3 col = mix(uA, uB, smoothstep(0.3, 0.7, n));
    col = mix(col, uC, smoothstep(0.55, 0.95, bands) * 0.55);
    // Soft terminator: a lit hemisphere fading into night
    float light = smoothstep(-0.25, 0.65, dot(vNormalV, uLight));
    col *= 0.06 + light * 1.1;
    // Atmosphere: a fresnel rim, brightest on the lit side
    float rim = pow(1.0 - max(dot(vNormalV, vViewDir), 0.0), 2.6);
    col += uAtmo * rim * (0.25 + light * 0.95);
    gl_FragColor = vec4(col, 1.0);
  }
`

const ringFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uInner;
  uniform float uOuter;
  uniform float uDashed;
  varying vec3 vPos;
  void main() {
    float r = (length(vPos.xy) - uInner) / (uOuter - uInner);
    float bands = 0.55 + 0.45 * sin(r * 46.0) * sin(r * 13.0 + 1.3);
    float edge = smoothstep(0.0, 0.08, r) * smoothstep(1.0, 0.85, r);
    float alpha = bands * edge * 0.55;
    if (uDashed > 0.5) {
      float ang = atan(vPos.y, vPos.x);
      alpha *= step(0.5, fract(ang * 9.0)) * 1.4;
    }
    gl_FragColor = vec4(uColor * (0.6 + bands * 0.6), alpha);
  }
`

const ringVertex = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const pointsVertex = /* glsl */ `
  uniform float uSize;
  attribute float aScale;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aScale / -mv.z;
    vColor = color;
  }
`

const pointsFragment = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    float s = pow(max(0.0, 1.0 - d * 2.0), 2.4);
    gl_FragColor = vec4(vColor * s, s);
  }
`

function glowTexture() {
  const size = 256
  const c = document.createElement("canvas")
  c.width = c.height = size
  const ctx = c.getContext("2d")!
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size / 2)
  g.addColorStop(0, "rgba(255,255,255,0.9)")
  g.addColorStop(0.35, "rgba(255,255,255,0.35)")
  g.addColorStop(1, "rgba(255,255,255,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function cloudTexture(color: THREE.Color) {
  const size = 256
  const c = document.createElement("canvas")
  c.width = c.height = size
  const ctx = c.getContext("2d")!
  const rgb = `${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)}`
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, `rgba(${rgb},0.55)`)
  g.addColorStop(0.5, `rgba(${rgb},0.18)`)
  g.addColorStop(1, `rgba(${rgb},0)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = "destination-out"
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 12 + Math.random() * 46
    const h = ctx.createRadialGradient(x, y, 0, x, y, r)
    h.addColorStop(0, `rgba(0,0,0,${0.2 + Math.random() * 0.35})`)
    h.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = h
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** A small spiral galaxy for each destination's sky */
function miniGalaxy(count: number, inner: THREE.Color, outer: THREE.Color, uSize: number) {
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const scl = new Float32Array(count)
  const tmp = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const r = Math.pow(Math.random(), 1.4) * 9
    const branch = ((i % 3) / 3) * Math.PI * 2
    const spin = r * 0.9
    const jitter = () => Math.pow(Math.random(), 2.5) * (Math.random() < 0.5 ? 1 : -1) * 0.5 * (r + 0.4)
    pos[i * 3] = Math.cos(branch + spin) * r + jitter()
    pos[i * 3 + 1] = jitter() * 0.35
    pos[i * 3 + 2] = Math.sin(branch + spin) * r + jitter()
    tmp.copy(inner).lerp(outer, Math.min(1, r / 9))
    col[i * 3] = tmp.r
    col[i * 3 + 1] = tmp.g
    col[i * 3 + 2] = tmp.b
    scl[i] = 0.5 + Math.random()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
  geo.setAttribute("aScale", new THREE.BufferAttribute(scl, 1))
  const mat = new THREE.ShaderMaterial({
    vertexShader: pointsVertex,
    fragmentShader: pointsFragment,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uSize: { value: uSize } },
  })
  return new THREE.Points(geo, mat)
}

export function createVoyage(
  canvas: HTMLCanvasElement,
  {
    palettes,
    read,
    mobile,
    tall,
  }: {
    palettes: Palette[]
    read: () => VoyageState
    /** Lighter geometry and resolution for phones */
    mobile: boolean
    /** Portrait screens: each planet looms at the top, the project sits below it */
    tall: boolean
  },
): Voyage | null {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: "high-performance" })
  } catch {
    return null
  }
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75)
  renderer.setPixelRatio(dpr)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 900)
  const n = palettes.length
  const glow = glowTexture()
  const planets: { mesh: THREE.Mesh; spin: number; light: THREE.Vector3 }[] = []
  const materials: THREE.ShaderMaterial[] = []
  const galaxies: THREE.Points[] = []

  palettes.forEach((pal, i) => {
    const side = i % 2 === 0 ? 1 : -1
    const z = -i * SPACING
    const radius = 9.5 + (i % 3) * 0.9
    const center = tall ? new THREE.Vector3(side * 3.5, 7, z) : new THREE.Vector3(side * SIDE_X, i % 2 ? 1.5 : -1.2, z)

    const light = new THREE.Vector3(-side * 0.65, 0.42, 0.62).normalize()
    const mat = new THREE.ShaderMaterial({
      vertexShader: planetVertex,
      fragmentShader: planetFragment,
      defines: { OCTAVES: mobile ? 3 : 5 },
      uniforms: {
        uA: { value: new THREE.Color(pal.a) },
        uB: { value: new THREE.Color(pal.b) },
        uC: { value: new THREE.Color(pal.c) },
        uAtmo: { value: new THREE.Color(pal.atmo) },
        // Lit from the route's side, so the bright limb faces the content
        uLight: { value: light },
        uTime: { value: 0 },
        uSeed: { value: i * 7.31 },
        uBands: { value: 6 + (i % 3) * 4 },
      },
    })
    materials.push(mat)
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, mobile ? 64 : 96, mobile ? 40 : 64), mat)
    mesh.position.copy(center)
    mesh.rotation.z = (side * 0.35) / (1 + (i % 2))
    scene.add(mesh)
    planets.push({ mesh, spin: 0.04 + (i % 3) * 0.015, light })

    // Atmospheric halo behind the disc
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(pal.atmo), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7, toneMapped: false }),
    )
    halo.position.copy(center)
    halo.scale.setScalar(radius * 3)
    scene.add(halo)

    if (pal.ring || pal.wip) {
      const inner = radius * (pal.wip ? 1.25 : 1.35)
      const outer = radius * (pal.wip ? 1.45 : 2.15)
      const ringMat = new THREE.ShaderMaterial({
        vertexShader: ringVertex,
        fragmentShader: ringFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uColor: { value: new THREE.Color(pal.wip ? "#fbbf24" : pal.ring) },
          uInner: { value: inner },
          uOuter: { value: outer },
          uDashed: { value: pal.wip ? 1 : 0 },
        },
      })
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 160, 1), ringMat)
      ring.position.copy(center)
      ring.rotation.x = -Math.PI / 2 + 0.32
      ring.rotation.y = side * 0.28
      scene.add(ring)
    }

    // This destination's own galaxy and nebula, hanging in the sky beyond the planet
    const g = miniGalaxy(mobile ? 2200 : 6000, new THREE.Color(pal.c), new THREE.Color(pal.atmo), 220 * dpr)
    g.position.set(-side * 26, 12, z - 80)
    g.rotation.set(0.9, 0.3 * side, 0.4)
    scene.add(g)
    galaxies.push(g)

    const neb = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: cloudTexture(new THREE.Color(pal.b)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, toneMapped: false }),
    )
    neb.position.set(-side * 12, 4, z - 60)
    neb.scale.setScalar(110)
    scene.add(neb)
  })

  // Star streaks along the route: dots at rest, long trails at warp
  const streakCount = mobile ? 450 : 1100
  const routeStart = 80
  const routeEnd = -(n - 1) * SPACING - 140
  const heads = new Float32Array(streakCount * 3)
  const linePos = new Float32Array(streakCount * 6)
  for (let i = 0; i < streakCount; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 7 + Math.pow(Math.random(), 0.7) * 70
    heads[i * 3] = Math.cos(a) * r
    heads[i * 3 + 1] = Math.sin(a) * r * 0.7
    heads[i * 3 + 2] = routeStart + Math.random() * (routeEnd - routeStart)
  }
  const streakGeo = new THREE.BufferGeometry()
  streakGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3))
  const streakMat = new THREE.LineBasicMaterial({ color: 0xd8f3ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  const streaks = new THREE.LineSegments(streakGeo, streakMat)
  scene.add(streaks)

  // A crew member in NASA's suit rides with the camera, so he is always in view: he floats in the open
  // corner above each planet (beside it on phones), clear of the project details
  const env = spaceEnvironment(renderer)
  scene.environment = env
  const astro = createAstronaut({ tether: false })
  scene.add(camera)
  camera.add(astro.root)
  const sun = new THREE.DirectionalLight(0xfff3e6, 2.6)
  scene.add(sun, sun.target, new THREE.HemisphereLight(0x6fa8c8, 0x3a2414, 0.6))
  const astroWorld = new THREE.Vector3()
  const sideOf = (i: number) => (i % 2 === 0 ? 1 : -1)

  // Camera stations: parked up the route from each planet, looking straight ahead,
  // so the planet sits large at the screen edge on its own side
  const station = (i: number, out: THREE.Vector3) => {
    const side = i % 2 === 0 ? 1 : -1
    return tall ? out.set(0, 0.5, -i * SPACING + 36) : out.set(-side * 2.5, 1.2, -i * SPACING + 33)
  }
  const target = (i: number, out: THREE.Vector3) => {
    const side = i % 2 === 0 ? 1 : -1
    return tall ? out.set(0, -1.5, -i * SPACING - 6) : out.set(-side * 2.5, 0.6, -i * SPACING - 7)
  }

  const camPos = new THREE.Vector3()
  const camLook = new THREE.Vector3()
  const sA = new THREE.Vector3()
  const sB = new THREE.Vector3()
  const tA = new THREE.Vector3()
  const tB = new THREE.Vector3()
  const desiredPos = new THREE.Vector3()
  const desiredLook = new THREE.Vector3()
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
  let raf = 0
  let running = false
  let onScreen = false
  let last = performance.now()
  let time = 0
  let first = true

  const resize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  const render = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    time += dt
    const { p, warp, entry } = read()
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(p)))
    const i1 = Math.min(n - 1, i0 + 1)
    const f = p - i0

    desiredPos.lerpVectors(station(i0, sA), station(i1, sB), f)
    desiredPos.y += Math.sin(Math.PI * f) * 3.5
    // Arriving from deep space as the section scrolls in
    desiredPos.z += Math.pow(1 - entry, 2) * 140
    desiredLook.lerpVectors(target(i0, tA), target(i1, tB), f)

    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3)
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3)
    desiredPos.x += pointer.x * 1.2
    desiredPos.y += pointer.y * 0.8

    if (first) {
      camPos.copy(desiredPos)
      camLook.copy(desiredLook)
      first = false
    } else {
      const k = Math.min(1, dt * 6)
      camPos.lerp(desiredPos, k)
      camLook.lerp(desiredLook, k)
    }
    camera.position.copy(camPos)
    camera.lookAt(camLook)
    camera.fov = (tall ? 60 : 48) + warp * (tall ? 18 : 22)
    camera.updateProjectionMatrix()

    for (const pl of planets) pl.mesh.rotation.y += dt * pl.spin

    // He crosses to the next planet's side mid-warp, while the project details are hidden,
    // and slides in from the edge as the voyage arrives
    const cross = f * f * (3 - 2 * f)
    const sx = sideOf(i0) + (sideOf(i1) - sideOf(i0)) * cross
    const ad = tall ? 17 : 15
    const hh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * ad
    const hw = hh * camera.aspect
    const ax = tall ? -sx * 0.5 : sx * 0.8
    const out = (1 - entry) * 0.9 * (ax < 0 ? -1 : 1)
    astro.root.position.set((ax + out + Math.sin(time * 0.3) * 0.04) * hw, ((tall ? 0.47 : 0.45) + Math.sin(time * 0.41) * 0.04) * hh, -ad)
    // Turned toward the middle of the screen from whichever side he's on
    astro.root.rotation.set(Math.sin(time * 0.35) * 0.1, 0.5 - (ax / (tall ? 0.5 : 0.8)) * 0.5, Math.sin(time * 0.27) * 0.08)
    astro.update(time, dt, { x: 0, y: 0 })
    const at = planets[Math.max(0, Math.min(n - 1, Math.round(p)))]
    astro.root.getWorldPosition(astroWorld)
    sun.target.position.copy(astroWorld)
    sun.position.copy(astroWorld).addScaledVector(at.light, 60)
    for (const m of materials) m.uniforms.uTime.value = time
    for (const g of galaxies) g.rotation.y += dt * 0.03

    // Streaks stretch behind the camera's direction of travel as warp builds
    const len = 0.15 + warp * 26
    for (let i = 0; i < streakCount; i++) {
      const hx = heads[i * 3]
      const hy = heads[i * 3 + 1]
      const hz = heads[i * 3 + 2]
      linePos[i * 6] = hx
      linePos[i * 6 + 1] = hy
      linePos[i * 6 + 2] = hz
      linePos[i * 6 + 3] = hx
      linePos[i * 6 + 4] = hy
      linePos[i * 6 + 5] = hz + len
    }
    streakGeo.attributes.position.needsUpdate = true
    streakMat.opacity = 0.35 + warp * 0.6

    renderer.render(scene, camera)
  }

  const loop = (now: number) => {
    render(now)
    raf = requestAnimationFrame(loop)
  }
  const play = () => {
    if (running || !onScreen || document.hidden) return
    running = true
    last = performance.now()
    raf = requestAnimationFrame(loop)
  }
  const pause = () => {
    running = false
    cancelAnimationFrame(raf)
  }

  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting
    if (onScreen) play()
    else pause()
  })
  io.observe(canvas)
  const onVisibility = () => (document.hidden ? pause() : play())
  const onPointer = (e: PointerEvent) => {
    pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2
    pointer.ty = -(e.clientY / window.innerHeight - 0.5) * 2
  }
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()
  document.addEventListener("visibilitychange", onVisibility)
  window.addEventListener("pointermove", onPointer, { passive: true })

  return {
    dispose: () => {
      pause()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pointermove", onPointer)
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
      glow.dispose()
      env.dispose()
      renderer.dispose()
    },
  }
}
