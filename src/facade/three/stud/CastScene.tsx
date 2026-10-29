import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { prefersReducedMotion } from '../../../lib/motion'
import { smooth, type Progress } from '../../progress'
import { setOpacity, type Shot } from '../kit'
import { mixShot } from '../ScrubRig'
import { Element, createElementApi } from './Element'
import { Sun } from './Sun'
import { FRAME, LEN } from './cornice'
import { CAST, modelMaterials, mouldGeometry } from './models'

/**
 * Cast in five steps, on yellow, in the room right of the words (the rainscreen's answers stage): the
 * mould, the element made in it, and at the end the element alone. Concrete and RTARIUM are two
 * different things done two different ways: the concrete appears in the mould, coat by coat; RTARIUM
 * is cut into flat strips, stitched together at the folds, and laid in.
 *
 *   1  the mould         the CNC-routed timber mould, the cornice's face as its cavity, set down
 *   2  spray-up          the face coat appears along the mould; RTARIUM's strips set out over it one after
 *                        another, stitched along every fold, the ferrules on it, laid in; the backing appears
 *   3  stud frame        the frame made member by member behind the mould, drilled, its plates bolted on
 *   4  frame onto skin   the frame brought over (the crane's arc) and set on the ferrule inserts
 *   5  cured             the concrete cures from its wet grey to its white; the mould goes; the element
 *                        alone, upright, turning slowly
 *
 * `progress` (0..1) is the section's run, a fifth for each step. Sizes illustrate the system.
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** when each step's action happens (fractions of the run: step k is k/5 to (k+1)/5, its words in over its first seventh) */
export const CASTING = {
  mould: [0.03, 0.13],
  face: [0.225, 0.27],
  strips: [0.27, 0.31],
  stitch: [0.31, 0.345],
  lay: [0.345, 0.365],
  back: [0.365, 0.395],
  frame: [0.43, 0.56],
  plates: [0.55, 0.58],
  lock: [0.63, 0.75],
  cure: [0.82, 0.86],
  demould: [0.85, 0.9],
  stand: [0.88, 0.97],
} as const
type Mark = keyof typeof CASTING
const at = (p: number, k: Mark, a = 0, b = 1) => smooth(lerp(CASTING[k][0], CASTING[k][1], a), lerp(CASTING[k][0], CASTING[k][1], b), p)

/** where the frame is made: on the ground behind the mould (in the element's frame, the element face down) */
const BEHIND = -2.1
const MADE = { y: BEHIND + CAST.z - (FRAME.y0 + FRAME.y1) / 2, z: CAST.y - FRAME.z1 }
/** the concrete, fresh (darker, wet) and cured (its own white) */
const WET = new THREE.Color('#a8a49b')

/** where the scene stands on the screen: the middle of the room right of the words (measured by the page) */
export interface RoomAxis {
  x: number
  y: number
}

export function castShot(p: number, compact: boolean, axis: RoomAxis): Shot {
  const k = compact ? 1.3 : 1
  const fr: [number, number] = [axis.x, axis.y]
  const base: Shot = { target: [0, 0.3, -0.75], dist: 11 * k, azim: 24, elev: 30, frame: fr }
  // RTARIUM: a little closer while it is cut, stitched and laid in, and back
  const look: Shot = { target: [-0.15, 0.42, -0.08], dist: 8.4 * k, azim: 26, elev: 34, frame: fr }
  const s = mixShot(base, look, smooth(CASTING.strips[0] - 0.02, CASTING.strips[0] + 0.01, p) * (1 - smooth(CASTING.lay[1], CASTING.lay[1] + 0.02, p)))
  // the element alone at the end, upright
  return mixShot(s, { target: [0, 0.62, 0], dist: 9.5 * k, azim: 30, elev: 10, frame: fr }, at(p, 'stand'))
}

