import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshInset } from '../MeshInset'
import { Anchor, holdPump } from '../Stage3D'
import { PITCH_M, type LabelBus } from '../kit'
import { prefersReducedMotion } from '../../../lib/motion'
import { block } from '../unit/parts'
import { bracketGeometry, colX, D, disposeRainMaterials, G, panelsGeometry, railGeometry, rainMaterials, wallGeometry, windowGeometry, woolGeometry, ZM } from './parts'

/**
 * The opening: a piece of the façade, two storeys of three panel columns and their ribbon windows,
 * isolated over its shadow on the yellow ground. Its near end is cut through, so the rainscreen
 * reads in section (wall, wool, brackets and rails, the open cavity, the thin panel standing off
 * it), and down the near column the outer half of one panel is cut back to RTARIUM at mid-thickness.
 * The near column's upper panel is still to be hung, so the rails and brackets stand in front of the
 * wool there. As the page opens the piece settles, the cover over the cut lifts away, and the view leans in on
 * the textile for a moment (`focus`, 0..1, read by the camera), then lets it go.
 */

const COLS = 3
const STOREYS = 2
const X1 = colX(COLS - 1) + G.pw
/** the cut, in the near column's lower panel, at eye level */
export const HERO_CUT: [number, number, number, number] = [X1 - 0.4, 0.9, X1 - 0.09, 2.7]
export const HERO_TARGET: [number, number, number] = [X1 / 2 + 0.35, (STOREYS * G.fh) / 2 - 0.25, 0.1]
export const HERO_FOCUS: [number, number, number] = [(HERO_CUT[0] + HERO_CUT[2]) / 2, (HERO_CUT[1] + HERO_CUT[3]) / 2 + 0.2, ZM]

export function HeroWall({ bus, play, focus }: { bus: LabelBus; play: boolean; focus: { current: number } }) {
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const m = useMemo(rainMaterials, [])
  // on yellow a clear pane would show the ground through and read olive: the glass is denser here
  useMemo(() => {
    m.glass.opacity = m.glass.userData.base = 0.97
  }, [m])
  const geo = useMemo(() => {
    const b = bracketGeometry(COLS, STOREYS)
    const r = railGeometry(COLS, STOREYS)
    const w = windowGeometry(COLS, STOREYS)
    const [a, bb, c, d] = HERO_CUT
    return {
      wall: wallGeometry(COLS, STOREYS),
      wool: woolGeometry(COLS, STOREYS),
      brackets: b.steel,
      pads: b.pads,
      rails: r.rails,
      hangers: r.hangers,
      frames: w.frames,
      glass: w.glass,
      infill: w.infill,
      // the near column's upper panel is not hung yet: the rainscreen shows behind it
      panels: panelsGeometry(COLS, STOREYS, { cut: HERO_CUT, skip: (k, i) => k === COLS - 1 && i === 1 }),
      cover: block([a, bb, ZM - 0.002], [c, d, D.panel[1]]),
    }
  }, [])
  const coverMat = useMemo(() => m.concrete.clone(), [m])
  const catcher = useMemo(() => new THREE.ShadowMaterial({ color: '#4a3000', transparent: true, opacity: 0.2, depthWrite: false }), [])
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      coverMat.dispose()
      catcher.dispose()
      disposeRainMaterials(m)
    },
    [geo, coverMat, catcher, m],
  )

  const piece = useRef<THREE.Group>(null)
  const cover = useRef<THREE.Mesh>(null)
  const t = useRef({ rise: reduced ? 1 : 0, open: reduced ? 1 : 0, look: reduced ? 1 : 0 })
  const [started, setStarted] = useState(reduced)
  /** the textile is in and its shader compiled: only then does the piece settle, so nothing stalls it */
  const [ready, setReady] = useState(false)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  // while the opening plays, the page builds no other canvas (each build stalls the page a moment)
  const release = useRef<(() => void) | null>(null)
  useEffect(() => {
    release.current = holdPump()
    // never hold for long, whatever happens to the opening
    const id = window.setTimeout(() => release.current?.(), 9000)
    return () => {
      window.clearTimeout(id)
      release.current?.()
    }
  }, [])
  useEffect(() => {
    if (!ready) return
    let live = true
    gl.compileAsync(scene, camera)
      .catch(() => {})
      .then(() => {
        if (live) window.setTimeout(() => live && play && setStarted(true), 250)
      })
    return () => void (live = false)
  }, [ready, play, gl, scene, camera])
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
    // the lean in on the textile: in once the cut is open, a breath there, and out again
    if (started && s.open > 0.6 && s.look < 1) {
      s.look = Math.min(1, s.look + dt / 4.2)
      moving = true
      if (s.look >= 1) release.current?.()
    }
    const rise = 1 - Math.pow(1 - s.rise, 3)
    const open = s.open < 0.5 ? 4 * s.open ** 3 : 1 - Math.pow(-2 * s.open + 2, 3) / 2
    const lin = Math.min(1, s.look / 0.34)
    const lout = Math.max(0, (s.look - 0.62) / 0.38)
    const ease = (x: number) => x * x * (3 - 2 * x)
    focus.current = reduced ? 0 : ease(lin) * (1 - ease(lout))
    if (piece.current) piece.current.position.y = (1 - rise) * -0.3
    if (cover.current) {
      cover.current.position.z = open * 0.42
      cover.current.position.x = open * 0.08
      cover.current.visible = open < 0.995
    }
    coverMat.opacity = 1 - Math.max(0, (open - 0.35) / 0.65)
    coverMat.depthWrite = coverMat.opacity > 0.97
    if (moving) invalidate()
  }, -2)

  const [a, b, c, d] = HERO_CUT
  return (
    <group>
      <group ref={piece}>
        <mesh geometry={geo.wall} material={m.wall} castShadow receiveShadow />
        <mesh geometry={geo.wool} material={m.insulation} receiveShadow />
        <mesh geometry={geo.pads} material={m.pad} />
        <mesh geometry={geo.brackets} material={m.steel} castShadow />
        <mesh geometry={geo.rails} material={m.steel} castShadow />
        <mesh geometry={geo.hangers} material={m.darkSteel} />
        <mesh geometry={geo.frames} material={m.alu} castShadow />
        <mesh geometry={geo.infill} material={m.alu} />
        <mesh geometry={geo.glass} material={m.glass} renderOrder={2} />
        <mesh geometry={geo.panels} material={m.concrete} castShadow receiveShadow />
        <mesh ref={cover} geometry={geo.cover} material={coverMat} castShadow />
        <group position={[(a + c) / 2, (b + d) / 2, ZM + 0.001]}>
          <Suspense fallback={null}>
            <MeshInset nx={Math.floor((c - a) / PITCH_M)} ny={Math.floor((d - b) / PITCH_M)} lod={1.6} />
            <Ready onReady={() => setReady(true)} />
          </Suspense>
        </group>
        <Anchor bus={bus} id="hr-mesh" position={[(a + c) / 2 - 0.02, d - 0.42, ZM + 0.006]} />
      </group>
      <mesh position={[X1 / 2, -0.001, 1]} rotation={[-Math.PI / 2, 0, 0]} material={catcher} receiveShadow>
        <planeGeometry args={[26, 26]} />
      </mesh>
    </group>
  )
}

/** tells its parent that what was suspended beside it has arrived */
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady])
  return null
}
