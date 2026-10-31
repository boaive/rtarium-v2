import * as THREE from 'three'
import type { Shot } from '../../../facade/three/kit'
import { smooth } from '../../../facade/progress'
import { fit, type BuildRoom } from '../../data/three/BuildScene'

/**
 * The semiconductor stages' camera, after the Data & AI Centres build: each step has a shot fitted to
 * the room right of the words, and the camera moves on only in the gap at the end of a step. Between
 * two shots the distance moves by ratio, so a zoom from the cleanroom down to a wafer reads even all
 * the way.
 */

export type Box = [[number, number, number], [number, number, number]]
export interface View {
  box: Box
  azim: number
  elev: number
  fill: number
}

/** a shot between two, its distance moving by ratio */
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

/** the room on a phone: the top part of the screen, over the words */
export const PHONE_ROOM: BuildRoom = { x: 0.04, y: 0.13, w: 0.92, h: 0.36 }

/**
 * Where a step's scale is too far from the next one's to travel between them inside the room (the
 * cleanroom to a wafer), the stage cuts instead: the 3D dissolves out, the camera is put on the next
 * shot, and it dissolves back in (`Stage`'s `cuts`). Each side leans in a little, so it still reads as
 * going in. The cut falls at this point of the step.
 */
export const CUT_AT = 0.9

/** the shot at `v` (the run as steps): step k's own, eased over to k + 1's in the last fifth of k, or cut to it */
export function shotAt(views: View[], v: number, room: BuildRoom, aspect: number, cuts: number[] = []) {
  const k = Math.min(views.length - 1, Math.floor(v))
  const f = v - k
  const of = (i: number) => fit(views[i].box, views[i].azim, views[i].elev, room, aspect, views[i].fill)
  if (k >= views.length - 1) return of(k)
  if (cuts.includes(k)) {
    const s = f < CUT_AT ? of(k) : of(k + 1)
    const lean = f < CUT_AT ? 1 - 0.1 * smooth(0.78, CUT_AT, f) : 1 + 0.1 * (1 - smooth(CUT_AT, 1, f))
    return { ...s, dist: s.dist * lean }
  }
  return between(of(k), of(k + 1), smooth(0.8, 1, f))
}

/** how far the 3D is in at `v` (0 at a cut, 1 otherwise) */
export function cutFade(v: number, cuts: number[]) {
  const k = Math.floor(v)
  if (!cuts.includes(k)) return 1
  const f = v - k
  return f < CUT_AT ? 1 - smooth(0.78, CUT_AT - 0.02, f) : smooth(CUT_AT + 0.02, 1, f)
}

/** puts the camera on a shot, its near plane in proportion to the distance (the millimetre layers never fight) */
export function aim(camera: THREE.PerspectiveCamera, size: { width: number; height: number }, shot: Shot) {
  const A = (shot.azim * Math.PI) / 180
  const E = (shot.elev * Math.PI) / 180
  const [tx, ty, tz] = shot.target
  camera.fov = 26
  camera.near = Math.max(0.002, shot.dist * 0.02)
  camera.far = shot.dist * 8 + 20
  camera.position.set(tx + shot.dist * Math.cos(E) * Math.sin(A), ty + shot.dist * Math.sin(E), tz + shot.dist * Math.cos(E) * Math.cos(A))
  camera.lookAt(tx, ty, tz)
  const fr = shot.frame ?? [0.5, 0.5]
  camera.setViewOffset(size.width, size.height, -(fr[0] - 0.5) * size.width, -(fr[1] - 0.5) * size.height, size.width, size.height)
  camera.updateProjectionMatrix()
}
