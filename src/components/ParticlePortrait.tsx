import { useEffect, useRef } from "react"
import { useReducedMotion } from "motion/react"
import * as THREE from "three"
import { GPUComputationRenderer, type Variable } from "three/addons/misc/GPUComputationRenderer.js"

const SETTLE = 2.4 // seconds for the rocks to fly in and come to rest
const SCAN_EVERY = 6.5 // seconds between security sweeps
const UNITS = 40 // the sculpture's height in simulation units, about the scale of emotion's glyph, which the physics below follows

// Bitangent noise by atyuwen (MIT, github.com/atyuwen/bitangent_noise): a divergence-free 3D
// field, so the rocks it carries swirl without bunching up or thinning out
const noise = /* glsl */ `
uvec2 pcg3d16(uvec3 p) {
  uvec3 v = p * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v.x += v.y * v.z; v.y += v.z * v.x;
  return v.xy;
}
vec3 gradient3d(uint hash) {
  vec3 g = vec3(uvec3(hash) & uvec3(0x80000u, 0x40000u, 0x20000u));
  return g * (1.0 / vec3(0x40000, 0x20000, 0x10000)) - 1.0;
}
vec3 bitangentNoise(vec3 p) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(p + dot(p, C.yyy));
  vec3 x0 = p - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = i + 32768.5;
  uvec2 h0 = pcg3d16(uvec3(i));
  uvec2 h1 = pcg3d16(uvec3(i + i1));
  uvec2 h2 = pcg3d16(uvec3(i + i2));
  uvec2 h3 = pcg3d16(uvec3(i + 1.0));
  vec3 p00 = gradient3d(h0.x); vec3 p01 = gradient3d(h0.y);
  vec3 p10 = gradient3d(h1.x); vec3 p11 = gradient3d(h1.y);
  vec3 p20 = gradient3d(h2.x); vec3 p21 = gradient3d(h2.y);
  vec3 p30 = gradient3d(h3.x); vec3 p31 = gradient3d(h3.y);
  vec4 m = clamp(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0, 1.0);
  vec4 mt = m * m;
  vec4 m4 = mt * mt;
  mt = mt * m;
  vec4 pdotx = vec4(dot(p00, x0), dot(p10, x1), dot(p20, x2), dot(p30, x3));
  vec4 temp = mt * pdotx;
  vec3 gradient0 = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
  gradient0 += m4.x * p00 + m4.y * p10 + m4.z * p20 + m4.w * p30;
  pdotx = vec4(dot(p01, x0), dot(p11, x1), dot(p21, x2), dot(p31, x3));
  temp = mt * pdotx;
  vec3 gradient1 = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
  gradient1 += m4.x * p01 + m4.y * p11 + m4.z * p21 + m4.w * p31;
  return cross(gradient0, gradient1) * 3918.76;
}
`

