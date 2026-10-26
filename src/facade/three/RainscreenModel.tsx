import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { ArrowLine, Box } from './Box'
import { CutPanel } from './CutPanel'
import { Anchor } from './Stage3D'
import { approach, cloneMaterials, createMaterials, disposeMaterials, setOpacity, type FacadeMaterials, type LabelBus, type Shot } from './kit'
import { prefersReducedMotion } from '../../lib/motion'

/**
 * Rainscreen Cladding: an outer skin of thin RTARIUM panels held off the wall, with a ventilated
 * cavity behind it. The support frame is drawn generically (brackets on the wall, vertical rails,
 * fixings to anchors cast into the panels): the client's material names the cavity and the
 * panels, not a subframe product. Panels here are 4 m long, two to a row. Axes: x along the wall,
 * y up, z out; the wall's face on z = 0.
 */

export type RainscreenView = 'finished' | 'buildup' | 'cavity' | 'panel' | 'preview'
/** `right`: the right-hand column of panels, held back in the build-up so the support frame behind shows */
type Part = 'wall' | 'brackets' | 'rails' | 'panels' | 'right'
const PARTS: Part[] = ['wall', 'brackets', 'rails', 'panels', 'right']

const WALL = { x1: 8.4, y1: 3.75, t: 0.25 }
const RAILS = Array.from({ length: 8 }, (_, i) => 0.6 + i)
const ROWS = [0, 1, 2].map((j) => 0.1 + j * 1.162)
const PANEL = { h: 1.15, z0: 0.172, z1: 0.192, joint: 0.012 }
const L = 4

export const RAINSCREEN_SHOTS: Record<RainscreenView, { wide: Shot; compact: Shot }> = {
  finished: {
    wide: { target: [4.2, 1.85, 0], dist: 19, azim: 30, elev: 8, frame: [0.64, 0.48] },
    compact: { target: [4.2, 1.85, 0], dist: 28, azim: 28, elev: 8, frame: [0.5, 0.32] },
  },
  buildup: {
    wide: { target: [4.6, 1.85, 0.3], dist: 25, azim: 40, elev: 12, frame: [0.36, 0.5] },
    compact: { target: [4.6, 1.85, 0.42], dist: 28, azim: 54, elev: 12, frame: [0.5, 0.31] },
  },
  cavity: {
    wide: { target: [8.3, 1.85, 0.05], dist: 11, azim: 64, elev: 6, frame: [0.64, 0.5] },
    compact: { target: [8.3, 1.7, 0.05], dist: 14, azim: 82, elev: 5, frame: [0.5, 0.3] },
  },
  panel: {
    wide: { target: [7.74, 3.12, 0.17], dist: 2.3, azim: 150, elev: 10, frame: [0.4, 0.5] },
    compact: { target: [7.74, 3.12, 0.17], dist: 2.9, azim: 150, elev: 10, frame: [0.5, 0.3] },
  },
  preview: {
    wide: { target: [4.4, 1.85, 0.4], dist: 22, azim: 64, elev: 14, frame: [0.5, 0.5] },
    compact: { target: [4.4, 1.85, 0.4], dist: 25, azim: 62, elev: 14, frame: [0.5, 0.5] },
  },
}

const SPREAD: Record<RainscreenView, Record<Part, number>> = {
  finished: { wall: 0, brackets: 0, rails: 0, panels: 0, right: 0 },
  buildup: { wall: 0, brackets: 0, rails: 0, panels: 0.3, right: 0.3 },
  cavity: { wall: 0, brackets: 0, rails: 0, panels: 0, right: 0 },
  panel: { wall: 0, brackets: 0, rails: 0, panels: 0, right: 0 },
  preview: { wall: 0, brackets: 0, rails: 0, panels: 0.3, right: 0.3 },
}
/** what each view shows: in the build-up the right half of the cladding is left off; seen from the cavity, the wall is */
const SHOW: Record<RainscreenView, Record<Part, number>> = {
  finished: { wall: 1, brackets: 1, rails: 1, panels: 1, right: 1 },
  buildup: { wall: 1, brackets: 1, rails: 1, panels: 1, right: 0 },
  cavity: { wall: 1, brackets: 1, rails: 1, panels: 1, right: 1 },
  panel: { wall: 0, brackets: 0, rails: 1, panels: 1, right: 1 },
  preview: { wall: 1, brackets: 1, rails: 1, panels: 1, right: 0 },
}

