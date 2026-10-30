import * as THREE from 'three'
import { grainTexture } from '../../facade/three/kit'

/**
 * The floor, as the Advanced Flooring pages draw it: a structural slab, RTARIUM laid on it (the real
 * 10 mm model, see `MeshInset`), and a thin high-strength screed over both. Sizes are of the kind, not
 * of a project; the mesh and the screed are drawn thicker than they are where they must read.
 */

/** a block between two corners */
export function block(a: [number, number, number], b: [number, number, number]) {
  const s = [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])]
  return new THREE.BoxGeometry(s[0], s[1], s[2]).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
}

/** an uneven free edge (a pour front, a crack), a few millimetres either way, as a function of where along it */
export function ragged(s: number, seed = 0) {
  return 0.5 * Math.sin(s * 41 + 0.6 + seed) + 0.3 * Math.sin(s * 97 + 2.1 + seed * 2) + 0.2 * Math.sin(s * 173 + 4.2 + seed * 3)
}

export interface FloorMaterials {
  /** the structural slab: a darker, coarser concrete */
  slab: THREE.MeshStandardMaterial
  /** the screed: a light, fine, troweled concrete */
  screed: THREE.MeshStandardMaterial
  /** the shadow on the ground */
  catcher: THREE.ShadowMaterial
  /** the drawn marks (cracks, joints, outlines) */
  ink: THREE.MeshBasicMaterial
  /** RTARIUM's yellow, for what the eye should follow */
  mark: THREE.MeshBasicMaterial
}

export function floorMaterials(): FloorMaterials {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ transparent: true, ...p })
  return {
    slab: std({ color: '#a29d94', map: grainTexture('#a29d94', 7000, [110, 190], 2), roughness: 0.96 }),
    screed: std({ color: '#e4dfd5', map: grainTexture('#e4dfd5', 6000, [175, 232], 2), roughness: 0.7 }),
    catcher: new THREE.ShadowMaterial({ color: '#4a3000', transparent: true, opacity: 0.26, depthWrite: false }),
    ink: new THREE.MeshBasicMaterial({ color: '#080808', transparent: true, toneMapped: false }),
    mark: new THREE.MeshBasicMaterial({ color: '#fdd001', transparent: true, toneMapped: false }),
  }
}

export function disposeFloorMaterials(m: FloorMaterials) {
  for (const x of Object.values(m) as THREE.Material[]) {
    const map = (x as THREE.MeshStandardMaterial).map
    map?.dispose()
    x.dispose()
  }
}
