import * as THREE from "three"
import { createAstronaut } from "./astronaut"
import { spaceEnvironment } from "./env"
import { bakeNebulae, nebulaMaterial } from "./nebula"
import { createPlanetBaker, createPlanetLook, type PlanetLook } from "./planets"

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

const ringFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uInner;
  uniform float uOuter;
  uniform float uDashed;
  varying vec3 vPos;
  void main() {
    float r = (length(vPos.xy) - uInner) / (uOuter - uInner);
    float bands = 0.55 + 0.45 * sin(r * 46.0) * sin(r * 13.0 + 1.3);
    float edge = smoothstep(0.0, 0.08, r) * (1.0 - smoothstep(0.85, 1.0, r));
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
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    float s = pow(max(0.0, 1.0 - d * 2.0), 2.4) * uOpacity;
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
    uniforms: { uSize: { value: uSize }, uOpacity: { value: 1 } },
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
    onReady,
  }: {
    palettes: Palette[]
    read: () => VoyageState
    /** Lighter geometry and resolution for phones */
    mobile: boolean
    /** Portrait screens: each planet looms at the top, the project sits below it */
    tall: boolean
    /** Called once every shader has compiled and every surface has baked (the loader waits for it) */
    onReady?: () => void
  },
): Voyage | null {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: "high-performance" })
  } catch {
    return null
  }
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 1.75)
  renderer.setPixelRatio(dpr)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 900)
  const n = palettes.length
  const glow = glowTexture()
  const planets: { mesh: THREE.Mesh; spin: number; light: THREE.Vector3; atmo: THREE.Color }[] = []
  const looks: PlanetLook[] = []
  const galaxies: THREE.Points[] = []
  const nebulae: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial }[] = []
  // Where a point sits on screen from destination i's parking spot (wide layout): sx, sy in -1..1, D deep
  const tanH = Math.tan(THREE.MathUtils.degToRad(24))
  const fromStation = (i: number, sx: number, sy: number, D: number) => {
    const side = i % 2 === 0 ? 1 : -1
    return new THREE.Vector3(-side * 2.5 + sx * D * tanH * 1.6, 1.2 + sy * D * tanH, -i * SPACING + 33 - D)
  }

  palettes.forEach((pal, i) => {
    const side = i % 2 === 0 ? 1 : -1
    const z = -i * SPACING
    const radius = 9.5 + (i % 3) * 0.9
    const center = tall ? new THREE.Vector3(side * 3.5, 7, z) : new THREE.Vector3(side * SIDE_X, i % 2 ? 1.5 : -1.2, z)

    // Lit from the route's side, so the bright limb faces the content
    const light = new THREE.Vector3(-side * 0.65, 0.42, 0.62).normalize()
    const look = createPlanetLook(pal, i, light)
    looks.push(look)
    const segs: [number, number] = mobile ? [80, 56] : [128, 96]
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, ...segs), look.surface)
    mesh.position.copy(center)
    mesh.rotation.z = (side * 0.35) / (1 + (i % 2))
    scene.add(mesh)
    if (look.clouds) mesh.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.012, ...segs), look.clouds))
    planets.push({ mesh, spin: 0.04 + (i % 3) * 0.015, light, atmo: new THREE.Color(pal.atmo) })

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
    if (tall) g.position.set(-side * 26, 12, z - 80)
    else {
      g.position.copy(fromStation(i, -side * 0.12, 0.6, 120))
      g.scale.setScalar(1.5)
    }
    g.rotation.set(0.9, 0.3 * side, 0.4)
    scene.add(g)
    galaxies.push(g)

    const neb = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: cloudTexture(new THREE.Color(pal.b)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, toneMapped: false }),
    )
    neb.position.set(-side * 12, 4, z - 60)
    neb.scale.setScalar(110)
    scene.add(neb)

    if (!tall) {
      const mat = nebulaMaterial()
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
      mesh.position.copy(fromStation(i, side * 0.45, 0.25, 170))
      mesh.scale.setScalar(2 * 170 * tanH * 2)
      mesh.renderOrder = -1
      scene.add(mesh)
      nebulae.push({ mesh, mat })
    }
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
  const astro = createAstronaut({
    tether: false,
    shadows: !mobile,
    warm: (suit) => renderer.compileAsync(suit, camera, scene),
  })
  scene.add(camera)
  camera.add(astro.root)
  const sun = new THREE.DirectionalLight(0xfff3e6, 3.2)
  if (!mobile) {
    renderer.shadowMap.enabled = true
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    const sc = sun.shadow.camera
    sc.left = -1.7
    sc.right = 1.7
    sc.top = 1.7
    sc.bottom = -1.7
    sc.near = 1
    sc.far = 50
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.02
  }
  const rimLight = new THREE.DirectionalLight(0xffffff, 2.2)
  scene.add(sun, sun.target, rimLight, rimLight.target, new THREE.HemisphereLight(0x6fa8c8, 0x3a2414, 0.35))
  const astroWorld = new THREE.Vector3()
  const rimDir = new THREE.Vector3()

  // Bake the planet surfaces and nebulae while the loader covers the page: each shader compiles off the
  // main thread first, then one surface per frame; if the voyage comes into view first, finish at once
  const baker = createPlanetBaker(renderer, { mobile })
  const nebulaPalettes = palettes.map((pal) => {
    const h = (c: string) => parseInt(c.slice(1), 16)
    return [h(pal.atmo), h(pal.c), h(pal.b), h(pal.c)] as [number, number, number, number]
  })
  let nebulaTargets: THREE.WebGLRenderTarget[] = []
  let hurry = false
  let stopped = false
  const nextFrame = () => (hurry ? Promise.resolve() : new Promise<void>((r) => requestAnimationFrame(() => r())))
  const bakeAll = async () => {
    // Everything compiles and bakes up front, while the loader is up: on a first visit a heavy compile (and the
    // first draw into each bake target) can hold the page still for seconds, which after the intro would land
    // right in the hand-over to the home page
    const compiled = renderer.compileAsync(scene, camera).catch(() => {})
    const clouds = nebulae.length ? bakeNebulae(renderer, nebulaPalettes, 512) : Promise.resolve([])
    await Promise.all([compiled, baker.ready, clouds])
    const targets = await clouds
    for (let i = 0; i < palettes.length; i++) {
      if (stopped) return targets.forEach((t) => t.dispose())
      baker.bake(looks[i], palettes[i], i)
      await nextFrame()
    }
    if (stopped) return targets.forEach((t) => t.dispose())
    nebulaTargets = targets
    nebulae.forEach((nb, i) => (nb.mat.uniforms.uMap.value = targets[i].texture))
    // One warm-up frame uploads everything to the GPU
    render(performance.now())
    onReady?.()
  }
  bakeAll()
  const flushBakes = () => {
    hurry = true
  }
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
    for (const l of looks) l.setTime(time)
    // Each destination's galaxy and nebula belong to its stop: they fade as you leave it
    for (let k = 0; k < n; k++) {
      const near = 1 - Math.min(1, Math.abs(p - k) / 0.75)
      ;(galaxies[k].material as THREE.ShaderMaterial).uniforms.uOpacity.value = near
      if (nebulae[k]) {
        nebulae[k].mat.uniforms.uOpacity.value = near * 0.9 * entry
        nebulae[k].mat.uniforms.uTime.value += dt
      }
    }

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
    sun.position.copy(astroWorld).addScaledVector(at.light, 20)
    rimLight.target.position.copy(astroWorld)
    rimLight.position.copy(astroWorld).addScaledVector(rimDir.set(-at.light.x, 0.25, -1).normalize(), 20)
    rimLight.color.copy(at.atmo)
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
    if (onScreen) flushBakes()
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
      // Torn down mid-bake (e.g. crossing the desktop breakpoint): drop the rest, no warm-up frame
      stopped = true
      baker.dispose()
      nebulaTargets.forEach((t) => t.dispose())
      looks.forEach((l) => l.dispose())
      renderer.dispose()
    },
  }
}
