import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Box } from './Box'
import { MeshInset } from './MeshInset'
import { Anchor } from './Stage3D'
import { approach, createMaterials, disposeMaterials, setOpacity, PITCH_M, type LabelBus, type Shot } from './kit'
import { prefersReducedMotion } from '../../lib/motion'

/**
 * The corner of a thin panel, cut open: a 20 mm concrete face with a return, RTARIUM (the 10 mm
 * option) at mid-thickness, 5 mm of concrete either side, as the homepage shows it. At the cut the
 * concrete steps back layer by layer (the cover, then the concrete inside the mesh) so the mesh is
 * seen in place, turning with the panel into its return. Once, as the page opens, the cut pieces
 * lift away; then it holds still.
 */

export const CUTAWAY_SHOT: { wide: Shot; compact: Shot } = {
  wide: { target: [0.06, -0.01, -0.04], dist: 1.78, azim: 36, elev: 18, frame: [0.7, 0.55] },
  compact: { target: [0.06, -0.01, -0.04], dist: 2.3, azim: 36, elev: 18, frame: [0.5, 0.5] },
}

// layers through the face (z) and the return (x): back cover, mesh zone, front cover
const F = { x0: -0.27, x1: 0.24, y0: -0.18, y1: 0.18 }
const R = { z0: -0.14 }

type Piece = { from: [number, number, number]; to: [number, number, number]; dir: [number, number, number] }

/** what is cut away: front cover of the face, the concrete inside the mesh zone, and the same on the return */
const CUT: Piece[] = [
  { from: [0.04, F.y0, 0.005], to: [0.24, 0.0, 0.01], dir: [0, 0, 1] },
  { from: [0.08, F.y0, -0.005], to: [0.235, -0.05, 0.005], dir: [0, 0, 1] },
  { from: [0.235, F.y0, -0.08], to: [0.24, 0.0, 0.005], dir: [1, 0, 0] },
  { from: [0.225, F.y0, -0.07], to: [0.235, -0.05, -0.005], dir: [1, 0, 0] },
]

export function PanelCutaway({ bus, play }: { bus: LabelBus; play: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const m = useMemo(() => createMaterials(), [])
  const cutMats = useMemo(() => CUT.map(() => m.panel.clone()), [m])
  useEffect(
    () => () => {
      disposeMaterials(m)
      cutMats.forEach((c) => c.dispose())
    },
    [m, cutMats],
  )
  const pieces = useRef<(THREE.Mesh | null)[]>([])
  const meshes = useRef<THREE.Group>(null)
  const t = useRef<Record<string, number>>({ open: reduced ? 1 : 0, show: reduced ? 1 : 0 })
  const [started, setStarted] = useState(reduced)
  useEffect(() => {
    if (!play || started) return
    const id = window.setTimeout(() => setStarted(true), 650)
    return () => window.clearTimeout(id)
  }, [play, started])
  useEffect(() => invalidate(), [started, play, invalidate])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const s = t.current
    let moving = false
    if (approach(s, 'show', play ? 1 : 0, reduced ? 1e3 : 3.5, dt)) moving = true
    if (approach(s, 'open', started ? 1 : 0, reduced ? 1e3 : 1.4, dt)) moving = true
    setOpacity(Object.values(m) as THREE.Material[], s.show)
    // the yarn material is opaque: the mesh comes in with the concrete round it
    if (meshes.current) meshes.current.visible = s.show > 0.35
    CUT.forEach((c, i) => {
      // each cut piece lifts away a beat after the one before
      const k = Math.min(1, Math.max(0, s.open * 1.6 - i * 0.18))
      const e = 1 - Math.pow(1 - k, 3)
      const p = pieces.current[i]
      if (p) p.position.set((c.from[0] + c.to[0]) / 2 + c.dir[0] * e * 0.09, (c.from[1] + c.to[1]) / 2, (c.from[2] + c.to[2]) / 2 + c.dir[2] * e * 0.09)
      setOpacity([cutMats[i]], (1 - e) * s.show)
    })
    if (moving) invalidate()
  }, -2)

  const solid: ReactNode[] = [
    // face: back cover, mesh zone (less the cut), front cover (less the cut)
    <Box key="fb" from={[F.x0, F.y0, -0.01]} to={[0.225, F.y1, -0.005]} mat={m.panel} />,
    <Box key="fm1" from={[F.x0, -0.05, -0.005]} to={[0.235, F.y1, 0.005]} mat={m.panel} />,
    <Box key="fm2" from={[F.x0, F.y0, -0.005]} to={[0.08, -0.05, 0.005]} mat={m.panel} />,
    <Box key="ff1" from={[F.x0, 0.0, 0.005]} to={[F.x1, F.y1, 0.01]} mat={m.panel} />,
    <Box key="ff2" from={[F.x0, F.y0, 0.005]} to={[0.04, 0.0, 0.01]} mat={m.panel} />,
    // return: inner cover, mesh zone, outer cover (less the cut)
    <Box key="rb" from={[0.22, F.y0, R.z0]} to={[0.225, F.y1, -0.01]} mat={m.panel} />,
    <Box key="rm1" from={[0.225, -0.05, R.z0]} to={[0.235, F.y1, -0.005]} mat={m.panel} />,
    <Box key="rm2" from={[0.225, F.y0, R.z0]} to={[0.235, -0.05, -0.07]} mat={m.panel} />,
    <Box key="rf1" from={[0.235, 0.0, R.z0]} to={[F.x1, F.y1, 0.005]} mat={m.panel} />,
    <Box key="rf2" from={[0.235, F.y0, R.z0]} to={[F.x1, 0.0, -0.08]} mat={m.panel} />,
  ]

  // the mesh, only where the cut can show it (the rest of it is inside the concrete)
  // the mesh only where the concrete inside it is cut away (CUT[1] and CUT[3]): nowhere can a yarn reach the surface
  const faceCells = { nx: Math.floor(0.15 / PITCH_M), ny: Math.floor(0.126 / PITCH_M) }
  const returnCells = { nx: Math.floor(0.062 / PITCH_M), ny: faceCells.ny }
  return (
    <group>
      {solid}
      {CUT.map((c, i) => (
        <mesh key={i} ref={(el) => void (pieces.current[i] = el)} material={cutMats[i]}>
          <boxGeometry args={[c.to[0] - c.from[0], c.to[1] - c.from[1], c.to[2] - c.from[2]]} />
        </mesh>
      ))}
      <group ref={meshes} visible={false}>
        <group position={[0.158, -0.116, 0]}>
          <MeshInset nx={faceCells.nx} ny={faceCells.ny} />
        </group>
        <group position={[0.23, -0.116, -0.038]} rotation={[0, Math.PI / 2, 0]}>
          <MeshInset nx={returnCells.nx} ny={returnCells.ny} />
        </group>
      </group>
      <Anchor bus={bus} id="h-mesh" position={[0.14, -0.12, 0.004]} />
      <Anchor bus={bus} id="h-concrete" position={[-0.12, 0.09, 0.01]} />
      <Anchor bus={bus} id="h-return" position={[0.236, -0.13, -0.04]} />
      <Anchor bus={bus} id="h-cover" position={[0.06, 0.0, 0.0075]} />
    </group>
  )
}
