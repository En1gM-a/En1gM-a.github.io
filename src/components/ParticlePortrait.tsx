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
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec4 v = texture2D(textureVelocity, uv);
  vec4 target = texture2D(tTarget, uv);
  vec3 vel = v.xyz;
  float loose = v.w;
  float h1 = hash(uv);
  float h2 = hash(uv + 7.31);

  // How close the pointer is to the rock, as seen on screen
  vec4 clip = uToClip * vec4(p.xyz, 1.0);
  float reach = 0.0;
  if (clip.w > 0.0) {
    vec2 d = clip.xy / clip.w * 0.5 + 0.5 - uPointer;
    d.x *= uAspect;
    reach = 1.0 - smoothstep(0.05, 0.12, length(d));
  }
  // The pointer hits like a piece of passing debris: the rocks it crosses are knocked along its path, each a
  // little off the line and out of the face, so they spray away and tumble instead of bursting outward
  vec2 sweep = vec2(uPointerMove.x * uAspect, uPointerMove.y) * 50.0 * reach * uStir;
  sweep *= min(1.0, 1.5 / max(length(sweep), 1e-4));
  float stir = length(sweep);
  float spread = (h1 - 0.5) * 1.2;
  vec2 knocked = mat2(cos(spread), sin(spread), -sin(spread), cos(spread)) * sweep * (0.6 + h2 * 0.8);
  vel += (uRight * knocked.x + uUp * knocked.y) * 0.16 + vec3(0.0, 0.0, (h2 - 0.5) * stir * 0.12);

  // Home on a spring, pulling harder from far away; it goes slack while the rock is loose or being swept
  vec3 home = target.xyz - p.xyz;
  float give = clamp((1.0 - stir * 0.55) * (1.0 - loose * 0.85), 0.08, 1.0);
  float pull = 0.6 * (1.0 + length(home) * 0.5 * (1.0 - loose)) * give * step(target.w, uTime);
  vel += home * pull * uDelta;

  // A slow current through the whole sculpture, livelier where the pointer stirs it. Far gentler than on
  // emotion's glyph (0.0025): at rest it moves a rock less than the gap between rocks, so the features still read
  vel += bitangentNoise(p.xyz * 0.9 + vec3(0.0, 0.0, uTime * 0.5)) * 0.0002 * (1.0 + stir * 6.0) * uDelta * 60.0;

  // Knocked loose, a rock coasts as if in open space before the spring reels it back in
  vel *= pow(mix(0.93, 0.965, loose), uDelta * 60.0);
  vel *= min(1.0, 0.8 / max(length(vel), 1e-4));

  // Knocked loose at once, and it drifts loose for about a second before the spring takes it back
  float knock = clamp(stir * 2.5, 0.0, 1.0);
  loose = knock > loose ? mix(loose, knock, min(1.0, uDelta * 15.0)) : loose - uDelta / 1.0;
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

// Each rock is one point sprite, drawn as a faceted stone in the fragment shader: tens of thousands of them,
// dense enough for the face to read, the way emotion's glyph is 78,400 points
const vertex = /* glsl */ `
attribute vec2 aRef;   // its texel in the simulation
attribute vec4 aSeed;  // tumble speed, phase, size in px, mineral cast (0 none, 1 violet, 2 rust)
attribute vec3 aColor; // the photo's colour there
uniform sampler2D tPosition;
uniform sampler2D tVelocity;
uniform sampler2D tTarget;
uniform float uUnit; // px per simulation unit
uniform float uTime;
uniform float uScatter;
uniform float uScan;
uniform float uSizeScale; // device px per px of rock at the camera's distance, times that distance
varying mat3 vTurn;
varying vec3 vColor;
varying vec2 vSeed;
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
  vec3 target = texture2D(tTarget, aRef).xyz;
  vec3 p = state.xyz * uUnit;
  // They drift apart as the hero scrolls away
  p += normalize(target * uUnit + vec3(0.0, 0.0, 1.0)) * uScatter * (0.4 + fract(aSeed.y * 13.37));
  // Each rock tumbles slowly on its own axis, and turns further the farther it is knocked from home,
  // so a hit sends it spinning and it rights itself as it settles
  vec3 axis = normalize(vec3(sin(aSeed.y * 7.1), cos(aSeed.y * 3.3), sin(aSeed.y * 5.7) + 0.3));
  vTurn = turn(axis, aSeed.y + uTime * aSeed.x + length(state.xyz - target) * 0.9);
  vColor = aColor;
  vSeed = vec2(aSeed.y, aSeed.w);
  vScan = 1.0 - smoothstep(0.0, 16.0, abs(target.y * uUnit - uScan));
  vGlow = state.w;
  vSpeed = length(texture2D(tVelocity, aRef).xyz);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(aSeed.z * uSizeScale / -mv.z, 64.0);
}
`