// Each rock's motion (xyz) and how loose it has been knocked (w), in simulation units per frame at 60 fps
const velocityShader = /* glsl */ `
uniform sampler2D tTarget; // its place in the sculpture (xyz) and when it starts heading there (w, s)
uniform float uTime;
uniform float uDelta;
uniform vec2 uPointer;     // in the canvas's 0..1 coordinates
uniform vec2 uPointerMove; // how far it moved this frame, in the same units
uniform float uAspect;
uniform float uStir;       // 1 while the pointer is moving, easing to 0 when it rests
uniform mat4 uToClip;      // simulation space to clip space
uniform vec3 uRight;       // the screen's axes, in simulation space
uniform vec3 uUp;
${noise}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec4 v = texture2D(textureVelocity, uv);
  vec4 target = texture2D(tTarget, uv);
  vec3 vel = v.xyz;
  float loose = v.w;

  // How close the pointer is to the rock, as seen on screen
  vec4 clip = uToClip * vec4(p.xyz, 1.0);
  float reach = 0.0;
  if (clip.w > 0.0) {
    vec2 d = clip.xy / clip.w * 0.5 + 0.5 - uPointer;
    d.x *= uAspect;
    reach = 1.0 - smoothstep(0.05, 0.12, length(d));
  }
  // Rocks under a moving pointer are swept along its path, the way a hand drags through water
  vec2 sweep = vec2(uPointerMove.x * uAspect, uPointerMove.y) * 50.0 * reach * uStir;
  sweep *= min(1.0, 1.5 / max(length(sweep), 1e-4));
  float stir = length(sweep);
  vel += (uRight * sweep.x + uUp * sweep.y) * 0.07;

  // Home on a spring, pulling harder from far away; it goes slack while the rock is loose or being swept
  vec3 home = target.xyz - p.xyz;
  float give = clamp((1.0 - stir * 0.55) * (1.0 - loose * 0.6), 0.2, 1.0);
  float pull = 0.6 * (1.0 + length(home) * 0.5 * (1.0 - loose)) * give * step(target.w, uTime);
  vel += home * pull * uDelta;

  // A slow current through the whole sculpture, livelier where the pointer stirs it. Far gentler than on
  // emotion's glyph (0.0025): at rest it moves a rock less than the gap between rocks, so the features still read
  vel += bitangentNoise(p.xyz * 0.9 + vec3(0.0, 0.0, uTime * 0.5)) * 0.0003 * (1.0 + stir * 8.0) * uDelta * 60.0;

  vel *= pow(0.93, uDelta * 60.0);
  vel *= min(1.0, 0.8 / max(length(vel), 1e-4));

  // Knocked loose at once, and it lingers loose for a moment before the spring takes it back
  float knock = clamp(stir * 2.5, 0.0, 1.0);
  loose = knock > loose ? mix(loose, knock, min(1.0, uDelta * 15.0)) : loose - uDelta / 0.35;
  gl_FragColor = vec4(vel, clamp(loose, 0.0, 1.0));
}
`

// Each rock's position (xyz) and how hot it glows (w)
const positionShader = /* glsl */ `
uniform float uDelta;
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec4 v = texture2D(textureVelocity, uv);
  // Flung or knocked loose, it flares at once, then cools slowly. Speed alone only warms it violet, so the
  // fly-in streams in calmly over the intro's hand-off; burning out white takes the pointer knocking it loose
  float heat = clamp(min((length(v.xyz) - 0.05) * 2.5, 0.4) + v.w * 0.7, 0.0, 1.0);
  float glow = mix(p.w, heat, min(1.0, uDelta * (heat > p.w ? 12.0 : 3.0)));
  gl_FragColor = vec4(p.xyz + v.xyz * uDelta * 60.0, glow);
}
`

const vertex = /* glsl */ `
attribute vec2 aRef;  // its texel in the simulation
attribute vec3 aSeed; // tumble speed, phase, size
attribute vec2 aTone; // brightness in the photo, mineral cast (0 none, 1 violet, 2 rust)
uniform sampler2D tPosition;
uniform sampler2D tVelocity;
uniform sampler2D tTarget;
uniform float uUnit; // px per simulation unit
uniform float uTime;
uniform float uScatter;
uniform float uScan;
varying vec3 vNormal;
varying vec2 vTone;
varying float vScan;
varying float vGlow;
varying float vSpeed;

mat3 turn(vec3 k, float a) {
  float c = cos(a);
  float s = sin(a);
  vec3 t = k * (1.0 - c);
  return mat3(t.x * k.x + c, t.y * k.x + s * k.z, t.z * k.x - s * k.y,
              t.x * k.y - s * k.z, t.y * k.y + c, t.z * k.y + s * k.x,
              t.x * k.z + s * k.y, t.y * k.z - s * k.x, t.z * k.z + c);
}

void main() {
  vec4 state = texture2D(tPosition, aRef);
  vec3 target = texture2D(tTarget, aRef).xyz * uUnit;
  vec3 p = state.xyz * uUnit;
  // They drift apart as the hero scrolls away
  p += normalize(target + vec3(0.0, 0.0, 1.0)) * uScatter * (0.4 + fract(aSeed.y * 13.37));
  // Each rock tumbles slowly on its own axis
  vec3 axis = normalize(vec3(sin(aSeed.y * 7.1), cos(aSeed.y * 3.3), sin(aSeed.y * 5.7) + 0.3));
  mat3 r = turn(axis, aSeed.y + uTime * aSeed.x);
  vNormal = normalize(normalMatrix * (r * normal));
  vTone = aTone;
  vScan = 1.0 - smoothstep(0.0, 16.0, abs(target.y - uScan));
  vGlow = state.w;
  vSpeed = length(texture2D(tVelocity, aRef).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p + r * position * aSeed.z, 1.0);
}
`

