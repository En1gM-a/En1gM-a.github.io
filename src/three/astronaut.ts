import * as THREE from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"

/**
 * A small crew member built from primitives: white suit, iridescent visor and a
 * glowing data tether trailing off into space. Rigged with pivot groups so it
 * can drift, look at the cursor, wave and twirl.
 */
export type Astronaut = {
  root: THREE.Group
  /** look: -1..1, where the cursor sits relative to the astronaut */
  update: (t: number, dt: number, look: { x: number; y: number }) => void
  wave: () => void
  twirl: () => void
}

const tetherVertex = /* glsl */ `
  uniform float uTime;
  uniform vec3 uAnchor;
  varying float vU;
  void main() {
    vU = uv.x;
    // The near end follows the backpack as the body turns; the far end drifts in slow waves
    vec3 p = position + uAnchor * pow(1.0 - uv.x, 3.0);
    p.y += sin(uv.x * 13.0 - uTime * 1.4) * 0.09 * uv.x;
    p.z += cos(uv.x * 9.0 - uTime * 1.1) * 0.07 * uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const tetherFragment = /* glsl */ `
  uniform float uTime;
  varying float vU;
  void main() {
    // Data pulses run out along the line
    float s = fract(uTime * 0.22);
    float pulse = exp(-pow((vU - s) * 28.0, 2.0)) + 0.6 * exp(-pow((vU - fract(s + 0.5)) * 28.0, 2.0));
    pulse = clamp(pulse, 0.0, 1.0);
    vec3 col = mix(vec3(0.6, 0.66, 0.78), vec3(0.45, 0.95, 1.0), pulse);
    float a = (0.55 + pulse * 0.45) * smoothstep(1.0, 0.55, vU);
    gl_FragColor = vec4(col * (0.8 + pulse * 0.8), a);
  }
