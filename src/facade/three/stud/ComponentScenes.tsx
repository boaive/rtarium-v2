import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { prefersReducedMotion } from '../../../lib/motion'
import { smooth, type Progress } from '../../progress'
import { setOpacity, type LabelBus, type Shot } from '../kit'
import { mixShot } from '../ScrubRig'
import { StudioFog } from '../unit/BurstUnit'
import { Element, createElementApi } from './Element'
import { Sun } from './Sun'
import { BACK, CUTAWAY } from './cornice'

/**
 * The design stage's two listings, each its own scene in its black box (the rainscreen barrier's
 * boxes), the element standing over the Unitized studio's floor: a fine grid going into the dark, its
 * shadow on it. Each opens on the whole element and, while its listing holds, makes one move to where
 * its point is made, and stays there:
 *
 *   skin    in to a window cut back into its corona: the skin in section, RTARIUM inside it
 *   frame   round behind it, in to the last stud: its flexible L plates bending as the skin grows in
 *           the day's heat and shrinks back at night, slowly, barely more than a shimmer
 *
 * `t` (0..1) is how far the listing's hold has been scrolled, eased by the section.
 */

interface SceneProps {
  t: Progress
  bus: LabelBus
  live: { current: boolean }
  compact: boolean
}

const DEG = Math.PI / 180
const FLOOR = -0.14
/** the shape of a black box on a wide screen; a narrower box stands the camera further off */
const ASPECT = 1.25

function Studio({ t, live, compact, open, close, children, breathe }: Omit<SceneProps, 'bus'> & { open: Shot; close: Shot; children: ReactNode; breathe?: (strain: number) => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const focus = useRef(new THREE.Vector3())
  const reach = useRef(3)
  const catcher = useMemo(() => new THREE.ShadowMaterial({ color: '#000000', transparent: true, opacity: 0.42, depthWrite: false }), [])
  useEffect(() => () => catcher.dispose(), [catcher])
  useEffect(() => {
    const f = () => invalidate()
    t.listeners.add(f)
    return () => void t.listeners.delete(f)
  }, [t, invalidate])

  useFrame(() => {
    // held a moment on the open view, then in, then held there
    const s = mixShot(open, close, smooth(0.12, 0.78, t.value))
    const pull = Math.max(1, ASPECT / (size.width / Math.max(1, size.height))) * (compact ? 1.15 : 1)
    const idle = !reduced && live.current
    const now = performance.now() / 1000
    const az = (s.azim + (idle ? 0.8 * Math.sin((now * Math.PI * 2) / 13) : 0)) * DEG
    const el = s.elev * DEG
    const d = s.dist * pull
    const [tx, ty, tz] = s.target
    camera.position.set(tx + d * Math.cos(el) * Math.sin(az), ty + d * Math.sin(el), tz + d * Math.cos(el) * Math.cos(az))
    camera.lookAt(tx, ty, tz)
    camera.fov = 26
    camera.clearViewOffset()
    camera.updateProjectionMatrix()
    focus.current.set(tx, ty, tz)
    reach.current = Math.max(1.4, Math.min(4, s.dist * 0.6))
    // the skin's growth and shrinking in the day's heat, about 10 mm at the ends: far more than it really
    // moves, so it can be seen at all, and still only just
    breathe?.(idle ? 0.0085 * Math.sin((now * Math.PI * 2) / 7.5) : 0)
    if (idle) invalidate()
  }, -1)

  return (
    <>
      <StudioFog color="#080808" near={7} far={18} />
      <Sun focus={focus} reach={reach} offset={[-5, 10, 7]} intensity={3} />
      {children}
      <gridHelper args={[14, 56, '#2e2e2e', '#232323']} position={[0, FLOOR, 0.3]} />
      <mesh position={[0, FLOOR + 0.002, 0.3]} rotation={[-Math.PI / 2, 0, 0]} material={catcher} receiveShadow>
        <planeGeometry args={[14, 14]} />
      </mesh>
    </>
  )
}

/**
 * the skin: the whole element, then in to the window cut back into its corona: as the view comes in,
 * the piece cut out of it lifts away, and RTARIUM shows inside the skin, sliced through the concrete
 */
export function SkinScene({ t, live, compact }: SceneProps) {
  const api = useMemo(createElementApi, [])
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])
  useFrame(() => {
    const open = smooth(0.4, 0.72, t.value)
    const c = api.cover
    if (c) {
      c.position.set(open * 0.05, open * 0.04, open * 0.3)
      c.visible = open < 0.995
    }
    if (api.mats) setOpacity([api.mats.cover], 1 - Math.max(0, (open - 0.35) / 0.65))
  }, -2)
  return (
    <Studio
      t={t}
      live={live}
      compact={compact}
      open={{ target: [0, 0.26, 0.24], dist: 6.2, azim: 36, elev: 14 }}
      close={{ target: [(CUTAWAY.x0 + CUTAWAY.x1) / 2, (CUTAWAY.v0 + CUTAWAY.v1) / 2, BACK + CUTAWAY.u], dist: 1.55, azim: 24, elev: 7 }}
    >
      <Element api={api} ends cutaway />
    </Studio>
  )
}

/** the frame: round behind the element, in to the last stud and its flexible L plates */
export function FrameScene({ t, live, compact }: SceneProps) {
  const api = useMemo(createElementApi, [])
  const breathe = useMemo(
    () => (strain: number) => {
      api.strain.value = strain
      if (api.skin) api.skin.scale.x = 1 + strain
    },
    [api],
  )
  return (
    <Studio
      t={t}
      live={live}
      compact={compact}
      open={{ target: [0, 0.26, 0.16], dist: 6.2, azim: 150, elev: 16 }}
      close={{ target: [0.9, 0.24, 0.18], dist: 2.3, azim: 136, elev: 15 }}
      breathe={breathe}
    >
      <Element api={api} lattice={false} />
    </Studio>
  )
}
