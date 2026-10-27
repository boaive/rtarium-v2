import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { MeshField, useCell, useYarnMaterial } from '../../three/mesh/MeshField'

/** basalt: the homepage's bronze-brown rovings and darker connecting fibres */
const FACE = '#a07a55'
const PILE = '#4a3322'

/**
 * A piece of the real RTARIUM model (the Blender cell of the homepage, 10 mm option), for close-ups
 * where the mesh itself has to read. It lies in the XY plane, its thickness along z; `nx` × `ny`
 * cells, centred on the group's origin.
 */
export function MeshInset({ nx, ny, visible = true, lod = 0.45, shadows = false }: { nx: number; ny: number; visible?: boolean; lod?: number; shadows?: boolean }) {
  const cell = useCell(10)
  const yarn = useYarnMaterial({ lite: true })
  // the model arrives after its canvas may have stopped drawing (nothing moving): draw it in
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => invalidate(), [invalidate, cell, yarn])
  useEffect(() => {
    const u = yarn.uniforms
    u.uFaceColor.value.set(FACE)
    u.uPileColor.value.set(PILE)
    u.uWin.value.set(4096, 4096)
    u.uAoStrength.value = 0.9
  }, [yarn])
  return (
    // the sheet is modelled in XZ with its upper face up (+y); turned so that face looks out along +z
    <group visible={visible} rotation={[Math.PI / 2, 0, 0]}>
      <MeshField cell={cell} nx={nx} nz={ny} material={yarn.material} depthMaterial={shadows ? yarn.depthMaterial : undefined} shadows={shadows} chunk={8} lodDistance={lod} culling={false} />
    </group>
  )
}
