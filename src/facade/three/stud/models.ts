import * as THREE from 'three'
import { BACK, HEIGHT, LEN, PROFILE, block, merge, type V3 } from './cornice'

/**
 * Everything on the Stud Frame page that is not the product, modelled as solid objects, kept to the
 * page's three colours: the casting's things (mould, gun, pallet) as an architect's white model; the
 * site's (the crane, the truck, the road, the apartment block) in black with yellow where a part has to
 * read (glazing, the hook, the road's dashes). Only the element keeps its own materials (white concrete,
 * galvanized steel, RTARIUM's bronze). Each function returns geometry in the object's own frame; the
 * scene places it. Sizes are of the kind, not of a project.
 */

export interface ModelMaterials {
  white: THREE.MeshStandardMaterial
  dark: THREE.MeshStandardMaterial
  glass: THREE.MeshStandardMaterial
  road: THREE.MeshStandardMaterial
  /** the site's black, and its yellow */
  ink: THREE.MeshStandardMaterial
  yellow: THREE.MeshStandardMaterial
}
export function modelMaterials(): ModelMaterials {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ transparent: true, ...p })
  return {
    white: std({ color: '#efece5', roughness: 0.86, metalness: 0 }),
    dark: std({ color: '#3a3a39', roughness: 0.72, metalness: 0.05 }),
    glass: std({ color: '#aeb2b3', roughness: 0.18, metalness: 0.15 }),
    road: std({ color: '#dedbd3', roughness: 0.95 }),
    ink: std({ color: '#141414', roughness: 0.78, metalness: 0.05 }),
    yellow: std({ color: '#fdd001', roughness: 0.62, metalness: 0 }),
  }
}

const cyl = (r0: number, r1: number, h: number, seg = 16) => new THREE.CylinderGeometry(r0, r1, h, seg)
/** a cylinder lying along x, centred at `c` (a wheel's axle is along z: `along = 'z'`) */
function bar(c: V3, r: number, len: number, along: 'x' | 'z' = 'x', seg = 18) {
  const g = cyl(r, r, len, seg)
  if (along === 'x') g.rotateZ(Math.PI / 2)
  else g.rotateX(Math.PI / 2)
  return g.translate(...c)
}
/** a box from its start along a direction (the gun's grip) */
function beam(a: V3, b: V3, w: number, h: number) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const d = vb.clone().sub(va)
  const g = new THREE.BoxGeometry(d.length(), h, w)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize())
  g.applyQuaternion(q)
  return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
}

/* ---- casting ------------------------------------------------------------------------------------ */

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
  // the bench it stands on
  const bench = [block([-LEN / 2 - 0.2, -0.02, -0.55], [LEN / 2 + 0.2, 0, 0.55])]
  return merge([body, ...ends, ...bench])
}

/** the spray-up gun, its nozzle at the origin pointing down: nozzle, barrel, body, grip, the hopper on top, the hose */
export function gunGeometry() {
  const parts: THREE.BufferGeometry[] = [
    cyl(0.012, 0.03, 0.05).translate(0, 0.025, 0),
    cyl(0.02, 0.02, 0.2).translate(0, 0.15, 0),
    block([-0.07, 0.25, -0.04], [0.07, 0.33, 0.04]),
    beam([0.05, 0.27, 0], [0.12, 0.14, 0], 0.035, 0.04),
    cyl(0.1, 0.035, 0.2, 20).translate(0, 0.43, 0),
    cyl(0.1, 0.1, 0.02, 20).translate(0, 0.54, 0),
  ]
  const hose: THREE.Vector3[] = []
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    hose.push(new THREE.Vector3(-0.07 - t * 0.6, 0.29 + Math.sin(t * Math.PI * 0.85) * 0.45, -t * 0.25))
  }
  parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hose), 30, 0.014, 8, false))
  return merge(parts)
}

/** the spray: a fan from the nozzle down to the surface `h` below, `w` across (along z), thin along the pass */
export function sprayGeometry(h: number, w: number) {
  return new THREE.ConeGeometry(w / 2, h, 28, 1, true).translate(0, -h / 2, 0).scale(0.28, 1, 1)
}

