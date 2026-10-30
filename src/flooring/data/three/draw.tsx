import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import type { Lines } from './dc'

/**
 * A drawing that can be drawn on and taken back: its segments, in their order, `pixels` wide, of
 * which the first `share` (0..1) are shown. A drawing that grows from a point, or shrinks back into
 * it, is one whose segments were sorted from there (`sortFrom`).
 */
export interface Drawing {
  obj: LineSegments2
  /** shows the first `share` of its segments; returns whether anything changed */
  show: (share: number) => boolean
}

export function useDrawing(lines: Lines, material: LineMaterial): Drawing {
  const d = useMemo(() => {
    const g = new LineSegmentsGeometry()
    g.setPositions(new Float32Array(lines.pts))
    const obj = new LineSegments2(g, material)
    obj.frustumCulled = false
    // drawn after the solids: lines write no depth, so a solid drawn after them would paint them out
    obj.renderOrder = 5
    const total = lines.pts.length / 6
    let last = -1
    const show = (share: number) => {
      const n = Math.round(Math.min(1, Math.max(0, share)) * total)
      if (n === last) return false
      last = n
      g.instanceCount = n
      obj.visible = n > 0
      return true
    }
    show(1)
    return { obj, show }
  }, [lines, material])
  useEffect(() => () => d.obj.geometry.dispose(), [d])
  return d
}

/** a drawn line's material: ink of `width` pixels, which the scene may fade */
export function ink(width: number, color = '#080808', opacity = 1) {
  return new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width, transparent: true, opacity, depthWrite: false })
}

/** keeps the drawn lines' widths in pixels as the canvas changes size */
export function useInkResolution(mats: LineMaterial[]) {
  const size = useThree((s) => s.size)
  useEffect(() => {
    for (const m of mats) m.resolution.set(size.width, size.height)
  }, [mats, size])
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats])
}
