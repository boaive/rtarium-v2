import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'

/**
 * Drawings with a weight: line segments drawn `width` pixels wide (a plain line is one pixel, which
 * reads as a hairline scratch at a distance). The geometry is any segment list (pairs of points).
 */
export function FatLines({ geometry, color, width = 1.6, opacity = 1, material }: { geometry: THREE.BufferGeometry; color?: string; width?: number; opacity?: number; material?: LineMaterial }) {
  const size = useThree((s) => s.size)
  const own = useMemo(() => (material ? null : new LineMaterial({ color: new THREE.Color(color ?? '#080808').getHex(), linewidth: width, transparent: true, opacity, depthWrite: false })), [material, color, width, opacity])
  const mat = material ?? own!
  const obj = useMemo(() => {
    const g = new LineSegmentsGeometry()
    g.setPositions((geometry.getAttribute('position').array as Float32Array).slice())
    const o = new LineSegments2(g, mat)
    o.frustumCulled = false
    return o
  }, [geometry, mat])
  useEffect(() => void mat.resolution.set(size.width, size.height), [mat, size])
  useEffect(
    () => () => {
      obj.geometry.dispose()
      own?.dispose()
    },
    [obj, own],
  )
  return <primitive object={obj} />
}

/** a material for fat lines that a scene fades itself (opacity, visible) */
export function fatMaterial(color: string, width: number, opacity = 1) {
  return new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width, transparent: true, opacity, depthWrite: false })
}

/**
 * Keeps a scene that moves in its own time drawing: a canvas renders only when asked, and one that was
 * built while off screen stops asking. Any scroll (or resize) while its section is on screen asks
 * again, and from then on the scene keeps itself going.
 */
export function Wake({ live }: { live: { current: boolean } }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const on = () => {
      if (live.current) invalidate()
    }
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    const id = window.setInterval(on, 700)
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      window.clearInterval(id)
    }
  }, [live, invalidate])
  return null
}
