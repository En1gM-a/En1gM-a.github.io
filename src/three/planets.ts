import * as THREE from "three"
import type { Palette } from "./voyage"

/**
 * Planet surfaces in depth without a per-frame cost: each surface (and cloud
 * layer) is baked once into a mipmapped equirectangular texture with as much
 * noise detail as we like; every frame then only reads it, adds bump-lit
 * relief, moving winds and clouds, and the atmosphere.
 *
 * The palette decides the world: green and teal ones are alive (oceans,
 * continents, ice, clouds, city lights at night), ember ones are molten
 * (glowing rifts), the rest are gas giants (bands, flow streaks, a storm;
 * a yellow one flickers with lightning).
 */

export type PlanetKind = 0 | 1 | 2 // gas giant, living world, molten world

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)

export function planetKind(p: Palette): PlanetKind {
  const [br, bg] = hex(p.b)
  if (bg > br * 2.5) return 1
  if (br > 0.6 && bg < 0.35) return 2
  return 0
}

const sharedVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`

const bakeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const noiseGlsl = /* glsl */ `
  float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return v; }
  float ridge(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 6; i++) { float n = 1.0 - abs(noise(p) * 2.0 - 1.0); v += a * n * n; p = p * 2.07 + vec3(4.1, 1.3, 7.7); a *= 0.5; } return v; }
  vec3 twist(vec3 v, vec3 k, float a) { float c = cos(a); float s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
`

// Surface (rgb colour, a height) or cloud cover (r), in the sphere's own UV layout
const bakeFragment = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  uniform float uSeed;
  uniform float uBands;
  uniform int uKind;
  uniform int uLayer;
  varying vec2 vUv;
  ${noiseGlsl}
  void main() {
    // Same mapping as THREE.SphereGeometry, so the texture wraps without a seam
    float phi = vUv.x * 6.2831853;
    float theta = (1.0 - vUv.y) * 3.1415927;
    vec3 p = vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
    vec3 s = p + uSeed;

    if (uLayer == 1) {
      // Patchy cloud, sheared along the winds, thinner toward the poles
      float c = fbm(vec3(p.x, p.y * 2.2, p.z) * 2.4 + uSeed * 3.0 + fbm(p * 3.0 + uSeed) * 1.6);
      float a = smoothstep(0.5, 0.76, c) * (0.6 + 0.4 * (1.0 - smoothstep(0.35, 0.95, abs(p.y))));
      gl_FragColor = vec4(a, a, a, 1.0);
      return;
    }

    if (uKind == 0) {
      // Gas giant: zonal bands bent by turbulence, long flow streaks, and one great storm twisting it all
      vec3 c0 = normalize(vec3(sin(uSeed * 1.7), (fract(uSeed * 0.37) - 0.5) * 0.8, cos(uSeed * 1.7)));
      float storm = 1.0 - smoothstep(0.0, 0.34, distance(p, c0));
      vec3 q = twist(p, c0, storm * storm * 5.0);
      float w = fbm(q * 2.2 + uSeed);
      float w2 = fbm(q * 5.5 + w * 2.5 + uSeed);
      float lat = q.y + (w - 0.5) * 0.24 + (w2 - 0.5) * 0.07;
      float band = sin(lat * uBands * 1.3) * 0.5 + 0.5;
      float fine = sin(lat * uBands * 4.1 + w * 5.0) * 0.5 + 0.5;
      float streak = fbm(vec3(q.x * 1.4, q.y * 11.0, q.z * 1.4) * 2.5 + w2 * 1.8 + uSeed);
      float h = band * 0.55 + fine * 0.2 + streak * 0.25;
      vec3 col = mix(uA, uB, smoothstep(0.18, 0.82, h));
      col = mix(col, uC, smoothstep(0.62, 0.95, fine * 0.5 + streak * 0.7) * 0.7);
      col = mix(col, mix(uC, uB, 0.35), storm * smoothstep(0.35, 0.7, fbm(q * 9.0 + uSeed)));
      col *= 0.86 + 0.28 * fbm(s * 16.0);
      gl_FragColor = vec4(col, h);
    } else if (uKind == 1) {
      // Living world: oceans, continents with ridged highlands, polar ice
      float cont = fbm(s * 1.6 + fbm(s * 3.0) * 0.8);
      float mount = ridge(s * 4.5);
      float h = cont + (mount - 0.4) * 0.18 * smoothstep(0.5, 0.6, cont);
      float land = smoothstep(0.5, 0.515, h);
      vec3 ocean = mix(uA, uB, smoothstep(0.25, 0.5, h));
      vec3 ground = mix(uB * 0.8, uC * 0.9, smoothstep(0.52, 0.72, h));
      ground = mix(ground, uA * 1.6 + 0.04, smoothstep(0.55, 0.85, mount) * 0.35);
      vec3 col = mix(ocean, ground, land);
      float ice = smoothstep(0.78, 0.9, abs(p.y) + (fbm(s * 6.0) - 0.5) * 0.12);
      col = mix(col, vec3(0.9, 0.95, 1.0), ice);
      gl_FragColor = vec4(col, max(h, 0.5));
    } else {
      // Molten world: dark cooled crust split by glowing rifts
      float crust = fbm(s * 2.4);
      float rift = ridge(s * 3.2 + crust * 1.2);
      float glow = smoothstep(0.62, 0.86, rift);
      vec3 col = mix(uA * 0.9, uB * 0.55, crust);
      col = mix(col, uC, glow);
      gl_FragColor = vec4(col, crust * 0.6 + (1.0 - glow) * 0.4);
    }
  }
`

const surfaceFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uReady;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uAtmo;
  uniform vec3 uLight;
  uniform float uTime;
  uniform float uFlow;
  uniform float uBands;
  uniform float uSpark;
  uniform int uKind;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;

  vec3 bumpNormal(vec3 n, float h, float k) {
    vec3 dpx = dFdx(vViewPos);
    vec3 dpy = dFdy(vViewPos);
    vec3 r1 = cross(dpy, n);
    vec3 r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    vec2 dh = vec2(dFdx(h), dFdy(h)) * k;
    return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
  }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 uv = vUv;
    // Zonal winds: each band of latitude drifts at its own speed
    uv.x += uTime * uFlow * sin((uv.y - 0.5) * uBands * 2.2);
    vec4 tex = uReady > 0.5 ? texture2D(uMap, uv) : vec4(mix(uA, uB, 0.5 + 0.5 * sin((uv.y - 0.5) * uBands * 3.0)), 0.5);
    vec3 n = normalize(vNormalV);
    vec3 N = bumpNormal(n, tex.a, uKind == 1 ? 0.3 : uKind == 2 ? 0.2 : 0.12);
    vec3 V = normalize(-vViewPos);
    float ndl = dot(N, uLight);
    float day = smoothstep(-0.16, 0.7, ndl);
    float night = 1.0 - smoothstep(-0.15, 0.1, ndl);
    vec3 col = tex.rgb * (0.035 + day * 1.15);

    if (uKind == 1) {
      // Oceans catch the sun; cities glow on the night side
      float ocean = 1.0 - smoothstep(0.5, 0.506, tex.a);
      vec3 H = normalize(uLight + V);
      col += vec3(1.0, 0.96, 0.88) * pow(max(dot(n, H), 0.0), 60.0) * ocean * day * 0.9;
      float city = step(0.985, hash2(floor(vUv * vec2(900.0, 450.0)))) * (1.0 - ocean) * (1.0 - smoothstep(0.6, 0.68, tex.a));
      col += vec3(1.0, 0.78, 0.45) * city * night * 1.4;
    } else if (uKind == 2) {
      // Rifts glow, strongest where the sun isn't
      float glow = smoothstep(0.55, 0.95, max(tex.r, max(tex.g, tex.b)));
      col += tex.rgb * glow * (0.55 + 0.45 * night) * (0.85 + 0.15 * sin(uTime * 1.3 + vUv.x * 40.0));
    } else if (uSpark > 0.0) {
      // Lightning flickering in the night-side storms
      float flash = step(0.9993, hash2(floor(uv * vec2(160.0, 80.0)) + floor(uTime * 6.0)));
      col += vec3(0.95, 0.9, 0.6) * flash * night * uSpark * 2.0;
    }

    // Warm light where day meets night, and the atmosphere's rim (brightest on the lit side)
    float term = smoothstep(-0.25, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.35, ndl));
    col += uAtmo * term * 0.16;
    float rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
    col += uAtmo * rim * (0.18 + smoothstep(-0.2, 0.6, dot(n, uLight)));
    gl_FragColor = vec4(col, 1.0);
  }
