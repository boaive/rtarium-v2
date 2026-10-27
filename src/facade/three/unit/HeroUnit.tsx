import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshInset } from '../MeshInset'
import { Anchor } from '../Stage3D'
import { PITCH_M, type LabelBus } from '../kit'
import { prefersReducedMotion } from '../../../lib/motion'
import { block, U, Z } from './parts'
import { useUnitGeometries, useUnitMaterials } from './useUnit'

/**
 * The opening: one finished unit, isolated over its shadow on the yellow ground. Down the pier
 * nearest the visitor the outer half of the skin is cut back, and RTARIUM shows at mid-thickness,
 * running the height of the panel. As the page opens the unit settles, then the cover over the cut
 * lifts away, once. Only the textile is warm; everything else is the unit's own muted materials.
 */

/** the cut down the near pier, the right-hand one as the unit is seen (x0, y0, x1, y1) */
export const HERO_CUT: [number, number, number, number] = [U.w - 0.4, 0.36, U.w - 0.07, 1.72]
const ZM = (Z.panel[0] + Z.panel[1]) / 2
export const HERO_TARGET: [number, number, number] = [U.w / 2, U.h / 2 - 0.1, 0.12]

export function HeroUnit({ bus, play }: { bus: LabelBus; play: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const geo = useUnitGeometries(HERO_CUT)
  const m = useUnitMaterials()
  const coverMat = useMemo(() => m.concrete.clone(), [m])
  // on yellow a clear pane would show the ground through and read olive: the glass is denser here
  useMemo(() => {
    m.glass.opacity = m.glass.userData.base = 0.97
  }, [m])
  const catcher = useMemo(() => new THREE.ShadowMaterial({ color: '#4a3000', transparent: true, opacity: 0.28, depthWrite: false }), [])
  const coverGeo = useMemo(() => {
    const [a, b, c, d] = HERO_CUT
    return block([a, b, ZM - 0.004], [c, d, Z.panel[1]])
  }, [])
  useEffect(
    () => () => {
      coverMat.dispose()
      catcher.dispose()
      coverGeo.dispose()
    },
    [coverMat, catcher, coverGeo],
  )

  const unit = useRef<THREE.Group>(null)
  const cover = useRef<THREE.Mesh>(null)
  const t = useRef({ rise: reduced ? 1 : 0, open: reduced ? 1 : 0 })
  const [started, setStarted] = useState(reduced)
  useEffect(() => {
    if (!play || started) return
    const id = window.setTimeout(() => setStarted(true), 300)
    return () => window.clearTimeout(id)
  }, [play, started])
  useEffect(() => invalidate(), [started, invalidate])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const s = t.current
    let moving = false
    if (started && s.rise < 1) {
      s.rise = Math.min(1, s.rise + dt / 1.1)
      moving = true
    }
    if (started && s.rise > 0.7 && s.open < 1) {
      s.open = Math.min(1, s.open + dt / 1.3)
      moving = true
    }
    const rise = 1 - Math.pow(1 - s.rise, 3)
    const open = s.open < 0.5 ? 4 * s.open ** 3 : 1 - Math.pow(-2 * s.open + 2, 3) / 2
    if (unit.current) unit.current.position.y = (1 - rise) * -0.18
    if (cover.current) {
      cover.current.position.z = open * 0.34
      cover.current.position.x = open * -0.06
      cover.current.visible = open < 0.995
    }
    coverMat.opacity = 1 - Math.max(0, (open - 0.35) / 0.65)
    coverMat.depthWrite = coverMat.opacity > 0.97
    if (moving) invalidate()
  }, -2)

  const [a, b, c, d] = HERO_CUT
  return (
    <group>
      <group ref={unit}>
        <mesh geometry={geo.frame} material={m.steel} castShadow />
        <mesh geometry={geo.vapour} material={m.vapour} />
        <mesh geometry={geo.insulation} material={m.insulation} castShadow />
        <mesh geometry={geo.anchors} material={m.darkSteel} />
        <mesh geometry={geo.window} material={m.alu} castShadow />
        <mesh geometry={geo.gasket} material={m.gasket} />
        <mesh geometry={geo.glass} material={m.glass} renderOrder={2} />
        <mesh geometry={geo.panel} material={m.concrete} castShadow receiveShadow />
        <mesh ref={cover} geometry={coverGeo} material={coverMat} castShadow />
        <group position={[(a + c) / 2, (b + d) / 2, ZM + 0.001]}>
          <Suspense fallback={null}>
            <MeshInset nx={Math.floor((c - a) / PITCH_M)} ny={Math.floor((d - b) / PITCH_M)} lod={1.4} />
          </Suspense>
        </group>
        <Anchor bus={bus} id="hu-mesh" position={[(a + c) / 2 - 0.04, d - 0.36, ZM + 0.006]} />
        <Anchor bus={bus} id="hu-skin" position={[U.w - 0.24, U.h - 0.5, Z.panel[1]]} />
      </group>
      <mesh position={[U.w / 2, -0.26, 0.4]} rotation={[-Math.PI / 2, 0, 0]} material={catcher} receiveShadow>
        <planeGeometry args={[14, 14]} />
      </mesh>
    </group>
  )
}