const fragment = /* glsl */ `
varying vec3 vNormal;
varying vec2 vTone;
varying float vScan;
varying float vGlow;
varying float vSpeed;
void main() {
  vec3 n = normalize(vNormal);
  // Rock lit from the upper left; the facets turned away catch a rim, warm violet shading to cyan at the edge
  float key = max(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0);
  float rim = pow(1.0 - max(n.z, 0.0), 2.5);
  // Stone by the photo's brightness, contrast kept so the face reads: dark slate to pale stone,
  // a few rocks with a violet or rusty mineral cast
  float l = pow(vTone.x, 1.5);
  vec3 base = mix(vec3(0.1, 0.12, 0.2), vec3(0.86, 0.88, 0.94), l);
  base *= vTone.y > 1.5 ? vec3(1.12, 0.86, 0.66) : mix(vec3(1.0), vec3(0.95, 0.78, 1.18), vTone.y);
  vec3 c = base * (0.25 + 0.95 * key) + mix(vec3(0.89, 0.22, 1.0), vec3(0.13, 0.69, 1.0), rim) * rim * 0.22 * (0.3 + l);
  // Knocked rocks heat up violet and, flung hard, burn out toward white, then cool back to stone
  c += vec3(0.38, 0.1, 1.0) * vGlow * 0.9 + vec3(0.05, 0.0, 0.1) * smoothstep(0.05, 0.5, vSpeed);
  c = mix(c, vec3(1.5), smoothstep(0.45, 1.0, vGlow) * 0.3);
  // The security sweep
  c = mix(c, vec3(0.4, 0.91, 0.98), vScan * 0.8);
  gl_FragColor = vec4(c, 1.0);
}
`

