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
  suit ??= afterLoad().then(() => fetchSuit())
  return suit.then((s) => s.clone(true))
}

/** The suit is 3.4 MB: let the page and the intro's assets land first */
function afterLoad() {
  return new Promise<void>((resolve) => {
    const go = () => window.setTimeout(resolve, 1500)
    if (document.readyState === "complete") go()
    else window.addEventListener("load", go, { once: true })
  })
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
  for (const m of parts) {
    const mat = m.material as THREE.MeshPhysicalMaterial
    if (DUPLICATES.has(mat.name)) {
      m.removeFromParent()
      m.geometry.dispose()
      continue
    }
    if (mat.name === VISOR) {
      m.material = visor
      continue
    }
    // Every material was exported as clear glass; the suit is opaque fabric and metal
    mat.transmission = 0
    mat.transparent = false
    mat.opacity = 1
    mat.envMapIntensity = 0.7
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
