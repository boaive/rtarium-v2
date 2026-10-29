import * as THREE from 'three'
import { BACK, HEIGHT, LEN, PROFILE, block, merge } from './cornice'

/**
 * The one thing on the Stud Frame page that is not the product and is modelled solid: the casting's
 * mould, as an architect's white model (matt warm white), so the page holds to yellow, black and white.
 * The building on site is a drawing (see `tower.ts`). Sizes are of the kind, not of a project.
 */

export interface ModelMaterials {
  white: THREE.MeshStandardMaterial
}
export function modelMaterials(): ModelMaterials {
  return { white: new THREE.MeshStandardMaterial({ color: '#efece5', roughness: 0.86, metalness: 0, transparent: true }) }
}

/**
 * Where the element lies to be cast: face down in its mould, its back up. `CAST.y` is the height of the
 * wall-side line (the mould's rim is the skin's back line), `CAST.z` centres it across the mould.
 */
export const CAST = { y: 0.62, z: HEIGHT / 2 } as const
export const RIM = CAST.y - BACK

/**
 * The carpentry mould: a CNC-routed timber block whose cavity is the cornice's face (the negative of
 * the profile, stepped), closed by end boards. In the casting's frame (x along it, the cavity open up).
 */
export function mouldGeometry() {
  const half = 0.42
  const cav = PROFILE.map(([u, v]) => [v - CAST.z, RIM - u] as [number, number])
  const s = new THREE.Shape()
  s.moveTo(-half, 0)
  s.lineTo(half, 0)
  s.lineTo(half, RIM)
  for (let i = cav.length - 1; i >= 0; i--) s.lineTo(cav[i][0], cav[i][1])
  s.lineTo(-half, RIM)
  s.closePath()
  const body = new THREE.ExtrudeGeometry(s, { depth: LEN, bevelEnabled: false, curveSegments: 1 })
  body.rotateY(-Math.PI / 2)
  body.translate(LEN / 2, 0, 0)
  const ends = [-1, 1].map((k) => block([k * (LEN / 2), 0, -half], [k * (LEN / 2 + 0.07), RIM + 0.012, half]))
  return merge([body, ...ends])
}
