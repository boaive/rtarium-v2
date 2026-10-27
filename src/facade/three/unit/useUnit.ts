import { useEffect, useMemo } from 'react'
import type * as THREE from 'three'
import { anchorGeometry, disposeUnitMaterials, frameGeometry, gasketGeometry, glassGeometry, insulationGeometry, panelGeometry, unitMaterials, vapourGeometry, windowGeometry, type UnitMaterials } from './parts'

export interface UnitGeometries {
  frame: THREE.BufferGeometry
  window: THREE.BufferGeometry
  glass: THREE.BufferGeometry
  gasket: THREE.TubeGeometry
  vapour: THREE.BufferGeometry
  insulation: THREE.BufferGeometry
  panel: THREE.BufferGeometry
  anchors: THREE.BufferGeometry
}

/** the unit's geometry, built once per scene and freed with it (`cut`: where the skin is opened to the textile) */
export function useUnitGeometries(cut?: [number, number, number, number]): UnitGeometries {
  const key = cut?.join(',')
  const geo = useMemo(
    () => ({
      frame: frameGeometry(),
      window: windowGeometry(),
      glass: glassGeometry(),
      gasket: gasketGeometry(),
      vapour: vapourGeometry(),
      insulation: insulationGeometry(),
      panel: panelGeometry(cut),
      anchors: anchorGeometry(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])
  return geo
}

export function useUnitMaterials(): UnitMaterials {
  const m = useMemo(unitMaterials, [])
  useEffect(() => () => disposeUnitMaterials(m), [m])
  return m
}
