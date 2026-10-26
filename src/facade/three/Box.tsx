import type * as THREE from 'three'

/** An axis-aligned block between two corners (metres): the unit every assembly here is built from. */
export function Box({ from, to, mat }: { from: [number, number, number]; to: [number, number, number]; mat: THREE.Material }) {
  const size: [number, number, number] = [Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]), Math.abs(to[2] - from[2])]
  const pos: [number, number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]
  return (
    <mesh position={pos} material={mat}>
      <boxGeometry args={size} />
    </mesh>
  )
}

/** the arrow of a dimension or an air path: a fine shaft and a head, along +y of its group */
export function ArrowLine({ length, mat, radius = 0.006 }: { length: number; mat: THREE.Material; radius?: number }) {
  return (
    <group>
      <mesh material={mat} position={[0, length / 2 - radius * 3, 0]}>
        <cylinderGeometry args={[radius, radius, length - radius * 6, 8]} />
      </mesh>
      <mesh material={mat} position={[0, length - radius * 4, 0]}>
        <coneGeometry args={[radius * 3, radius * 9, 16]} />
      </mesh>
    </group>
  )
}
