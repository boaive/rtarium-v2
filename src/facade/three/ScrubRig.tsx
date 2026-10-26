import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { prefersReducedMotion } from '../../lib/motion'
import { approach, type Shot } from './kit'
import type { Progress } from '../progress'

const DEG = Math.PI / 180

/**
 * A camera that follows the scroll: the shot is a function of how far the section has been
 * scrolled, eased a little so a wheel's steps arrive as one glide. Same orbit as `Rig` (about a
 * target, the target placed at a point of the canvas). With `sway` it also turns slowly from side
 * to side in time while `live` (on screen), so a held view is never quite still.
 */
export function ScrubRig({
  progress,
  shotAt,
  sway = 0,
  live,
  aspect,
}: {
  progress: Progress
  shotAt: (p: number) => Shot
  sway?: number
  live?: { current: boolean }
  /** the canvas shape (width / height) the shots were framed for: a narrower one pulls back so the model keeps its share of the width */
  aspect?: number
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const cur = useRef<Record<string, number> | null>(null)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const shot = shotAt(progress.value)
    const pull = aspect ? Math.max(1, aspect / (size.width / Math.max(1, size.height))) : 1
    const to = {
      tx: shot.target[0],
      ty: shot.target[1],
      tz: shot.target[2],
      dist: shot.dist * pull,
      azim: shot.azim,
      elev: shot.elev,
      fov: shot.fov ?? 26,
      fx: shot.frame?.[0] ?? 0.5,
      fy: shot.frame?.[1] ?? 0.5,
    }
    if (!cur.current || reduced) cur.current = { ...to }
    const c = cur.current
    let moving = false
    for (const k of Object.keys(to) as (keyof typeof to)[]) if (approach(c, k, to[k], 7, dt, 1e-4)) moving = true
    const idle = !reduced && sway > 0 && (live?.current ?? true)
    const t = performance.now() / 1000
    const el = (c.elev + (idle ? sway * 0.25 * Math.sin((t * Math.PI * 2) / 17 + 0.8) : 0)) * DEG
    const az = (c.azim + (idle ? sway * Math.sin((t * Math.PI * 2) / 12) : 0)) * DEG
    camera.position.set(c.tx + c.dist * Math.cos(el) * Math.sin(az), c.ty + c.dist * Math.sin(el), c.tz + c.dist * Math.cos(el) * Math.cos(az))
    camera.lookAt(c.tx, c.ty, c.tz)
    if (camera.fov !== c.fov) camera.fov = c.fov
    camera.setViewOffset(size.width, size.height, -(c.fx - 0.5) * size.width, -(c.fy - 0.5) * size.height, size.width, size.height)
    camera.updateProjectionMatrix()
    if (moving || idle) invalidate()
  }, -1)
  return null
}

/** a shot between two others */
export function mixShot(a: Shot, b: Shot, t: number): Shot {
  const l = (x: number, y: number) => x + (y - x) * t
  return {
    target: [l(a.target[0], b.target[0]), l(a.target[1], b.target[1]), l(a.target[2], b.target[2])],
    dist: l(a.dist, b.dist),
    azim: l(a.azim, b.azim),
    elev: l(a.elev, b.elev),
    fov: l(a.fov ?? 26, b.fov ?? 26),
    frame: [l(a.frame?.[0] ?? 0.5, b.frame?.[0] ?? 0.5), l(a.frame?.[1] ?? 0.5, b.frame?.[1] ?? 0.5)],
  }
}
