import * as THREE from 'three'
import { smooth } from '../../progress'
import { JOINT, LEN } from './cornice'
import { BLOCK, TRUCK, bandY } from './models'
import { SEATED, lift } from './handling'

/**
 * On site, shared by its two scenes (the block in the room, and the joint in close in its box): where
 * things stand and when each step happens. `p` is the section's run, 0..1, a fifth for each step of
 * the bar; a step's words come in over its first seventh, then its action plays.
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export const SITE = {
  load: [0.025, 0.085],
  drive: [0.085, 0.17],
  unwrap: [0.215, 0.235],
  hoist: [0.225, 0.37],
  lockTop: [0.42, 0.47],
  look: [0.48, 0.57],
  level: [0.625, 0.76],
  rod: [0.815, 0.845],
  bead: [0.845, 0.955],
} as const
export type SiteMark = keyof typeof SITE
export const at = (p: number, k: SiteMark, a = 0, b = 1) => smooth(lerp(SITE[k][0], SITE[k][1], a), lerp(SITE[k][0], SITE[k][1], b), p)
export const bump = (p: number, k: SiteMark, a: number, b: number, c: number, d: number) => at(p, k, a, b) * (1 - at(p, k, c, d))

/** the block: its front at z = −6 from x = 30; ten elements to a band, the second of the second band still to come */
export const BLOCK_AT = V(30, 0, -6)
export const PITCH = LEN + JOINT
export const PER_BAND = 10
export const FIRST = (BLOCK.w - (PER_BAND * LEN + (PER_BAND - 1) * JOINT)) / 2 + LEN / 2
export const BAND = 1
export const GAP = 1
export const INSTALL = V(BLOCK_AT.x + FIRST + GAP * PITCH, bandY(BAND), BLOCK_AT.z)
export const ROAD_Z = 5
/** the truck's origin, in the yard and at the block (its bed's middle in front of the gap) */
export const BED_MID = -1.05
export const TRUCK_YARD = 7
export const TRUCK_SITE = INSTALL.x - BED_MID
/** how low it is first set, before the levelling bolts bring it up (far more than on a real site, so it reads) */
export const LOW = 0.02
/** the L frames under its two ends (in its own frame) */
export const SEATS = [-0.8, 0.8] as const

export const truckX = (p: number) => lerp(TRUCK_YARD, TRUCK_SITE, at(p, 'drive'))
/** the bolts turned in three small steps */
export function levelAt(p: number) {
  const k = at(p, 'level') * 3
  return Math.min(1, Math.floor(k + 1e-4) / 3 + smooth(0, 1, k % 1) / 3)
}
/** the element on site (its root, world): hoisted off the truck, brought across, set low on its L frames, levelled */
export function hoistAt(p: number, out: THREE.Vector3) {
  const from = V(truckX(p) + BED_MID, TRUCK.bed + SEATED.y, ROAD_Z + SEATED.z)
  const to = V(INSTALL.x, INSTALL.y - LOW * (1 - levelAt(p)), INSTALL.z)
  return lift(at(p, 'hoist', 0.12, 1), from, to, 1.4, out)
}
/** how the element is turned as it rises: face down on its pallet, upright by the time it is clear */
export const hoistTurn = (p: number) => lerp(Math.PI / 2, 0, smooth(0.05, 0.45, at(p, 'hoist', 0.12, 1)))
/** when the close view of the joint opens, as the element comes down to its place */
export const DETAIL_OPEN: [number, number] = [0.3, 0.345]