const fragment = /* glsl */ `
varying mat3 vTurn;
varying vec3 vColor;
varying vec2 vSeed;
varying float vScan;
varying float vGlow;
varying float vSpeed;
void main() {
  // An irregular outline, different for every rock
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  q.y = -q.y;
  float a = atan(q.y, q.x);
  float edge = 0.9 + 0.07 * sin(a * 3.0 + vSeed.x * 6.283) + 0.04 * sin(a * 5.0 + vSeed.x * 17.0);
  float r = length(q) / edge;
  if (r > 1.0) discard;
  // Flat facets: the stone's rounded surface, turned with the rock, snapped to a handful of directions
  vec3 n = vec3(q / edge, sqrt(1.0 - r * r));
  vec3 f = normalize(floor(vTurn * n * 1.4 + 0.5));
  // Lit from the upper left; the facets turned away catch a rim, warm violet shading to cyan at the edge
  float key = max(dot(f, vTurn * normalize(vec3(-0.45, 0.55, 0.7))), 0.0);
  float rim = pow(1.0 - n.z, 2.0);
  // Stone by the photo's brightness, contrast kept so the features read, mineral-tinted by the photo's own
  // colour (dark hair, warm skin, the gown's gold and blue); a few rocks with a violet or rusty cast
  float lum = dot(vColor, vec3(0.2126, 0.7152, 0.0722));
  float l = smoothstep(0.04, 0.92, lum);
  vec3 stone = mix(vec3(0.06, 0.07, 0.12), vec3(0.9, 0.91, 0.95), l * l * (3.0 - 2.0 * l));
  vec3 base = mix(stone, stone * (0.55 + vColor / max(lum, 0.05) * 0.45), 0.6);
  base *= vSeed.y > 1.5 ? vec3(1.12, 0.86, 0.66) : mix(vec3(1.0), vec3(0.95, 0.78, 1.18), vSeed.y);
  // The facets shade each stone only gently, so the photo's tones, not the lighting, carry the face
  vec3 c = base * (0.62 + 0.5 * key) + mix(vec3(0.89, 0.22, 1.0), vec3(0.13, 0.69, 1.0), rim) * rim * 0.18 * (0.3 + l);
  // A slightly darker rim on every stone separates it from its neighbours, so the surface reads as many rocks
  c *= 0.86 + 0.14 * (1.0 - r * r);
  // Knocked rocks heat up violet and, flung hard, burn out toward white, then cool back to stone
  c += vec3(0.38, 0.1, 1.0) * vGlow * 0.9 + vec3(0.05, 0.0, 0.1) * smoothstep(0.05, 0.5, vSpeed);
  c = mix(c, vec3(1.5), smoothstep(0.45, 1.0, vGlow) * 0.3);
  // The security sweep
  c = mix(c, vec3(0.4, 0.91, 0.98), vScan * 0.8);
  gl_FragColor = vec4(c, 1.0);
}
`

/**
 * The portrait as a sculpture of asteroids: tens of thousands of small faceted
 * rocks, packed as densely as the dots of emotion-agency.com's glyph, sampled
 * from the photo (its brightness and a hint of its colour, nearer on a gentle
 * dome, so the face has depth). Each one is simulated on the GPU: a spring holds
 * it to its place in the face and a slow current keeps it alive. A moving
 * pointer hits like passing debris: the rocks it crosses are knocked along its
 * path in a spray, tumbling and glowing, coast loose for a second, then cool and
 * settle home. They fly in to assemble behind the title, turn with the pointer
 * as one piece, take a periodic scan sweep, and drift apart as the hero scrolls
 * away. The source is a cut-out; only the person becomes rock.
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
      uSizeScale: { value: 1 },
    }
    const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms })
    let mesh: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null
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
      // About 48k rocks on a desktop and 22k on a phone, close enough to overlap into one surface
      const gap = Math.max(2.2, drawH / (wide ? 330 : 220))
      const cols = Math.round(drawW / gap)
      const rows = Math.round(drawH / gap)
      const unit = drawH / UNITS
      uniforms.uUnit.value = unit
      uniforms.uSizeScale.value = renderer.getPixelRatio() * camera.position.z

      const off = document.createElement("canvas")
      off.width = cols
      off.height = rows
      const octx = off.getContext("2d", { willReadFrequently: true })
      if (!octx) return
      octx.drawImage(img, 0, 0, cols, rows)
      const data = octx.getImageData(0, 0, cols, rows).data

      const homes: number[] = []
      const seeds: number[] = []
      const colors: number[] = []
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
          const i = (row * cols + col) * 4
          // Every part of the person becomes rock, dark ones included, so eyes, brows and hair read as dark stone
          if (data[i + 3] < 128) continue
          const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
          const x = (col + 0.5) * (drawW / cols) - drawW / 2
          const y = drawH / 2 - (row + 0.5) * (drawH / rows)
          // A gentle dome, the brighter parts a little nearer, so the face has depth when it turns
          const dome = Math.sqrt(Math.max(0, 1 - (x / (drawW * 0.55)) ** 2 - (y / (drawH * 0.55)) ** 2))
          // Top rows set off first, so the face assembles from the crown down
          homes.push(x, y, (dome * 0.8 + lum * 0.35 - 0.4) * drawH * 0.2 + (Math.random() - 0.5) * gap * 0.8, Math.random() * 0.55 + (row / rows) * 0.25)
          const mineral = Math.random()
          seeds.push(0.3 + Math.random() * 1.2, Math.random() * 6.283, gap * (1.55 + Math.random() * 0.4), mineral < 0.03 ? 1 : mineral < 0.06 ? 2 : 0)
          colors.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
        }
      const count = colors.length / 3

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

      const geo = new THREE.BufferGeometry()
      // Placed by the shader; three counts the points from this
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3))
      geo.setAttribute("aRef", new THREE.BufferAttribute(refs, 2))
      geo.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(seeds), 4))
      geo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(colors), 3))
      if (mesh) {
        mesh.geometry.dispose()
        mesh.geometry = geo
      } else {
        mesh = new THREE.Points(geo, material)
        // The rocks are placed in the shader, so the geometry's bounds say nothing about where they are
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
      material.dispose()
      renderer.dispose()
    }
  }, [active, src, reduce, instant])

  // In front of the intro film, which plays on behind the page as it arrives
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-[32] h-full w-full" />
}