`

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

export function createAstronaut(env: THREE.Texture | null): Astronaut {
  const suit = new THREE.MeshStandardMaterial({ color: 0xe9edf5, roughness: 0.62, metalness: 0.05, envMap: env, envMapIntensity: 0.55 })
  const shade = new THREE.MeshStandardMaterial({ color: 0x8b93a8, roughness: 0.45, metalness: 0.35, envMap: env, envMapIntensity: 0.8 })
  const accent = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.9, roughness: 0.4 })
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: 0x2b2156,
    metalness: 1,
    roughness: 0.07,
    envMap: env,
    envMapIntensity: 1.7,
    iridescence: 1,
    iridescenceIOR: 1.5,
    iridescenceThicknessRange: [180, 520],
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  })
  const glow = (color: number) => new THREE.MeshBasicMaterial({ color })
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => new THREE.Mesh(geo, mat)

  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  // Torso, chest unit with status lights, belt
  const torso = mesh(new THREE.CapsuleGeometry(0.4, 0.4, 6, 18), suit)
  torso.scale.set(1, 1, 0.82)
  body.add(torso)
  const chest = mesh(new RoundedBoxGeometry(0.46, 0.3, 0.12, 2, 0.04), shade)
  chest.position.set(0, 0.06, 0.32)
  body.add(chest)
  const leds = [0x22d3ee, 0x4ade80, 0xf43f5e].map((c, i) => {
    const m = mesh(new THREE.SphereGeometry(0.03, 10, 8), glow(c))
    m.position.set(-0.12 + i * 0.12, 0.08, 0.39)
    body.add(m)
    return m
  })
  const stripe = mesh(new RoundedBoxGeometry(0.34, 0.035, 0.03, 1, 0.012), accent)
  stripe.position.set(0, -0.04, 0.385)
  body.add(stripe)
  const belt = mesh(new THREE.TorusGeometry(0.37, 0.055, 8, 28), shade)
  belt.rotation.x = Math.PI / 2
  belt.position.y = -0.34
  body.add(belt)

  // Helmet: white shell, iridescent visor, neck ring, side lamp
  const head = new THREE.Group()
  head.position.y = 0.8
  body.add(head)
  head.add(mesh(new THREE.SphereGeometry(0.44, 32, 24), suit))
  const visor = mesh(new THREE.SphereGeometry(0.4, 32, 24), visorMat)
  visor.scale.set(0.92, 0.74, 0.62)
  visor.position.set(0, 0.01, 0.2)
  head.add(visor)
  const lampBase = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12), shade)
  lampBase.rotation.z = Math.PI / 2
  lampBase.position.set(0.44, 0.08, 0.06)
  head.add(lampBase)
  const lamp = mesh(new THREE.SphereGeometry(0.045, 10, 8), glow(0xe0faff))
  lamp.position.set(0.5, 0.08, 0.1)
  head.add(lamp)
  const neck = mesh(new THREE.TorusGeometry(0.3, 0.07, 10, 28), shade)
  neck.rotation.x = Math.PI / 2
  neck.position.y = 0.42
  body.add(neck)

  // Life-support backpack with an antenna beacon
  const pack = mesh(new RoundedBoxGeometry(0.74, 0.86, 0.34, 3, 0.08), suit)
  pack.position.set(0, 0.12, -0.44)
  body.add(pack)
  for (const x of [-0.18, 0.18]) {
    const vent = mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.1, 12), shade)
    vent.position.set(x, -0.36, -0.46)
    body.add(vent)
  }
  const antenna = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), shade)
  antenna.position.set(0.24, 0.78, -0.5)
  body.add(antenna)
  const beacon = mesh(new THREE.SphereGeometry(0.035, 10, 8), glow(0xf43f5e))
  beacon.position.set(0.24, 1.04, -0.5)
  body.add(beacon)

  // Limbs on pivots: shoulder → elbow, hip → knee
  const arm = (side: 1 | -1) => {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * 0.47, 0.22, 0)
    body.add(shoulder)
    shoulder.add(mesh(new THREE.SphereGeometry(0.17, 16, 12), suit))
    const upper = mesh(new THREE.CapsuleGeometry(0.135, 0.28, 4, 12), suit)
    upper.position.y = -0.24
    shoulder.add(upper)
    const elbow = new THREE.Group()
    elbow.position.y = -0.46
    shoulder.add(elbow)
    const lower = mesh(new THREE.CapsuleGeometry(0.125, 0.24, 4, 12), suit)
    lower.position.y = -0.2
    elbow.add(lower)
    const cuff = mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 20), accent)
    cuff.rotation.x = Math.PI / 2
    cuff.position.y = -0.37
    elbow.add(cuff)
    const glove = mesh(new THREE.SphereGeometry(0.14, 16, 12), shade)
    glove.scale.set(1, 1.15, 0.85)
    glove.position.y = -0.5
    elbow.add(glove)
    return { shoulder, elbow }
  }
  const leg = (side: 1 | -1) => {
    const hip = new THREE.Group()
    hip.position.set(side * 0.2, -0.5, 0)
    body.add(hip)
    const thigh = mesh(new THREE.CapsuleGeometry(0.17, 0.24, 4, 12), suit)
    thigh.position.y = -0.2
    hip.add(thigh)
    const knee = new THREE.Group()
    knee.position.y = -0.42
    hip.add(knee)
    const shin = mesh(new THREE.CapsuleGeometry(0.155, 0.22, 4, 12), suit)
    shin.position.y = -0.18
    knee.add(shin)
    const boot = mesh(new RoundedBoxGeometry(0.3, 0.2, 0.42, 2, 0.06), shade)
    boot.position.set(0, -0.4, 0.06)
    knee.add(boot)
    return { hip, knee }
  }
  const armL = arm(-1)
  const armR = arm(1)
  const legL = leg(-1)
  const legR = leg(1)

  // Data tether from the pack, trailing off-screen to the right
  const PACK = new THREE.Vector3(0, -0.3, -0.6)
  const curve = new THREE.CatmullRomCurve3([
    PACK.clone(),
    new THREE.Vector3(0.3, -1, -0.9),
    new THREE.Vector3(1, -1.5, -0.6),
    new THREE.Vector3(2, -1.3, -0.2),
    new THREE.Vector3(3, -1.8, -0.5),
    new THREE.Vector3(4.2, -1.5, -0.9),
    new THREE.Vector3(5.6, -2.3, -0.6),
    new THREE.Vector3(7.4, -2, -0.2),
  ])
  const tetherMat = new THREE.ShaderMaterial({
    vertexShader: tetherVertex,
    fragmentShader: tetherFragment,
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uAnchor: { value: new THREE.Vector3() } },
  })
  const tether = mesh(new THREE.TubeGeometry(curve, 140, 0.028, 6, false), tetherMat)
  tether.frustumCulled = false
  root.add(tether)

  const eye = { x: 0, y: 0 }
  const anchor = new THREE.Vector3()
  let waveT = -1
  let twirlT = -1
  let nextWave = 5

  return {
    root,
    wave: () => {
      if (waveT < 0) waveT = 0
    },
    twirl: () => {
      if (twirlT < 0) twirlT = 0
    },
    update: (t, dt, look) => {
      eye.x += (look.x - eye.x) * Math.min(1, dt * 2.5)
      eye.y += (look.y - eye.y) * Math.min(1, dt * 2.5)

      // Weightless drift, turned a little toward the page
      body.rotation.set(Math.sin(t * 0.23) * 0.14, -0.35 + Math.sin(t * 0.17) * 0.45, Math.sin(t * 0.29) * 0.18)
      if (twirlT >= 0) {
        twirlT += dt
        const k = Math.min(1, twirlT / 1.5)
        body.rotation.z += easeInOut(k) * Math.PI * 2
        if (k >= 1) twirlT = -1
      }
      head.rotation.set(-eye.y * 0.3, eye.x * 0.5, 0)

      armL.shoulder.rotation.z = -(0.6 + Math.sin(t * 0.8 + 1.3) * 0.08)
      armL.elbow.rotation.set(-0.6 + Math.sin(t * 0.75 + 2) * 0.12, 0, 0)
      armR.shoulder.rotation.z = 0.6 + Math.sin(t * 0.9) * 0.08
      armR.elbow.rotation.set(-0.5 + Math.sin(t * 0.7) * 0.12, 0, 0)
      legL.hip.rotation.set(Math.sin(t * 0.6 + 2.1) * 0.14, 0, -0.1)
      legR.hip.rotation.set(Math.sin(t * 0.6) * 0.14, 0, 0.1)
      legL.knee.rotation.x = 0.55 + Math.sin(t * 0.65 + 2.6) * 0.12
      legR.knee.rotation.x = 0.45 + Math.sin(t * 0.7 + 0.5) * 0.12

      // Every so often, a wave hello with the arm nearest the page
      nextWave -= dt
      if (nextWave <= 0 && waveT < 0) {
        waveT = 0
        nextWave = 9 + Math.random() * 6
      }
      if (waveT >= 0) {
        waveT += dt
        const k = Math.min(1, waveT / 2.4)
        const lift = Math.min(1, Math.sin(Math.PI * k) * 1.6)
        armL.shoulder.rotation.z = THREE.MathUtils.lerp(armL.shoulder.rotation.z, -2.5, lift)
        armL.elbow.rotation.x = THREE.MathUtils.lerp(armL.elbow.rotation.x, -0.15, lift)
        armL.elbow.rotation.z = Math.sin(waveT * 11) * 0.5 * lift
        if (k >= 1) waveT = -1
      }

      leds.forEach((m, i) => (m.visible = (t * (0.7 + i * 0.35) + i * 0.37) % 1 < 0.55))
      beacon.visible = t % 1.8 < 0.14

      anchor.copy(PACK).applyEuler(body.rotation).sub(PACK)
      tetherMat.uniforms.uAnchor.value.copy(anchor)
      tetherMat.uniforms.uTime.value = t
    },
  }
}
