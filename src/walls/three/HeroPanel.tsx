import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Anchor } from '../../facade/three/Stage3D'
import type { LabelBus } from '../../facade/three/kit'
import { prefersReducedMotion } from '../../lib/motion'
import { Panel, restPose, type PanelPose } from './Panel'
import { W } from './kit'

/**
 * The opening: one panel on its long edge, as it spans between two columns, over its shadow, its inner
 * face (the ferrules) towards the words and its top edge in view. On its own clock, as a loop, it is the
 * 30 mm solid panel, then swells to the 100 mm SIP panel (the core grows between its two halves along
 * the whole edge, nothing opened), holds, and goes back. Its thickness is marked at its far end.
 */

export const HERO_LEN = 2.4
export const HERO_TARGET: [number, number, number] = [HERO_LEN / 2, W / 2, 0]

/** the loop (s): 30 mm, swelling, 100 mm, going back */
const HOLD = 2.6
const MOVE = 1.5
const LOOP = 2 * (HOLD + MOVE)
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function HeroPanel({ bus, live, onState }: { bus: LabelBus; live: { current: boolean }; onState: (thick: 30 | 100) => void }) {
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const pose = useRef<PanelPose>({ ...restPose(), rest: 1 })
  const clock = useRef(0)
  const said = useRef<30 | 100>(30)
  const say = useRef(onState)
  say.current = onState
  const catcher = useMemo(() => new THREE.ShadowMaterial({ color: '#4a3000', transparent: true, opacity: 0.2, depthWrite: false }), [])
  useEffect(() => () => catcher.dispose(), [catcher])

  useFrame((_, delta) => {
    if (reduced) return
    // the loop runs only while the opening is on screen (it resumes where it stopped)
    if (live.current) clock.current = (clock.current + Math.min(delta, 1 / 20)) % LOOP
    const t = clock.current
    const m = t < HOLD ? 0 : t < HOLD + MOVE ? ease((t - HOLD) / MOVE) : t < 2 * HOLD + MOVE ? 1 : 1 - ease((t - 2 * HOLD - MOVE) / MOVE)
    pose.current.morph = m
    const thick = m > 0.5 ? 100 : 30
    if (thick !== said.current) {
      said.current = thick
      say.current(thick)
    }
    if (live.current) invalidate()
  }, -3)

  return (
    <group>
      <Panel len={HERO_LEN} piece={HERO_LEN} pose={pose} meshes={false} />
      {/* the thickness, marked where the far end meets the top edge */}
      <Anchor bus={bus} id="hp-thick" position={[HERO_LEN, W, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[HERO_LEN / 2, -0.001, 0]} material={catcher} receiveShadow>
        <planeGeometry args={[8, 8]} />
      </mesh>
    </group>
  )
}