`

const cloudFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uReady;
  uniform vec3 uLight;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    vec2 uv = vUv;
    uv.x += uTime * 0.004;
    float a = uReady > 0.5 ? texture2D(uMap, uv).r : 0.0;
    vec3 n = normalize(vNormalV);
    float day = smoothstep(-0.12, 0.6, dot(n, uLight));
    float edge = 1.0 - max(dot(n, normalize(-vViewPos)), 0.0);
    gl_FragColor = vec4(vec3(0.04 + day * 1.05), a * 0.8 * (0.25 + 0.75 * day) * (1.0 - edge * edge * 0.6));
  }
`

export type PlanetLook = {
  kind: PlanetKind
  surface: THREE.ShaderMaterial
  /** A cloud shell, for living worlds */
  clouds: THREE.ShaderMaterial | null
  setTime: (t: number) => void
  dispose: () => void
}

export function createPlanetLook(pal: Palette, index: number, light: THREE.Vector3): PlanetLook {
  const kind = planetKind(pal)
  const bands = 6 + (index % 3) * 4
  const surface = new THREE.ShaderMaterial({
    vertexShader: sharedVertex,
    fragmentShader: surfaceFragment,
    uniforms: {
      uMap: { value: null },
      uReady: { value: 0 },
      uA: { value: new THREE.Color(pal.a) },
      uB: { value: new THREE.Color(pal.b) },
      uAtmo: { value: new THREE.Color(pal.atmo) },
      uLight: { value: light },
      uTime: { value: 0 },
      // Gas giants churn; solid worlds just turn
      uFlow: { value: kind === 0 ? 0.0035 : 0 },
      uBands: { value: bands },
      uSpark: { value: kind === 0 && hex(pal.c)[2] < 0.2 ? 1 : 0 },
      uKind: { value: kind },
    },
  })
  const clouds =
    kind === 1
      ? new THREE.ShaderMaterial({
          vertexShader: sharedVertex,
          fragmentShader: cloudFragment,
          transparent: true,
          depthWrite: false,
          uniforms: { uMap: { value: null }, uReady: { value: 0 }, uLight: { value: light }, uTime: { value: 0 } },
        })
      : null
  return {
    kind,
    surface,
    clouds,
    setTime: (t) => {
      surface.uniforms.uTime.value = t
      if (clouds) clouds.uniforms.uTime.value = t
    },
    dispose: () => {
      surface.dispose()
      clouds?.dispose()
    },
  }
}

