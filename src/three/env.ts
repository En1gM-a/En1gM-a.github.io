import * as THREE from "three"

/**
 * A dim sky in the Hubble palette (teal gas, warm dust, a bright sun) for metal
 * and the gold visor to reflect. Shared by the backdrop and the voyage.
 */
export function spaceEnvironment(renderer: THREE.WebGLRenderer) {
  const c = document.createElement("canvas")
  c.width = 512
  c.height = 256
  const x = c.getContext("2d")!
  const g = x.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, "#0a1c2a")
  g.addColorStop(0.5, "#0f1d29")
  g.addColorStop(1, "#160d08")
  x.fillStyle = g
  x.fillRect(0, 0, 512, 256)
  const blob = (cx: number, cy: number, r: number, col: string) => {
    const h = x.createRadialGradient(cx, cy, 0, cx, cy, r)
    h.addColorStop(0, col)
    h.addColorStop(1, "rgba(0,0,0,0)")
    x.fillStyle = h
    x.fillRect(cx - r, cy - r, r * 2, r * 2)
  }
  blob(140, 70, 60, "rgba(255,248,236,1)")
  blob(360, 110, 110, "rgba(40,170,180,0.55)")
  blob(250, 190, 100, "rgba(230,140,60,0.45)")
  blob(60, 170, 80, "rgba(120,50,25,0.5)")
  blob(470, 60, 70, "rgba(90,110,230,0.4)")
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`
    x.fillRect(Math.random() * 512, Math.random() * 256, 1, 1)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromEquirectangular(tex).texture
  tex.dispose()
  pmrem.dispose()
  return env
}