export function CastScene({ progress, live }: { progress: Progress; live: { current: boolean } }) {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])
  useEffect(() => {
    const f = () => invalidate()
    progress.listeners.add(f)
    return () => void progress.listeners.delete(f)
  }, [progress, invalidate])

  const api = useMemo(createElementApi, [])
  const sunAt = useRef(new THREE.Vector3(0, 0.3, -0.75))
  const reach = useRef(3)

  const m = useMemo(() => {
    const base = modelMaterials()
    const mould = base.white.clone()
    const catcher = new THREE.ShadowMaterial({ color: '#000000', transparent: true, opacity: 0.42, depthWrite: false })
    return { base, mould, catcher }
  }, [])
  const mouldGeo = useMemo(mouldGeometry, [])
  useEffect(
    () => () => {
      mouldGeo.dispose()
      for (const x of [...Object.values(m.base), m.mould, m.catcher]) x.dispose()
    },
    [mouldGeo, m],
  )

  const mould = useRef<THREE.Group>(null)
  const cured = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    const p = progress.value
    const e = api
    if (!e.root || !e.frame || !e.mesh || !e.mats) return

    // the element: face down in its mould; at the end out of it, turned upright, turning slowly
    const stand = at(p, 'stand')
    e.root.rotation.x = lerp(Math.PI / 2, 0, stand)
    const t = performance.now() / 1000
    e.root.rotation.y = reduced ? 0 : stand * 0.22 * Math.sin((t * Math.PI * 2) / 16)
    e.root.position.set(0, lerp(CAST.y, 0.36, stand) + 0.25 * Math.sin(Math.PI * stand), lerp(-CAST.z, -0.29, stand))

    // 3. the frame: made member by member behind the mould, drilled, its plates bolted on
    const fab = at(p, 'frame')
    const n = e.members.length
    e.members.forEach((mm, i) => {
      if (!mm) return
      const g = smooth((i / n) * 0.8, (i / n) * 0.8 + 0.2, fab)
      mm.scale.y = Math.max(1e-3, g)
      mm.visible = g > 0.002
    })
    if (e.holes) e.holes.visible = fab > 0.9
    setOpacity([e.mats.plate], at(p, 'plates'))
    // 4. brought over onto the skin: hoisted clear, across, down onto the ferrules (the crane's arc)
    const lc = at(p, 'lock', 0, 0.85)
    const up = smooth(0, 0.45, lc)
    const across = smooth(0.38, 0.8, lc)
    const down = smooth(0.76, 1, lc)
    e.frame.position.set(0, MADE.y * (1 - across), MADE.z + (-0.5 - MADE.z) * up + 0.5 * down)

    // 2. the concrete: appearing along the mould, the face coat one way, the backing back the other; wet, then cured
    const face = lerp(-LEN / 2 - 0.05, LEN / 2 + 0.05, at(p, 'face'))
    const back = lerp(LEN / 2 + 0.05, -LEN / 2 - 0.05, at(p, 'back'))
    e.planes.coat.constant = p < CASTING.face[0] ? -1e3 : p < CASTING.face[1] ? face : 1e3
    e.planes.back.constant = p < CASTING.back[0] ? -1e3 : p < CASTING.back[1] ? -back : 1e3
    cured.copy(WET).lerp(e.mats.cut.color, at(p, 'cure'))
    e.mats.coat.color.copy(cured)
    e.mats.backing.color.copy(cured)

    // RTARIUM: the cut strips set out over the mould one after another, stitched at every fold, the
    // ferrules set on it, then laid in onto the face coat; hidden by the backing
    const shown = p >= CASTING.strips[0] && p < CASTING.back[1] + 0.02 ? 1 : 0
    setOpacity([e.mats.roving, e.mats.fibre, e.mats.thread], shown)
    e.lay(at(p, 'strips'), at(p, 'stitch'))
    e.mesh.position.z = -0.32 * (1 - at(p, 'lay'))
    setOpacity([e.mats.ferrule, e.mats.bore], p > CASTING.back[1] ? 1 : at(p, 'stitch', 0.75, 1))

    // 1. the mould set down; 5. taken away as the element comes out
    setOpacity([m.mould], at(p, 'mould', 0, 0.6) * (1 - at(p, 'demould')))
    if (mould.current) mould.current.position.y = 0.12 * (1 - at(p, 'mould', 0, 0.8)) - 0.15 * at(p, 'demould')

    if (live.current && !reduced) invalidate()
  }, -2)

  return (
    <>
      <Sun focus={sunAt} reach={reach} offset={[-5, 11, 7]} intensity={3} />
      <mesh position={[0, -0.001, -0.8]} rotation={[-Math.PI / 2, 0, 0]} material={m.catcher} receiveShadow renderOrder={-1}>
        <planeGeometry args={[14, 12]} />
      </mesh>
      <group ref={mould}>
        <mesh geometry={mouldGeo} material={m.mould} castShadow receiveShadow />
      </group>
      <Element api={api} />
    </>
  )
}