function Wall({ m }: { m: FacadeMaterials }) {
  return <Box from={[0, -0.25, -WALL.t]} to={[WALL.x1, WALL.y1, 0]} mat={m.wall} />
}

function Brackets({ m }: { m: FacadeMaterials }) {
  const items: ReactNode[] = []
  for (const x of RAILS) {
    for (const y of [0.45, 1.65, 2.85]) {
      items.push(<Box key={`p${x}${y}`} from={[x - 0.045, y - 0.07, 0]} to={[x + 0.045, y + 0.07, 0.008]} mat={m.darkSteel} />)
      items.push(<Box key={`f${x}${y}`} from={[x - 0.006, y - 0.07, 0]} to={[x + 0.004, y + 0.07, 0.13]} mat={m.darkSteel} />)
    }
  }
  return <>{items}</>
}

function Rails({ m }: { m: FacadeMaterials }) {
  const items: ReactNode[] = []
  for (const x of RAILS) {
    items.push(<Box key={`w${x}`} from={[x + 0.004, 0.08, 0.05]} to={[x + 0.01, 3.62, 0.155]} mat={m.steel} />)
    items.push(<Box key={`f${x}`} from={[x - 0.04, 0.08, 0.155]} to={[x + 0.055, 3.62, 0.161]} mat={m.steel} />)
  }
  return <>{items}</>
}

/** the panel cut open at its far end in the close-up: the top row's second panel */
const CUT: [number, number, number, number] = [7.62, 2.96, 8.02, 3.42]

function Panels({ m, column, open, mesh, fade }: { m: FacadeMaterials; column: 0 | 1; open: boolean; mesh: boolean; fade: MutableRefObject<number> }) {
  const items: ReactNode[] = []
  ROWS.forEach((y0, j) => {
    for (const k of [column]) {
      const x0 = 0.1 + k * (L + PANEL.joint)
      const x1 = x0 + L - PANEL.joint
      if (j === 2 && k === 1) items.push(<CutPanel key={`p${j}${k}`} rect={[x0, y0, x1, y0 + PANEL.h]} cut={CUT} zb={PANEL.z0} zf={PANEL.z1} mat={m.panel} open={open} mesh={mesh} fade={fade} side="back" />)
      else items.push(<Box key={`p${j}${k}`} from={[x0, y0, PANEL.z0]} to={[x1, y0 + PANEL.h, PANEL.z1]} mat={m.panel} />)
      // fixings from the rails to anchors cast into the back of the panel
      for (const x of RAILS) {
        if (x < x0 + 0.1 || x > x1 - 0.1) continue
        for (const y of [y0 + 0.12, y0 + PANEL.h - 0.17]) items.push(<Box key={`a${j}${k}${x}${y}`} from={[x - 0.03, y, 0.161]} to={[x + 0.04, y + 0.05, PANEL.z0]} mat={m.darkSteel} />)
      }
    }
  })
  return <>{items}</>
}

/** air enters the cavity at its foot and leaves at its head: three plain arrows in the cavity, nothing else */
function Air({ m }: { m: FacadeMaterials }) {
  const x = WALL.x1 - 0.12
  const z = 0.086
  return (
    <group>
      {[
        [-0.55, 0.6],
        [1.4, 0.8],
        [3.45, 0.7],
      ].map(([y, len], i) => (
        <group key={i} position={[x, y, z]}>
          <ArrowLine length={len} mat={m.ink} radius={0.012} />
        </group>
      ))}
    </group>
  )
}

