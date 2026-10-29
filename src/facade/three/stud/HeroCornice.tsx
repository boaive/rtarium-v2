import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Anchor, holdPump } from '../Stage3D'
import { setOpacity, type LabelBus } from '../kit'
import { prefersReducedMotion } from '../../../lib/motion'
import { Element, createElementApi } from './Element'
import { Sun } from './Sun'
import { BACK, CUTAWAY } from './cornice'

/**
 * The opening: one cornice element, hovering a little over the yellow ground in a hard midday sun, the
 * stud frame standing behind the profile on its plates; its shadow crisp and dark. Its anatomy is in a
 * window cut back into the corona's face, through the face coat to RTARIUM, the one thing labelled
 * (on a leader, as the other systems' openings label theirs). As the page opens the
 * element settles, the piece cut out of the window lifts away, and the view leans in on the textile for
 * a moment (`focus`, 0..1, read by the camera), then lets it go.
 */

const HOVER = 0.2
export const HERO_TARGET: [number, number, number] = [0.1, 0.22 + HOVER, 0.24]
/** the window, where RTARIUM shows */
export const HERO_FOCUS: [number, number, number] = [(CUTAWAY.x0 + CUTAWAY.x1) / 2, (CUTAWAY.v0 + CUTAWAY.v1) / 2 + HOVER, BACK + CUTAWAY.u]

export function HeroCornice({ bus, play, focus }: { bus: LabelBus; play: boolean; focus: { current: number } }) {
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const api = useMemo(createElementApi, [])
  const catcher = useMemo(() => new THREE.ShadowMaterial({ color: '#000000', transparent: true, opacity: 0.5, depthWrite: false }), [])
  useEffect(() => {
    gl.localClippingEnabled = true
    return () => catcher.dispose()
  }, [gl, catcher])

  const sunAt = useRef(new THREE.Vector3(0, 0.3, 0.3))
  const reach = useRef(2.4)

  const piece = useRef<THREE.Group>(null)
  const t = useRef({ rise: reduced ? 1 : 0, open: reduced ? 1 : 0, look: reduced ? 1 : 0 })
  const [started, setStarted] = useState(reduced)
  // while the opening plays, the page builds no other canvas (each build stalls the page a moment)
  const release = useRef<(() => void) | null>(null)
  useEffect(() => {
    release.current = holdPump()
    const id = window.setTimeout(() => release.current?.(), 9000)
    return () => {
      window.clearTimeout(id)
      release.current?.()
    }
  }, [])
  // only once every material is compiled does it settle, so nothing stalls the move
  useEffect(() => {
    if (!play || started) return
    let live = true
    gl.compileAsync(scene, camera)
      .catch(() => {})
      .then(() => {
        if (live) window.setTimeout(() => live && setStarted(true), 250)
      })
    return () => void (live = false)
  }, [play, started, gl, scene, camera])
  useEffect(() => invalidate(), [started, invalidate])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const s = t.current
    let moving = false
    if (started && s.rise < 1) {
      s.rise = Math.min(1, s.rise + dt / 1.2)
      moving = true
    }
    if (started && s.rise > 0.7 && s.open < 1) {
      s.open = Math.min(1, s.open + dt / 1.3)
      moving = true
    }
    // the lean in on the textile: in once the window is open, a breath there, and out again
    if (started && s.open > 0.6 && s.look < 1) {
      s.look = Math.min(1, s.look + dt / 4.4)
      moving = true
      if (s.look >= 1) release.current?.()
    }
    const rise = 1 - Math.pow(1 - s.rise, 3)
    const open = s.open < 0.5 ? 4 * s.open ** 3 : 1 - Math.pow(-2 * s.open + 2, 3) / 2
    const ease = (x: number) => x * x * (3 - 2 * x)
    focus.current = reduced ? 0 : ease(Math.min(1, s.look / 0.34)) * (1 - ease(Math.max(0, (s.look - 0.62) / 0.38)))
    if (piece.current) piece.current.position.y = HOVER - (1 - rise) * 0.28
    // the piece cut out of the window: lifted out and away, gone
    const c = api.cover
    if (c) {
      c.position.set(open * 0.06, open * 0.05, open * 0.34)
      c.visible = open < 0.995
    }
    if (api.mats) setOpacity([api.mats.cover], 1 - Math.max(0, (open - 0.35) / 0.65))
    // the skin growing in the day's heat and shrinking back at night, the plates flexing with it: barely a shimmer
    if (!reduced && started) {
      api.strain.value = 0.0085 * Math.sin((performance.now() / 1000) * ((Math.PI * 2) / 7.5))
      if (api.skin) api.skin.scale.x = 1 + api.strain.value
      moving = true
    }
    if (moving) invalidate()
  }, -2)

  return (
    <>
      <Sun focus={sunAt} reach={reach} offset={[-5, 10, 6.5]} intensity={3.3} />
      <group ref={piece} position={[0, HOVER, 0]}>
        <Element api={api} ends cutaway />
        <Anchor bus={bus} id="hs-mesh" position={[(CUTAWAY.x0 + CUTAWAY.x1) / 2 - 0.08, (CUTAWAY.v0 + CUTAWAY.v1) / 2 + 0.01, BACK + CUTAWAY.u - CUTAWAY.depth + 0.002]} />
      </group>
      <mesh position={[0.6, 0, 0.2]} rotation={[-Math.PI / 2, 0, 0]} material={catcher} receiveShadow renderOrder={-1}>
        <planeGeometry args={[12, 8]} />
      </mesh>
    </>
  )
}
