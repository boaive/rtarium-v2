import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { prefersReducedMotion } from '../../lib/motion'

const DEG = Math.PI / 180

/** where the model sits on the canvas (px, from the canvas's top left), written by the page as it scrolls */
export interface CellView {
  x: number
  y: number
  w: number
  h: number
}

/** how the model is seen in a state: orbit about `target` (deg), how much closer than a whole fit, and its sway */
export interface CellShot {
  target: [number, number, number]
  azim: number
  elev: number
  zoom: number
  /** how far it turns from side to side while on screen (deg), in time */
  sway: number
}

/**
 * A camera that keeps the model framed inside one segment of the page: centred on it and sized to
 * fit it, whatever shape the segment has taken as the page scrolls. The page moves the segments;
 * this follows them exactly. On its own clock the model only sways slowly from side to side (not
 * under reduced motion), and only while `live` (on screen).
 */
export function CellRig({ view, shotAt, size: extent, live }: { view?: CellView; shotAt: () => CellShot; size: [number, number]; live: { current: boolean } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])

  useFrame(() => {
    const s = shotAt()
    const t = performance.now() / 1000
    const idle = !reduced && s.sway > 0
    const azim = s.azim + (idle ? s.sway * Math.sin((t * Math.PI * 2) / 14) : 0)
    const elev = s.elev + (idle ? s.sway * 0.22 * Math.sin((t * Math.PI * 2) / 19 + 1.3) : 0)
    const fov = 26
    camera.fov = fov
    // the distance at which the model's width and height both fit the segment
    const k = size.height / (2 * Math.tan((fov / 2) * DEG))
    // without a segment to follow, the model fills its own canvas
    const w = Math.max(48, view?.w ?? size.width)
    const h = Math.max(48, view?.h ?? size.height)
    const dist = Math.max((extent[0] * k) / (0.78 * w), (extent[1] * k) / (0.8 * h)) / s.zoom
    const el = elev * DEG
    const az = azim * DEG
    const [tx, ty, tz] = s.target
    camera.position.set(tx + dist * Math.cos(el) * Math.sin(az), ty + dist * Math.sin(el), tz + dist * Math.cos(el) * Math.cos(az))
    camera.lookAt(tx, ty, tz)
    const fx = view ? (view.x + view.w / 2) / size.width : 0.5
    const fy = view ? (view.y + view.h / 2) / size.height : 0.5
    camera.setViewOffset(size.width, size.height, -(fx - 0.5) * size.width, -(fy - 0.5) * size.height, size.width, size.height)
    camera.updateProjectionMatrix()
    if (idle && live.current) invalidate()
  }, -1)
  return null
}
