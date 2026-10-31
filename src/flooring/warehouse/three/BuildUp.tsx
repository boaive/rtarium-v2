import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { LabelBus } from '../../../facade/three/kit'
import { MovingKeyLight } from '../../../facade/three/Stage3D'
import { Wake } from '../../../facade/three/rain/lines'
import { prefersReducedMotion } from '../../../lib/motion'
import { Piece } from './Piece'

/** The floor as the consultant reads it: the finished piece of the opening, its cut face and stepped corner in view, turning a little in its own time. */
export function BuildUp({ bus, live }: { bus: LabelBus; live: { current: boolean } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useFrame(() => {
    const t = performance.now() / 1000
    const az = ((-38 + (reduced ? 0 : 5 * Math.sin((t * Math.PI * 2) / 14))) * Math.PI) / 180
    const el = (24 * Math.PI) / 180
    const d = 4.6
    camera.fov = 26
    camera.position.set(-0.3 + d * Math.cos(el) * Math.sin(az), 0.08 + d * Math.sin(el), 0.2 + d * Math.cos(el) * Math.cos(az))
    camera.lookAt(-0.3, 0.08, 0.2)
    camera.updateProjectionMatrix()
    if (live.current && !reduced) invalidate()
  }, -1)
  return (
    <>
      <Wake live={live} />
      <MovingKeyLight focus={[0, 0, 0]} reach={1.6} offset={[-3, 6, 4]} />
      <Piece bus={bus} ids={{ mesh: 'bw-mesh', screed: 'bw-screed', coat: 'bw-coat', slab: 'bw-slab' }} />
    </>
  )
}