/**
 * The portrait as a sculpture of asteroids: thousands of small faceted rocks,
 * sampled from the photo (brighter areas lighter, and nearer on a gentle dome,
 * so the face has depth). Each one is simulated on the GPU, after the glyph on
 * emotion-agency.com: a spring holds it to its place in the face and a slow
 * current keeps it alive. A moving pointer sweeps the rocks it passes along its
 * path, swirling them; knocked loose, they glow violet, hang a moment, cool and
 * drift home. They fly in to assemble behind the title, tumble, turn with the
 * pointer as one piece, take a periodic scan sweep, and drift apart as the hero
 * scrolls away. The source is a cut-out; only the person becomes rock.
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
      tPosition: { value: null as THREE.Texture | null },
      tVelocity: { value: null as THREE.Texture | null },
      tTarget: { value: null as THREE.Texture | null },
      uUnit: { value: 1 },
      uTime: { value: 0 },
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
    // Float render targets where the GPU has them, half floats otherwise (enough for this scale)
    const dataType = renderer.extensions.has("EXT_color_buffer_float") ? THREE.FloatType : THREE.HalfFloatType
    let gpu: GPUComputationRenderer | null = null
    let positions: Variable | null = null
    let velocities: Variable | null = null
    let target: THREE.DataTexture | null = null

    const img = new Image()
    img.src = src
    let w = 0
    let h = 0
    let drawH = 0
    let raf = 0
    let start = 0
    let last = 0
    let built = false
    let ready = false
    let running = false
    let onScreen = true
    let disposed = false
    const pointer = { x: 1e5, y: 1e5, nx: 0, ny: 0, movedAt: -1e9 }
    const tilt = new THREE.Vector2()
    const lean = new THREE.Vector2()
    const here = new THREE.Vector2()
    const prevPointer = new THREE.Vector2(-1, -1)
    let stir = 0
    const toClip = new THREE.Matrix4()
    const unitScale = new THREE.Matrix4()
    const inverseTurn = new THREE.Quaternion()

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
      const top = h * (wide ? 0.04 : 0.08)
      const cy = top + drawH / 2
      const gap = Math.max(3.5, drawH / (wide ? 140 : 110))
      const cols = Math.round(drawW / gap)
      const rows = Math.round(drawH / gap)
      const unit = drawH / UNITS
      uniforms.uUnit.value = unit

      const off = document.createElement("canvas")
      off.width = cols
      off.height = rows
      const octx = off.getContext("2d", { willReadFrequently: true })
      if (!octx) return
      octx.drawImage(img, 0, 0, cols, rows)
      const data = octx.getImageData(0, 0, cols, rows).data

      const homes: number[] = []
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
          // Top rows set off first, so the face assembles from the crown down
          homes.push(x, y, (dome * 0.8 + lift * 0.35 - 0.4) * drawH * 0.2 + (Math.random() - 0.5) * gap * 2, Math.random() * 0.55 + (row / rows) * 0.25)
          seeds.push(0.3 + Math.random() * 1.2, Math.random() * 6.283, gap * (0.28 + 0.48 * lift))
          const mineral = Math.random()
          tones.push(lift, mineral < 0.03 ? 1 : mineral < 0.06 ? 2 : 0)
        }
      const count = tones.length / 2

      // The simulation: one texel per rock
      gpu?.dispose()
      target?.dispose()
      const size = Math.max(2, Math.ceil(Math.sqrt(count)))
      gpu = new GPUComputationRenderer(size, size, renderer)
      gpu.setDataType(dataType)
      const position0 = gpu.createTexture()
      const velocity0 = gpu.createTexture()
      const starts = position0.image.data as Float32Array
      const targets = new Float32Array(size * size * 4)
      const refs = new Float32Array(count * 2)
      // A rebuild (resize) or a skipped intro starts assembled; the first build flies in from all around
      const fly = !built && !instant && !reduce
      for (let k = 0; k < count; k++) {
        const [x, y, z, wake] = homes.slice(k * 4, k * 4 + 4)
        targets.set([x / unit, y / unit, z / unit, fly ? wake : 0], k * 4)
        const from = fly ? [(Math.random() - 0.5) * w * 1.6, (Math.random() - 0.5) * h * 1.6, (Math.random() - 0.5) * h] : [x, y, z]
        starts.set([from[0] / unit, from[1] / unit, from[2] / unit, 0], k * 4)
        refs.set([((k % size) + 0.5) / size, (Math.floor(k / size) + 0.5) / size], k * 2)
      }
      target = new THREE.DataTexture(targets, size, size, THREE.RGBAFormat, THREE.FloatType)
      target.needsUpdate = true
      velocities = gpu.addVariable("textureVelocity", velocityShader, velocity0)
      positions = gpu.addVariable("texturePosition", positionShader, position0)
      gpu.setVariableDependencies(velocities, [positions, velocities])
      gpu.setVariableDependencies(positions, [positions, velocities])
      Object.assign(velocities.material.uniforms, {
        tTarget: { value: target },
        uTime: { value: 0 },
        uDelta: { value: 0 },
        uPointer: { value: new THREE.Vector2(-10, -10) },
        uPointerMove: { value: new THREE.Vector2() },
        uAspect: { value: w / h },
        uStir: { value: 0 },
        uToClip: { value: toClip },
        uRight: { value: new THREE.Vector3(1, 0, 0) },
        uUp: { value: new THREE.Vector3(0, 1, 0) },
      })
      positions.material.uniforms.uDelta = { value: 0 }
      // Without float render targets there is no simulation: the rocks just rest in place
      if (gpu.init() !== null) {
        gpu.dispose()
        gpu = null
      }
      uniforms.tTarget.value = target
      uniforms.tPosition.value = gpu ? gpu.getCurrentRenderTarget(positions).texture : position0
      uniforms.tVelocity.value = gpu ? gpu.getCurrentRenderTarget(velocities).texture : velocity0

      const geo = new THREE.InstancedBufferGeometry().copy(rock as unknown as THREE.InstancedBufferGeometry)
      geo.setAttribute("aRef", new THREE.InstancedBufferAttribute(refs, 2))
      geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(seeds), 3))
      geo.setAttribute("aTone", new THREE.InstancedBufferAttribute(new Float32Array(tones), 2))
      geo.instanceCount = count
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
      built = true
    }

    const simulate = (t: number, dt: number) => {
      if (!gpu || !mesh || !positions || !velocities) return
      const u = velocities.material.uniforms
      // The pointer, in the canvas's 0..1 coordinates, and how far it moved since the last frame
      const inside = pointer.x < 1e4
      here.set(pointer.x / w, 1 - pointer.y / h)
      if (inside && prevPointer.x >= 0) u.uPointerMove.value.subVectors(here, prevPointer)
      else u.uPointerMove.value.set(0, 0)
      if (inside) prevPointer.copy(here)
      else prevPointer.set(-1, -1)
      if (inside) u.uPointer.value.copy(here)
      else u.uPointer.value.set(-10, -10)
      stir += ((performance.now() - pointer.movedAt < 150 ? 1 : 0) - stir) * Math.min(1, dt * 8)
      u.uStir.value = stir
      u.uAspect.value = w / h
      u.uTime.value = t
      u.uDelta.value = dt
      positions.material.uniforms.uDelta.value = dt
      // Simulation space to the screen: the sculpture's own placement and turn, scaled from units to px
      mesh.updateMatrixWorld()
      toClip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld).multiply(unitScale.makeScale(uniforms.uUnit.value, uniforms.uUnit.value, uniforms.uUnit.value))
      inverseTurn.copy(mesh.quaternion).invert()
      u.uRight.value.set(1, 0, 0).applyQuaternion(inverseTurn)
      u.uUp.value.set(0, 1, 0).applyQuaternion(inverseTurn)
      gpu.compute()
      uniforms.tPosition.value = gpu.getCurrentRenderTarget(positions).texture
      uniforms.tVelocity.value = gpu.getCurrentRenderTarget(velocities).texture
    }

    const render = (t: number, dt: number, still: boolean) => {
      if (!mesh) return
      const scroll = still ? 0 : Math.min(1, Math.max(0, window.scrollY / h))
      canvas.style.opacity = String(1 - THREE.MathUtils.smoothstep(scroll, 0.55, 0.95))
      uniforms.uTime.value = still ? SETTLE + 10 : t
      uniforms.uScatter.value = scroll * scroll * 340
      // The whole sculpture turns toward the pointer, and sways a little on its own
      tilt.lerp(lean.set(pointer.ny * 0.18, pointer.nx * 0.32), still ? 1 : 0.05)
      mesh.rotation.set(-tilt.x + (still ? 0 : Math.sin(t * 0.5) * 0.03), tilt.y + (still ? 0 : Math.sin(t * 0.37) * 0.08), 0)
      if (!still) simulate(t, dt)
      // Periodic security sweep down the assembled portrait
      const cycle = !still && t > SETTLE ? ((t - SETTLE) % SCAN_EVERY) / 1.6 : 2
      uniforms.uScan.value = cycle <= 1 ? drawH / 2 - drawH * cycle : 1e5
      renderer.render(scene, camera)
    }

    const loop = (now: number) => {
      // A long gap (a hidden tab) resumes as one ordinary frame, so nothing is flung by the jump
      const dt = Math.min(1 / 30, (now - last) / 1000)
      last = now
      render((now - start) / 1000, dt, false)
      raf = requestAnimationFrame(loop)
    }
    const play = () => {
      if (reduce || !ready || running || document.hidden || !onScreen) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    const pause = () => {
      running = false
      cancelAnimationFrame(raf)
    }

    const onResize = () => {
      build()
      if (reduce) render(0, 0, true)
    }
    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = e.clientX - rect.left
      pointer.y = e.clientY - rect.top
      pointer.nx = (e.clientX / window.innerWidth) * 2 - 1
      pointer.ny = (e.clientY / window.innerHeight) * 2 - 1
      pointer.movedAt = performance.now()
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
      // Every program compiles in the background, the simulation's too, so the hand-over from the intro never stutters.
      // The passes compile against their own render target, as they will run (it changes the program's output stage)
      const passes = new THREE.Scene()
      for (const v of [velocities, positions]) if (gpu && v) passes.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), v.material))
      if (gpu && positions) renderer.setRenderTarget(gpu.getCurrentRenderTarget(positions))
      const compiling = renderer.compileAsync(passes, camera)
      renderer.setRenderTarget(null)
      Promise.all([renderer.compileAsync(scene, camera), compiling])
        .catch(() => {})
        .then(() => {
          passes.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose())
          if (disposed) return
          ready = true
          start = performance.now() - (instant ? SETTLE * 1000 : 0)
          // Reduced motion: a still sculpture, no fly-in, tumble, simulation, sweep or scatter
          if (reduce) render(0, 0, true)
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
      gpu?.dispose()
      target?.dispose()
      rock.dispose()
      material.dispose()
      renderer.dispose()
    }
  }, [active, src, reduce, instant])

  // In front of the intro film, which plays on behind the page as it arrives
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-[32] h-full w-full" />
}
