import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { MeshInset } from '../../../facade/three/MeshInset'
import { Anchor } from '../../../facade/three/Stage3D'
import type { LabelBus } from '../../../facade/three/kit'
import { block, merge } from '../../../facade/three/unit/parts'
import { buttonGeometry, layer, PITCH, uvBox } from '../../data/three/dc'
import { buttonSpots } from '../../data/three/Piece'
import { disposeKit, fabKit, LAY, MESH_Y, PX, PZ, SLAB, TOP, waffle } from './fab'

/**
 * A piece of the finished fab floor, cut out of a cleanroom and set on the ground over its shadow: the
 * post-tensioned waffle slab, its ribs and coffers open on the cut faces; the vapour barrier on the
 * ground deck; 20 mm of graphene self-levelling concrete over RTARIUM; the ESD system on it. At its
 * front left corner the layers are stepped back, each a little further than the one over it: the top
 * coat, the conductive primer with its copper grounding tape, the screed, down to RTARIUM on its height
 * buttons. The order the floor is made in, read from the top down.
 */

/** where each layer stops at the corner (x, z): the coat, the primer and its tape, the screed */
const STEP = { coat: [-0.52, 0.24], primer: [-0.7, 0.36], slc: [-0.88, 0.48] } as const
/** the copper grounding tape's grid on the primer, and its width */
const TAPE_X = [-0.6, 0, 0.6]
const TAPE_Z = [-0.3, 0.3]
const TAPE_W = 0.025

/** a layer over the piece, less the corner it is stepped back from */
function stepped(y0: number, t: number, [cx, cz]: readonly [number, number]) {
  const [x0, x1] = PX
  const [z0, z1] = PZ
  return uvBox(merge([block([x0, y0, z0], [x1, y0 + t, cz]), block([cx, y0, cz], [x1, y0 + t, z1])]), 2)
}

export function Piece({ bus, ids = {}, ground = true }: { bus?: LabelBus; ids?: { mesh?: string; slc?: string; coat?: string; tape?: string; slab?: string }; ground?: boolean }) {
  const m = useMemo(fabKit, [])
  const g = useMemo(() => {
    const w = waffle(PX, PZ)
    const [sx, sz] = STEP.slc
    const spots = buttonSpots([PX[0], sx], [sz, PZ[1]], 0.09)
    const b = buttonGeometry()
    const buttons = merge(spots.map(([x, z]) => b.clone().translate(x, SLAB + LAY.barrier, z)))
    b.dispose()
    const y = TOP + LAY.cond
    const tape = merge([
      ...TAPE_X.map((x) => block([x - TAPE_W / 2, y, PZ[0]], [x + TAPE_W / 2, y + LAY.tape, PZ[1]])),
      ...TAPE_Z.map((z) => block([PX[0], y, z - TAPE_W / 2], [PX[1], y + LAY.tape, z + TAPE_W / 2])),
    ])
    return {
      ...w,
      barrier: layer(PX, PZ, SLAB, LAY.barrier),
      buttons,
      slc: stepped(SLAB + LAY.barrier, LAY.slc - LAY.barrier, STEP.slc),
      primer: stepped(TOP, LAY.cond, STEP.primer),
      tape,
      coat: stepped(TOP + LAY.cond, LAY.coat, STEP.coat),
      catcher: new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2),
    }
  }, [])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      disposeKit(m)
    },
    [g, m],
  )

  // RTARIUM in the stepped-back corner, at its own pitch, 5 mm off the slab
  const [sx, sz] = STEP.slc
  const w = sx - PX[0]
  const d = PZ[1] - sz
  const nx = Math.floor((w - 0.006) / PITCH)
  const nz = Math.floor((d - 0.006) / PITCH)

  return (
    <group>
      <mesh geometry={g.ribs} material={m.waffle} castShadow receiveShadow />
      <mesh geometry={g.deck} material={m.waffle} castShadow receiveShadow />
      <mesh geometry={g.barrier} material={m.barrier} receiveShadow />
      <mesh geometry={g.buttons} material={m.button} castShadow />
      <group position={[PX[0] + w / 2, MESH_Y, sz + d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <Suspense fallback={null}>
          <MeshInset nx={nx} ny={nz} lod={2.4} shadows />
        </Suspense>
      </group>
      <mesh geometry={g.slc} material={m.slc} castShadow receiveShadow />
      <mesh geometry={g.primer} material={m.conductive} receiveShadow />
      <mesh geometry={g.tape} material={m.copper} receiveShadow />
      <mesh geometry={g.coat} material={m.coat} castShadow receiveShadow />
      {ground && <mesh geometry={g.catcher} material={m.catcher} position={[0, -0.002, 0]} receiveShadow />}
      {bus && (
        <>
          {ids.mesh && <Anchor bus={bus} id={ids.mesh} position={[PX[0] + w * 0.45, MESH_Y + 0.004, sz + d * 0.55]} />}
          {ids.slc && <Anchor bus={bus} id={ids.slc} position={[(STEP.slc[0] + STEP.primer[0]) / 2, TOP, PZ[1] - 0.06]} />}
          {ids.tape && <Anchor bus={bus} id={ids.tape} position={[TAPE_X[0], TOP + LAY.cond + LAY.tape, (STEP.primer[1] + PZ[1]) / 2 + 0.08]} />}
          {ids.coat && <Anchor bus={bus} id={ids.coat} position={[0.4, TOP + LAY.cond + LAY.coat, 0.5]} />}
          {ids.slab && <Anchor bus={bus} id={ids.slab} position={[0.45, 0.3, PZ[1]]} />}
        </>
      )}
    </group>
  )
}
