import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshInset } from './MeshInset'
import { Anchor } from './Stage3D'
import { grainTexture, type LabelBus } from './kit'
import { prefersReducedMotion } from '../../lib/motion'

/**
 * The opening: a thin façade panel of textile reinforced concrete, isolated over its shadow on the
 * yellow ground. RTARIUM (the 10 mm option) runs the whole panel; 20 mm of concrete has been cast
 * over most of it, and where the pour stops the bare textile carries on, so both read at once: the
 * textile, and the thin concrete it makes. As the page opens the concrete is poured across it, once.
 */

export const PANEL = { w: 0.56, h: 0.36, t: 0.02 }
/** where the pour stops: the concrete covers the panel from here to its right edge */
const CAST_TO = -0.07

/** an uneven pour front: the concrete's free edge, a few millimetres either way */
function pourFront(y: number) {
  return 0.5 * Math.sin(y * 41 + 0.6) + 0.3 * Math.sin(y * 97 + 2.1) + 0.2 * Math.sin(y * 173 + 4.2)
}

export function HeroPanel({ bus, play }: { bus: LabelBus; play: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const mats = useMemo(() => {
    const map = grainTexture('#d9d3c7', 7000, [168, 228], 2)
    return {
      concrete: new THREE.MeshStandardMaterial({ color: '#dcd6ca', map, roughness: 0.86, metalness: 0 }),
      catcher: new THREE.ShadowMaterial({ color: '#4a3000', transparent: true, opacity: 0.3, depthWrite: false }),
    }
  }, [])
  // a unit block from x = 0 (the pour front, made uneven) to x = 1, scaled to the cast width
  const geo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, PANEL.h, PANEL.t, 1, 36, 1).translate(0.5, 0, 0)
    const pos = g.getAttribute('position')
    for (let i = 0; i < pos.count; i++) if (pos.getX(i) < 0.01) pos.setX(i, 0.035 * pourFront(pos.getY(i)))
    g.computeVertexNormals()
    return g
  }, [])
  useEffect(
    () => () => {
      geo.dispose()
      mats.concrete.map?.dispose()
      mats.concrete.dispose()
      mats.catcher.dispose()
    },
    [geo, mats],
  )

  const cast = useRef<THREE.Mesh>(null)
  const panel = useRef<THREE.Group>(null)
  const t = useRef({ pour: reduced ? 1 : 0, rise: reduced ? 1 : 0 })
  const [started, setStarted] = useState(reduced)
  useEffect(() => {
    if (!play || started) return
    const id = window.setTimeout(() => setStarted(true), 450)
    return () => window.clearTimeout(id)
  }, [play, started])
  useEffect(() => invalidate(), [started, invalidate])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const s = t.current
    let moving = false
    // the panel settles over its shadow first, then the concrete is poured across the textile
    if (started && s.rise < 1) {
      s.rise = Math.min(1, s.rise + dt / 0.9)
      moving = true
    }
    if (started && s.rise > 0.55 && s.pour < 1) {
      s.pour = Math.min(1, s.pour + dt / 1.7)
      moving = true
    }
    const rise = 1 - Math.pow(1 - s.rise, 3)
    const pour = 1 - Math.pow(1 - s.pour, 3)
    // once it has settled it floats a little over its shadow, in time (the camera asks for the frames)
    const bob = reduced || s.rise < 1 ? 0 : 0.004 * Math.sin((performance.now() / 1000) * ((Math.PI * 2) / 6.5))
    if (panel.current) panel.current.position.y = (1 - rise) * 0.05 + bob
    const x0 = PANEL.w / 2 - (PANEL.w / 2 - CAST_TO) * pour
    if (cast.current) {
      cast.current.visible = pour > 0.002
      cast.current.position.x = x0
      cast.current.scale.x = Math.max(1e-3, PANEL.w / 2 - x0)
    }
    if (moving) invalidate()
  }, -2)

  return (
    <group>
      <group ref={panel}>
        <MeshInset nx={46} ny={29} lod={2.2} shadows />
        <mesh ref={cast} geometry={geo} material={mats.concrete} castShadow receiveShadow visible={false} />
        <Anchor bus={bus} id="hp-mesh" position={[-0.2, 0.07, 0.006]} />
        <Anchor bus={bus} id="hp-cast" position={[0.12, 0.1, PANEL.t / 2]} />
        <Anchor bus={bus} id="hp-edge" position={[PANEL.w / 2, -0.1, PANEL.t / 2]} />
      </group>
      <mesh position={[0, -PANEL.h / 2 - 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.catcher} receiveShadow>
        <planeGeometry args={[3, 3]} />
      </mesh>
    </group>
  )
}