/** a timber pallet: deck boards across, three bearers along, boards under; its deck at `PALLET.h` */
export const PALLET = { h: 0.14, x: 1.4, z: 0.55 } as const
export function palletGeometry() {
  const { h, x, z } = PALLET
  const parts: THREE.BufferGeometry[] = []
  for (let k = 0; k <= 9; k++) {
    const xx = -x + (2 * x * k) / 9
    parts.push(block([xx - 0.055, h - 0.022, -z], [xx + 0.055, h, z]))
  }
  for (const zz of [-z + 0.05, 0, z - 0.05]) parts.push(block([-x, 0.022, zz - 0.045], [x, h - 0.022, zz + 0.045]))
  for (const xx of [-x + 0.06, 0, x - 0.06]) parts.push(block([xx - 0.06, 0, -z], [xx + 0.06, 0.022, z]))
  return merge(parts)
}

/* ---- the truck and the crane -------------------------------------------------------------------- */

/** the flatbed lorry: its cab at +x, its bed at `TRUCK.bed`, three axles; its body, its tyres, its glazing */
export const TRUCK = { bed: 1.35 } as const
export function truckGeometry() {
  const axles = [-3.2, -2.1, 3.4]
  const body = [
    // the cab, its roof drawn in a little, a sun visor, the bumper
    block([2.45, 0.95, -1.22], [4.35, 2.95, 1.22]),
    block([2.55, 2.95, -1.12], [4.25, 3.1, 1.12]),
    block([4.35, 2.75, -1.15], [4.5, 2.82, 1.15]),
    block([4.35, 0.85, -1.25], [4.45, 1.3, 1.25]),
    // the chassis, the bed and its headboard
    block([-4.3, 0.85, -0.55], [2.45, 1.12, 0.55]),
    block([-4.3, 1.12, -1.25], [2.25, TRUCK.bed, 1.25]),
    block([2.15, TRUCK.bed, -1.25], [2.25, 2.55, 1.25]),
    // mudguards
    ...axles.flatMap((x) => [-1, 1].map((s) => block([x - 0.62, 1.12, s * 1.18], [x + 0.62, 1.18, s * 1.26]))),
  ]
  const tyres = axles.flatMap((x) => [-1, 1].map((s) => bar([x, 0.52, s * 1.08], 0.52, 0.3, 'z', 26)))
  const glass = [block([4.35, 1.95, -1.1], [4.37, 2.7, 1.1]), ...[-1, 1].map((s) => block([2.7, 1.95, s * 1.22 - 0.01], [4.1, 2.65, s * 1.22 + 0.01]))]
  return { body: merge(body), tyres: merge(tyres), glass: merge(glass) }
}

/**
 * The small mobile crane (a villa job's crane, not a tower's): a carrier on four axles with its cab,
 * outriggers down on pads, the turret at its back. Its boom is apart (`boomGeometry`) so it can slew and
 * luff; the boom's foot is at `CRANE.pivot` in the carrier's frame (x along the carrier).
 */
export const CRANE = { pivot: [-1.1, 3.0, 0] as V3, boom: 12 } as const
export function craneGeometry() {
  const body: THREE.BufferGeometry[] = [
    block([-4.4, 0.95, -1.25], [3.0, 1.75, 1.25]),
    block([3.0, 0.95, -1.25], [4.6, 3.0, 1.25]),
    // the turret, its operator's cab, the boom's foot
    block([-2.4, 1.75, -1.15], [0.2, 2.75, 1.15]),
    block([-0.3, 1.75, 0.4], [1.0, 2.95, 1.15]),
    block([-1.5, 2.75, -0.45], [-0.7, 3.2, 0.45]),
  ]
  // outriggers out on their beams, the jacks down on pads
  for (const x of [-4.1, 2.6])
    for (const s of [-1, 1]) {
      body.push(block([x - 0.15, 1.2, s * 1.25], [x + 0.15, 1.45, s * 3.0]))
      body.push(cyl(0.09, 0.09, 1.35, 12).translate(x, 0.72, s * 3.0))
      body.push(cyl(0.3, 0.3, 0.05, 20).translate(x, 0.025, s * 3.0))
    }
  const tyres = [-3.3, -2.0, 1.4, 3.6].flatMap((x) => [-1, 1].map((s) => bar([x, 0.55, s * 1.12], 0.55, 0.36, 'z', 26)))
  const glass = [block([4.6, 1.9, -1.0], [4.62, 2.8, 1.0]), block([-0.3, 2.0, 1.15], [0.9, 2.8, 1.16])]
  return { body: merge(body), tyres: merge(tyres), glass: merge(glass) }
}
/** the boom along +x from its foot: three telescopic sections, the head sheave at its tip */
export function boomGeometry(len = CRANE.boom) {
  return merge([
    block([0, -0.38, -0.38], [len * 0.42, 0.38, 0.38]),
    block([len * 0.4, -0.3, -0.3], [len * 0.74, 0.3, 0.3]),
    block([len * 0.72, -0.23, -0.23], [len - 0.1, 0.23, 0.23]),
    bar([len - 0.05, 0, 0], 0.26, 0.42, 'z', 20),
  ])
}
/** the hook block and its hook */
export function hookGeometry() {
  return merge([block([-0.1, 0, -0.08], [0.1, 0.32, 0.08]), new THREE.TorusGeometry(0.07, 0.018, 8, 20, Math.PI * 1.3).rotateZ(Math.PI * 0.85).translate(0, -0.06, 0)])
}

