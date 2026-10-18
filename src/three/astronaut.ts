import * as THREE from "three"
import { loadSuit } from "./emu"

/**
 * A crew member in NASA's EVA suit, drifting weightless on a glowing data
 * tether. The suit is a rigid model (a pressurised suit barely bends), so the
 * life comes from the drift, the turn toward the cursor, twirls and the
 * physics the caller applies to the root.
 */
export type Astronaut = {
  root: THREE.Group
  /** Whether the suit has arrived (it streams in after the intro) */
  loaded: () => boolean
  /** look: -1..1, where the cursor sits relative to the astronaut */
  update: (t: number, dt: number, look: { x: number; y: number }) => void
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
    vec3 col = mix(vec3(0.62, 0.66, 0.72), vec3(0.45, 0.95, 1.0), pulse);
    float a = (0.5 + pulse * 0.5) * (1.0 - smoothstep(0.55, 1.0, vU));
    gl_FragColor = vec4(col * (0.8 + pulse * 0.8), a);
  }
`

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

export function createAstronaut({
  tether = true,
  shadows = false,
  onReady,
  warm,
}: {
  tether?: boolean
  shadows?: boolean
  onReady?: () => void
  /** Prepare the suit (compile its shaders) before it joins the scene, so its arrival never stalls a frame */
  warm?: (suit: THREE.Object3D) => Promise<unknown>
} = {}): Astronaut {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  let ready = false
  loadSuit()
    .then(async (suit) => {
      suit.traverse((o) => {
        // The densest small parts (visor, helmet shell) add little to the shadow but a lot to its cost
        o.castShadow = shadows && !o.userData.heavy
        o.receiveShadow = shadows
      })
      await warm?.(suit).catch(() => {})
      body.add(suit)
      ready = true
      onReady?.()
    })
    // Without the suit there is nothing to wait for
    .catch(() => onReady?.())

  // Data tether from the backpack, trailing off-screen to the right
  const PACK = new THREE.Vector3(0, -0.45, -0.5)
  let line: THREE.Mesh | null = null
  let tetherMat: THREE.ShaderMaterial | null = null
  if (tether) {
    const curve = new THREE.CatmullRomCurve3([
      PACK.clone(),
      new THREE.Vector3(0.3, -1.1, -0.8),
      new THREE.Vector3(1, -1.6, -0.5),
      new THREE.Vector3(2, -1.4, -0.1),
      new THREE.Vector3(3, -1.9, -0.4),
      new THREE.Vector3(4.2, -1.6, -0.8),
      new THREE.Vector3(5.6, -2.4, -0.5),
      new THREE.Vector3(7.4, -2.1, -0.1),
    ])
    tetherMat = new THREE.ShaderMaterial({
      vertexShader: tetherVertex,
      fragmentShader: tetherFragment,
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAnchor: { value: new THREE.Vector3() } },
    })
    line = new THREE.Mesh(new THREE.TubeGeometry(curve, 140, 0.026, 6, false), tetherMat)
    line.frustumCulled = false
    line.visible = false
    root.add(line)
  }

  const eye = { x: 0, y: 0 }
  const anchor = new THREE.Vector3()
  let twirlT = -1

  return {
    root,
    loaded: () => ready,
    twirl: () => {
      if (twirlT < 0) twirlT = 0
    },
    update: (t, dt, look) => {
      eye.x += (look.x - eye.x) * Math.min(1, dt * 2)
      eye.y += (look.y - eye.y) * Math.min(1, dt * 2)

      // Weightless drift, turned toward the page; he turns a little to watch the cursor
      body.rotation.set(
        Math.sin(t * 0.21) * 0.1 - eye.y * 0.18,
        -0.5 + Math.sin(t * 0.13) * 0.3 + eye.x * 0.4,
        Math.sin(t * 0.17) * 0.1,
      )
      if (twirlT >= 0) {
        twirlT += dt
        const k = Math.min(1, twirlT / 1.6)
        body.rotation.z += easeInOut(k) * Math.PI * 2
        if (k >= 1) twirlT = -1
      }

      if (line && tetherMat) {
        line.visible = ready
        anchor.copy(PACK).applyEuler(body.rotation).sub(PACK)
        tetherMat.uniforms.uAnchor.value.copy(anchor)
        tetherMat.uniforms.uTime.value = t
      }
    },
  }
}
