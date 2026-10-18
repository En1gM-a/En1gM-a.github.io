import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js"

/** Head to boots, in scene units */
const HEIGHT = 2.4

// The export carries a second copy of a few parts, which would z-fight
const DUPLICATES = new Set(["EMU:emusuit21_jetpack2SG", "EMU:emusuit21_emusuit5_lambert5SG", "EMU:emusuit21_blinn1SG"])
const VISOR = "EMU:emusuit21_emusuit5_blinn1SG"

let suit: Promise<THREE.Group> | null = null

/**
 * NASA's Extravehicular Mobility Unit with the Manned Maneuvering Unit, from
 * NASA's 3D Resources (github.com/nasa/NASA-3D-Resources). Loaded once; each
 * caller gets its own clone, sharing geometry and materials.
 */
export function loadSuit(): Promise<THREE.Group> {
  suit ??= fetchSuit()
  return suit.then((s) => s.clone(true))
}

function fetchSuit() {
  return new Promise<THREE.Group>((resolve, reject) => {
    // three.js bundles the Draco decoder (hashed assets), so no decoder path is needed
    const draco = new DRACOLoader()
    new GLTFLoader().setDRACOLoader(draco).load(
      `${import.meta.env.BASE_URL}models/emu.glb`,
      (gltf) => {
        draco.dispose()
        resolve(prepare(gltf.scene))
      },
      undefined,
      (err) => {
        draco.dispose()
        reject(err)
      },
    )
  })
}

function prepare(model: THREE.Group) {
  const parts: THREE.Mesh[] = []
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) parts.push(o as THREE.Mesh)
  })
  const visor = new THREE.MeshPhysicalMaterial({
    color: 0xd9a441,
    metalness: 1,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 2,
  })
  const tuned = new Set<THREE.Material>()
  for (const m of parts) {
    const mat = m.material as THREE.MeshPhysicalMaterial
    if (DUPLICATES.has(mat.name)) {
      m.removeFromParent()
      m.geometry.dispose()
      continue
    }
    const tris = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3
    m.userData.heavy = tris > 40000
    if (mat.name === VISOR) {
      m.material = visor
      continue
    }
    if (!tuned.has(mat)) {
      tuned.add(mat)
      tune(mat)
    }
  }

  // Exported facing away: turn to face the viewer, centre on the origin, scale to size
  model.rotation.y = Math.PI
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const s = HEIGHT / box.getSize(new THREE.Vector3()).y
  model.scale.setScalar(s)
  model.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-s)
  const pivot = new THREE.Group()
  pivot.add(model)
  return pivot
}

/** Give each exported material a real surface: cloth, anodised metal, gold foil or printed satin */
function tune(mat: THREE.MeshPhysicalMaterial) {
  // Every material was exported as clear glass; the suit is opaque
  mat.transmission = 0
  mat.transparent = false
  mat.opacity = 1
  const { r, g, b } = mat.color
  const max = Math.max(r, g, b)
  const sat = max - Math.min(r, g, b)
  if (mat.map) {
    // Printed parts: the flag and patches
    mat.roughness = 0.6
    mat.envMapIntensity = 0.5
  } else if (sat < 0.1 && max > 0.75) {
    // White suit fabric: a soft cloth sheen and woven relief
    mat.roughness = 0.82
    mat.sheen = 0.6
    mat.sheenRoughness = 0.55
    mat.sheenColor.setRGB(1, 1, 1)
    mat.envMapIntensity = 0.45
    fabric(mat)
  } else if (sat < 0.1) {
    // Gray hardware: anodised metal
    mat.metalness = 0.65
    mat.roughness = 0.38
    mat.envMapIntensity = 1
  } else if (r > g && g > b && sat > 0.25 && max < 0.8) {
    // Gold and copper foil
    mat.metalness = 0.85
    mat.roughness = 0.3
    mat.envMapIntensity = 1.2
  } else {
    mat.roughness = 0.6
    mat.envMapIntensity = 0.5
  }
}

// Wrinkles and a finer weave as a bump on the shading normal, from object-space noise (the model has no UVs to spare)
const FABRIC = /* glsl */ `
varying vec3 vObj;
float fabricHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fabricNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fabricHash(i), fabricHash(i + vec3(1, 0, 0)), f.x), mix(fabricHash(i + vec3(0, 1, 0)), fabricHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fabricHash(i + vec3(0, 0, 1)), fabricHash(i + vec3(1, 0, 1)), f.x), mix(fabricHash(i + vec3(0, 1, 1)), fabricHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 fabricNormal(vec3 n) {
  float h = fabricNoise(vObj * 14.0) * 0.7 + fabricNoise(vObj * 41.0) * 0.3;
  vec3 dpx = dFdx(-vViewPosition);
  vec3 dpy = dFdy(-vViewPosition);
  vec3 r1 = cross(dpy, n);
  vec3 r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h)) * 0.01;
  return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
}
`

function fabric(mat: THREE.MeshPhysicalMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;")
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FABRIC}`)
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = fabricNormal(normal);")
  }
  mat.customProgramCacheKey = () => "emu-fabric"
}