/* ---- the villa, its palms, the road ------------------------------------------------------------- */

/**
 * The apartment block: eight storeys, a ribbon of glazing on every floor, and over each ribbon a band of
 * stud frame cornice elements (the elements themselves, apart). Its front at z = 0 from x = 0 to
 * `BLOCK.w`; the bands at `bandY(k)`. Black, its glazing yellow; on its roof a parapet and the core's head.
 */
export const BLOCK = { w: 26, d: 14, floors: 8, fh: 3.2 } as const
/** the bottom of the cornice band over floor k's glazing */
export const bandY = (k: number) => k * BLOCK.fh + 2.55

export function blockGeometry() {
  const { w, d, floors, fh } = BLOCK
  const H = floors * fh
  const body: THREE.BufferGeometry[] = [
    // the mass, its front set back behind the bands
    block([0, 0, -d], [w, H, -0.02]),
    // the parapet and the core's head on the roof
    block([0, H, -0.35], [w, H + 1.0, 0]),
    block([0, H, -d], [w, H + 1.0, -d + 0.3]),
    block([0, H, -d], [0.3, H + 1.0, 0]),
    block([w - 0.3, H, -d], [w, H + 1.0, 0]),
    block([w * 0.42, H, -d * 0.7], [w * 0.58, H + 3.2, -d * 0.35]),
  ]
  const glass: THREE.BufferGeometry[] = []
  for (let k = 0; k < floors; k++) {
    const y0 = k * fh + 0.35
    const y1 = k * fh + 2.45
    // the ribbon, proud of the mass, its mullions
    glass.push(block([0.5, y0, -0.02], [w - 0.5, y1, 0.01]))
    for (let x = 0.5; x <= w - 0.49; x += 1.6) body.push(block([x - 0.05, y0, 0.01], [x + 0.05, y1, 0.06]))
    // the ends' windows
    for (const x of [-0.01, w + 0.01]) glass.push(block([x - 0.01, y0, -d + 1.5], [x + 0.01, y1, -1.5]))
  }
  return { body: merge(body), glass: merge(glass) }
}

/** the road from the yard to the villa: its surface, the dashes down its middle */
export function roadGeometry(x0: number, x1: number, z: number) {
  const dashes: THREE.BufferGeometry[] = []
  for (let x = x0 + 1; x < x1 - 2; x += 4.5) dashes.push(block([x, 0.012, z - 0.08], [x + 1.8, 0.016, z + 0.08]))
  return { surface: block([x0, 0, z - 3.2], [x1, 0.012, z + 3.2]), dashes: merge(dashes) }
}

/** the sealant gun, its nozzle's tip at the origin, its axis along +y: nozzle, cartridge, plunger, grip */
export function sealantGunGeometry() {
  return merge([
    cyl(0.002, 0.009, 0.06, 12).translate(0, 0.03, 0),
    cyl(0.024, 0.024, 0.2, 18).translate(0, 0.16, 0),
    cyl(0.004, 0.004, 0.12, 8).translate(0, 0.32, 0),
    block([-0.012, 0.22, 0.024], [0.012, 0.3, 0.09]),
  ])
}
