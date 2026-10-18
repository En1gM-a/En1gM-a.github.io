import * as THREE from "three"

/**
 * Hubble-palette gas clouds: teal glow, warm dust with dark lanes and bright
 * ionisation rims. Each cloud is baked once into a texture, then drawn as an
 * additive quad that billows slowly, so a screenful of nebula costs two
 * texture reads per pixel instead of live noise.
 */

/** gas, dust, deep dust, rim — as 0xRRGGBB */
export type NebulaPalette = [number, number, number, number]

export const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const bakeFragment = /* glsl */ `
  uniform vec3 uGas;
  uniform vec3 uDust;
  uniform vec3 uDeep;
  uniform vec3 uRim;
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
    vec2 q = p * 1.6 + uSeed;
    vec2 w = vec2(fbm(q), fbm(q + vec2(5.2, 1.3)));
    vec2 w2 = vec2(fbm(q + 3.0 * w + vec2(1.7, 9.2)), fbm(q + 3.0 * w + vec2(8.3, 2.8)));
    float n = fbm(q + 3.2 * w2);
    // (GLSL leaves reversed smoothstep edges undefined, and Direct3D-backed browsers take that literally)
    float edge = 1.0 - smoothstep(0.2, 1.0, length(p * vec2(1.0, 1.1)) + (w.x - 0.5) * 0.6);
    float gas = smoothstep(0.25, 0.85, fbm(q * 0.7 + w * 1.5 + 4.0));
    float dust = smoothstep(0.45, 0.78, n);
    float lit = fbm(q + 3.2 * w2 + vec2(0.03, -0.03));
    float rim = clamp((n - lit) * 16.0, 0.0, 1.0) * dust;
    float lanes = smoothstep(0.55, 0.75, fbm(q * 2.4 + w * 2.0 + 11.0));
    vec3 col = uGas * gas * 0.85 + uGas * pow(gas, 3.0) * 0.45;
    col = mix(col, mix(uDeep, uDust, n), dust * 0.85);
    col *= 1.0 - lanes * 0.7;
    col += uRim * rim * 1.3;
    gl_FragColor = vec4(col * edge, 1.0);
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
    col *= 1.0 - smoothstep(0.3, 0.5, length(vUv - 0.5));
    gl_FragColor = vec4(col, uOpacity);
  }
`

const rgb = (hex: number) => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255)

/**
 * Bake one texture per palette (one-time GPU pass each). The noise shader is heavy for Direct3D's
 * compiler, so it compiles off the main thread first.
 */
export async function bakeNebulae(renderer: THREE.WebGLRenderer, palettes: NebulaPalette[], size: number) {
  const scene = new THREE.Scene()
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const mat = new THREE.ShaderMaterial({
    vertexShader: quadVertex,
    fragmentShader: bakeFragment,
    uniforms: {
      uGas: { value: new THREE.Vector3() },
      uDust: { value: new THREE.Vector3() },
      uDeep: { value: new THREE.Vector3() },
      uRim: { value: new THREE.Vector3() },
      uSeed: { value: 0 },
    },
  })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
  scene.add(quad)
  await renderer.compileAsync(scene, cam).catch(() => {})
  const previous = renderer.getRenderTarget()
  const targets = palettes.map(([gas, dust, deep, rim], i) => {
    const rt = new THREE.WebGLRenderTarget(size, size)
    mat.uniforms.uGas.value.copy(rgb(gas))
    mat.uniforms.uDust.value.copy(rgb(dust))
    mat.uniforms.uDeep.value.copy(rgb(deep))
    mat.uniforms.uRim.value.copy(rgb(rim))
    mat.uniforms.uSeed.value = 3.7 + i * 11.3
    renderer.setRenderTarget(rt)
    renderer.clear()
    renderer.render(scene, cam)
    return rt
  })
  renderer.setRenderTarget(previous)
  quad.geometry.dispose()
  mat.dispose()
  return targets
}

/** An additive, billowing quad showing a baked nebula; set uniforms.uOpacity to fade it */
export function nebulaMaterial(map: THREE.Texture | null = null) {
  return new THREE.ShaderMaterial({
    vertexShader: quadVertex,
    fragmentShader: cloudFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uMap: { value: map }, uTime: { value: Math.random() * 100 }, uOpacity: { value: 0 } },
  })
}