/**
 * Bakes surfaces on demand, one GPU pass per texture. Call bake() when the GPU
 * is idle (one planet at a time), never in the middle of the intro.
 */
export function createPlanetBaker(renderer: THREE.WebGLRenderer, { mobile }: { mobile: boolean }) {
  const scene = new THREE.Scene()
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const mat = new THREE.ShaderMaterial({
    vertexShader: bakeVertex,
    fragmentShader: bakeFragment,
    uniforms: {
      uA: { value: new THREE.Color() },
      uB: { value: new THREE.Color() },
      uC: { value: new THREE.Color() },
      uSeed: { value: 0 },
      uBands: { value: 6 },
      uKind: { value: 0 },
      uLayer: { value: 0 },
    },
  })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
  quad.frustumCulled = false
  scene.add(quad)
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  const targets: THREE.WebGLRenderTarget[] = []
  // The noise shader is heavy for Direct3D's compiler: compile it off the main thread before the first bake
  const ready = renderer.compileAsync(scene, cam).catch(() => {})

  const pass = (w: number, h: number, format: THREE.PixelFormat) => {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      format,
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      anisotropy,
    })
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(rt)
    renderer.render(scene, cam)
    renderer.setRenderTarget(previous)
    targets.push(rt)
    return rt
  }

  return {
    ready,
    bake: (look: PlanetLook, pal: Palette, index: number) => {
      const u = mat.uniforms
      u.uA.value.set(pal.a)
      u.uB.value.set(pal.b)
      u.uC.value.set(pal.c)
      u.uSeed.value = index * 7.31 + 1.3
      u.uBands.value = look.surface.uniforms.uBands.value
      u.uKind.value = look.kind
      u.uLayer.value = 0
      const surface = mobile ? pass(1024, 512, THREE.RGBAFormat) : pass(1280, 640, THREE.RGBAFormat)
      look.surface.uniforms.uMap.value = surface.texture
      look.surface.uniforms.uReady.value = 1
      if (look.clouds) {
        u.uLayer.value = 1
        const cover = mobile ? pass(512, 256, THREE.RedFormat) : pass(1024, 512, THREE.RedFormat)
        look.clouds.uniforms.uMap.value = cover.texture
        look.clouds.uniforms.uReady.value = 1
      }
    },
    dispose: () => {
      targets.forEach((t) => t.dispose())
      quad.geometry.dispose()
      mat.dispose()
    },
  }
}