export function RainscreenModel({ view, bus, active = true, offset = [0, 0, 0] }: { view: RainscreenView; bus: LabelBus; active?: boolean; offset?: [number, number, number] }) {
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const base = useMemo(() => createMaterials(), [])
  const parts = useMemo(() => Object.fromEntries(PARTS.map((p) => [p, cloneMaterials(base)])) as Record<Part, FacadeMaterials>, [base])
  useEffect(
    () => () => {
      disposeMaterials(base)
      for (const p of PARTS) disposeMaterials(parts[p])
    },
    [base, parts],
  )
  const groups = useRef<Partial<Record<Part, THREE.Group | null>>>({})
  const state = useRef<Record<string, number>>({ all: 0, air: 0, ...Object.fromEntries(PARTS.flatMap((p) => [[`z_${p}`, 0], [`o_${p}`, 1]])) })
  const panelFade = useRef(1)
  // the real mesh loads only once the visitor is near the close-up
  const [meshOn, setMeshOn] = useState(false)
  useEffect(() => {
    if (view === 'cavity' || view === 'panel') setMeshOn(true)
  }, [view])

  useEffect(() => invalidate(), [view, active, invalidate])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const s = state.current
    const lam = reduced ? 1e3 : 3
    let moving = false
    const go = (k: string, to: number, l = lam) => {
      if (approach(s, k, to, l, dt, 2e-4)) moving = true
    }
    go('all', active ? 1 : 0, reduced ? 1e3 : 4.5)
    go('air', view === 'cavity' ? 1 : 0)
    for (const p of PARTS) {
      go(`z_${p}`, SPREAD[view][p], reduced ? 1e3 : 2.6)
      const g = groups.current[p]
      if (g) g.position.z = s[`z_${p}`]
      go(`o_${p}`, SHOW[view][p])
      setOpacity(Object.values(parts[p]) as THREE.Material[], s[`o_${p}`] * s.all)
    }
    panelFade.current = s.o_right * s.all
    setOpacity([base.ink], s.air * s.all)
    if (moving) invalidate()
  }, -2)

  return (
    <group position={offset}>
      <group ref={(g) => void (groups.current.wall = g)}>
        <Wall m={parts.wall} />
        <Anchor bus={bus} id="r-wall" position={[7.1, 3.25, 0]} />
        <Anchor bus={bus} id="r-wall-end" position={[WALL.x1, 0.9, -0.12]} />
      </group>
      <group ref={(g) => void (groups.current.brackets = g)}>
        <Brackets m={parts.brackets} />
        <Anchor bus={bus} id="r-bracket" position={[RAILS[6] - 0.004, 1.65, 0.1]} />
      </group>
      <group ref={(g) => void (groups.current.rails = g)}>
        <Rails m={parts.rails} />
        <Anchor bus={bus} id="r-rail" position={[RAILS[5] + 0.05, 2.9, 0.16]} />
      </group>
      <group ref={(g) => void (groups.current.panels = g)}>
        <Panels m={parts.panels} column={0} open={false} mesh={false} fade={panelFade} />
        <Anchor bus={bus} id="r-panel" position={[2.2, 2.9, PANEL.z1]} />
        <Anchor bus={bus} id="r-panel-end" position={[8.1, 2.4, PANEL.z1]} />
        <Anchor bus={bus} id="r-face" position={[7.4, 3.3, PANEL.z1]} />
        <Anchor bus={bus} id="r-mesh" position={[7.9, 3.08, (PANEL.z0 + PANEL.z1) / 2]} />
      </group>
      <group ref={(g) => void (groups.current.right = g)}>
        <Panels m={parts.right} column={1} open={view === 'panel'} mesh={meshOn} fade={panelFade} />
        <Anchor bus={bus} id="r-fix" position={[7.6, 3.43, 0.166]} />
        <Anchor bus={bus} id="r-rail-back" position={[7.62, 2.75, 0.155]} />
      </group>
      <Air m={base} />
      <Anchor bus={bus} id="r-cavity" position={[5.1, 0.95, 0.09]} />
      <Anchor bus={bus} id="r-cavity-end" position={[WALL.x1 - 0.12, 1.25, 0.086]} />
      <Anchor bus={bus} id="r-air-in" position={[WALL.x1 - 0.12, -0.5, 0.086]} />
      <Anchor bus={bus} id="r-air-out" position={[WALL.x1 - 0.12, 4.1, 0.086]} />
    </group>
  )
}
