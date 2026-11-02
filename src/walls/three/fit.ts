import * as THREE from 'three'
import type { Shot } from '../../facade/three/kit'

/** the room the 3D keeps to, as fractions of its canvas (the Data & AI Centres build's) */
export interface Room {
  x: number
  y: number
  w: number
  h: number
}

export type Box = [[number, number, number], [number, number, number]]
const DEG = Math.PI / 180

/**
 * A shot that fits a box into the room: looking at its middle from `azim`, `elev`, as far away as it
 * takes for it to fill `fill` of the room's width or height (whichever binds), the room's middle on it.
 * (The Data & AI Centres build's `fit`, kept here so this page does not load that one's scene.)
 */
export function fit(box: Box, azim: number, elev: number, room: Room, aspect: number, fill: number): Shot {
  const [a, b] = box
  const c = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  const A = azim * DEG
  const E = elev * DEG
  const back = new THREE.Vector3(Math.cos(E) * Math.sin(A), Math.sin(E), Math.cos(E) * Math.cos(A))
  const right = new THREE.Vector3(0, 1, 0).cross(back).normalize()
  const up = back.clone().cross(right)
  let w = 0
  let h = 0
  let d = 0
  const p = new THREE.Vector3()
  for (const x of [a[0], b[0]])
    for (const y of [a[1], b[1]])
      for (const z of [a[2], b[2]]) {
        p.set(x, y, z).sub(c)
        w = Math.max(w, Math.abs(p.dot(right)))
        h = Math.max(h, Math.abs(p.dot(up)))
        d = Math.max(d, Math.abs(p.dot(back)))
      }
  const t = Math.tan(13 * DEG)
  const dist = Math.max(h / (t * room.h * fill), w / (t * aspect * room.w * fill)) + d
  return { target: [c.x, c.y, c.z], dist, azim, elev, frame: [room.x + room.w / 2, room.y + room.h / 2] }
}

/** a shot between two, its distance moving by ratio (a zoom reads even all the way) */
export function between(a: Shot, b: Shot, t: number): Shot {
  const l = (x: number, y: number) => x + (y - x) * t
  return {
    target: [l(a.target[0], b.target[0]), l(a.target[1], b.target[1]), l(a.target[2], b.target[2])],
    dist: Math.exp(l(Math.log(a.dist), Math.log(b.dist))),
    azim: l(a.azim, b.azim),
    elev: l(a.elev, b.elev),
    frame: [l(a.frame![0], b.frame![0]), l(a.frame![1], b.frame![1])],
  }
}
