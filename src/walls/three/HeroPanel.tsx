import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Anchor } from '../../facade/three/Stage3D'
import type { LabelBus } from '../../facade/three/kit'
import { smooth } from '../../facade/progress'
import { prefersReducedMotion } from '../../lib/motion'
import { disposeWallKit, faceEdge, fade, ferruleBore, ferruleRim, MM, slab, useWallTextures, W, wallKit } from './kit'
import { FERRULE_LINES } from './piece'
import { plate } from './cutaway'

/**
 * The opening: one panel on its long edge, as it spans between two columns, over its shadow, its inner face towards
 * the words and its top edge in view. Its two kinds of hole are told apart: the ferrule inserts (for fixing) open in
 * its inner face only, flush, a zinc rim round a threaded bore; the 20 mm tie holes (to lift by) go right through it,
 * sleeved.
 *
 * On its own clock, as a loop: the 30 mm solid panel, whole; the camera goes in to its far end, where its section is
 * seen end on; the panel divides down its middle into two 15 mm leaves, the EPS/SPS core comes down between them, and they
 * close onto it: the 100 mm SIP panel; the camera comes back out along its whole length; it holds, and goes back to
 * 30 mm (the core thins away between the leaves, nothing opened).
 */

export const HERO_LEN = 3.0
export const HERO_TARGET: [number, number, number] = [HERO_LEN / 2, W / 2, 0]
/** where the camera goes in: the far end, where the section shows */
export const HERO_END: [number, number, number] = [HERO_LEN, 0.3, 0]

/** what is said while: the 30 mm panel and its holes, the camera going in, the leaves, the core, the SIP panel, on the way back */
export type HeroPhase = 'solid' | 'in' | 'leaves' | 'core' | 'sip' | 'back'

/** the loop (s): in to the end, the leaves part, the core slides in, they close, out along the panel, back to 30 mm */
const AT = {
  in: [4.6, 6.2],
  part: [6.4, 7.3],
  core: [7.3, 8.6],
  close: [8.6, 9.4],
  out: [10.5, 12.1],
  back: [14.6, 15.9],
} as const
const LOOP = 16.6
/** under reduced motion: held on the 30 mm panel, whole */
const STILL = 1.5
/** a leaf's thickness, how far each stands off the middle while the core goes in, the core's thickness and its 20 mm step */
const LEAF = 15 * MM
const OPEN = 0.075
const CORE = 70 * MM
const STEP = 20 * MM
/** the 30 mm panel's tongue: 15 mm proud, 15 mm at its root, 6 mm at its tip */
const TONGUE = 15 * MM
/** a lifting hole's radius (20 mm across) */
const HOLE = 10 * MM

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function phaseAt(t: number): HeroPhase {
  if (t < AT.in[0] - 0.3) return 'solid'
  if (t < AT.part[0]) return 'in'
  if (t < AT.core[0]) return 'leaves'
  if (t < AT.close[1]) return 'core'
  if (t < AT.back[0]) return 'sip'
  if (t < AT.back[1] + 0.4) return 'back'
  return 'solid'
}

/** how far the camera is in on the far end (0..1) at t */
export function heroZoomAt(t: number) {
  return ease(smooth(AT.in[0], AT.in[1], t)) * (1 - ease(smooth(AT.out[0], AT.out[1], t)))
}

/** a box whose face at `y1` (or `x1`) is narrowed in z to `tip` from its root: a tapered tongue, half of it (z from 0) */
function wedge(x0: number, x1: number, y0: number, y1: number, root: number, tip: number, along: 'x' | 'y') {
  const g = slab(x0, x1, y0, y1, 0, root)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const out = along === 'x' ? p.getY(i) > y1 - 1e-6 : p.getX(i) > x1 - 1e-6
    if (out && p.getZ(i) > root - 1e-6) p.setZ(i, tip)
  }
  g.computeVertexNormals()
  const out = faceEdge(g)
  g.dispose()
  return out
}

/** a plate with the tie holes through it, `t` thick from z = 0, its faces and edges grouped */
function holed(x0: number, y0: number, x1: number, y1: number, t: number, holes: [number, number][]) {
  const g = plate(x0, y0, x1, y1, t, holes.map(([x, y]) => [x, y, HOLE] as [number, number, number]))
  const out = faceEdge(g)
  g.dispose()
  return out
}

export function HeroPanel({ bus, live, onPhase, zoom }: { bus: LabelBus; live: { current: boolean }; onPhase: (p: HeroPhase) => void; zoom: { current: number } }) {
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const tex = useWallTextures()
  const m = useMemo(() => {
    const k = wallKit(tex)
    // the sleeve lining a lifting hole: dark, so the hole reads as a hole from any side
    const sleeve = new THREE.MeshStandardMaterial({ color: '#2b2726', roughness: 0.7, side: THREE.DoubleSide })
    return { ...k, sleeve }
  }, [tex])
  const L = HERO_LEN
  const holes = useMemo<[number, number][]>(() => [0.2, L - 0.2].flatMap((x) => [0.15, 0.45].map((y) => [x, y] as [number, number])), [L])
  const ferrules = useMemo<[number, number][]>(() => FERRULE_LINES(L).flatMap((x) => [0.1, 0.5].map((y) => [x, y] as [number, number])), [L])
  const g = useMemo(
    () => ({
      // a leaf: a 7.5 mm cover and its half of the RTARIUM zone, 15 mm in all; its half of the tongue along the top and the far end
      leaf: holed(0, 0, L, W, LEAF, holes),
      rim: ferruleRim(),
      bore: ferruleBore(),
      tongueTop: wedge(TONGUE, L, W, W + TONGUE, TONGUE / 2, 3 * MM, 'x'),
      tongueEnd: wedge(L, L + TONGUE, TONGUE, W, TONGUE / 2, 3 * MM, 'y'),
      // the core: 20 mm proud along the top and the far end, 20 mm short along the foot and the near end
      core: holed(STEP, STEP, L + STEP, W + STEP, CORE, holes),
      sleeveLeaf: new THREE.CylinderGeometry(HOLE * 0.98, HOLE * 0.98, LEAF, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0, LEAF / 2),
      sleeveCore: new THREE.CylinderGeometry(HOLE * 0.98, HOLE * 0.98, CORE, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0, CORE / 2),
    }),
    [L, holes],
  )
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      m.sleeve.dispose()
      disposeWallKit(m)
    },
    [g, m],
  )
  const catcher = useMemo(() => new THREE.ShadowMaterial({ color: '#4a3000', transparent: true, opacity: 0.2, depthWrite: false }), [])
  useEffect(() => () => catcher.dispose(), [catcher])

  const front = useRef<THREE.Group>(null)
  const back = useRef<THREE.Group>(null)
  const core = useRef<THREE.Group>(null)
  /** the tongue halves, each scaled down onto its root: along y (the top's) or x (the far end's), and z */
  const tongues = useRef<{ el: THREE.Group | null; along: 'x' | 'y' }[]>([])
  const clock = useRef(reduced ? STILL : 0)
  const said = useRef<HeroPhase | null>(null)
  const say = useRef(onPhase)
  say.current = onPhase

  useFrame((_, delta) => {
    // the loop runs only while the opening is on screen (it resumes where it stopped)
    if (!reduced && live.current) clock.current = (clock.current + Math.min(delta, 1 / 20)) % LOOP
    const t = clock.current
    zoom.current = reduced ? 0 : heroZoomAt(t)
    // how far each leaf stands off the middle, the core's thickness and where it is along the panel
    let d = 0
    let coreT = 0
    let coreY = 0
    if (t >= AT.part[0] && t < AT.back[0]) {
      const part = ease(smooth(AT.part[0], AT.part[1], t))
      const shut = ease(smooth(AT.close[0], AT.close[1], t))
      d = OPEN * part + (CORE / 2 - OPEN) * shut
      coreT = t >= AT.core[0] ? CORE : 0
      // it comes down into the gap between the leaves from above
      coreY = 0.72 * (1 - ease(smooth(AT.core[0], AT.core[1], t)))
    } else if (t >= AT.back[0]) {
      // back to 30 mm: the core thins away as the leaves come together
      d = (CORE / 2) * (1 - ease(smooth(AT.back[0], AT.back[1], t)))
      coreT = 2 * d
    }
    front.current?.position.set(0, 0, d)
    back.current?.position.set(0, 0, -d)
    // (it comes into sight as it starts to slide, not all at once)
    fade(m.core, t >= AT.core[0] && t < AT.core[1] ? smooth(AT.core[0], AT.core[0] + 0.35, t) : 1)
    const c = core.current
    if (c) {
      c.visible = coreT > 0.0005
      c.position.set(0, coreY, (-CORE / 2) * (coreT / CORE))
      c.scale.set(1, 1, Math.max(1e-3, coreT / CORE))
    }
    // the 30 mm panel's tongue draws in as it divides (the core's 20 mm step is the SIP's), and comes back with it
    const tg = t < AT.back[0] ? 1 - smooth(AT.part[0], AT.part[1] - 0.2, t) : smooth(AT.back[0] + 0.3, AT.back[1], t)
    for (const { el, along } of tongues.current) {
      if (!el) continue
      el.visible = tg > 0.01
      const k = Math.max(1e-3, tg)
      el.scale.set(along === 'x' ? k : 1, along === 'y' ? k : 1, k)
    }
    const ph = phaseAt(t)
    if (ph !== said.current) {
      said.current = ph
      say.current(ph)
    }
    if (live.current && !reduced) invalidate()
  }, -3)

  const placeAt = (list: [number, number][], z: number) => (el: THREE.InstancedMesh | null) => {
    if (!el) return
    const mx = new THREE.Matrix4()
    list.forEach(([x, y], i) => el.setMatrixAt(i, mx.makeTranslation(x, y, z)))
    el.instanceMatrix.needsUpdate = true
    el.computeBoundingSphere()
  }
  const conc = [m.concrete, m.edge, m.outer]
  /** a leaf turned about (scale z −1) shows its geometry's back as its front: its faces swap materials */
  const turned = [m.outer, m.edge, m.concrete]
  // (a tongue half scales about its root, the leaf's edge it stands on: the top's at y = W, the far end's at x = L)
  const tongue = (k: number, geo: THREE.BufferGeometry, mat: THREE.Material[], along: 'x' | 'y') => {
    const at: [number, number, number] = along === 'y' ? [0, W, 0] : [L, 0, 0]
    return (
      <group ref={(el) => void (tongues.current[k] = { el, along })} position={at}>
        <mesh geometry={geo} material={mat} position={[-at[0], -at[1], 0]} castShadow receiveShadow />
      </group>
    )
  }

  return (
    <group>
      {/* the inner leaf: its face looks out along +z, the ferrules in it */}
      <group ref={front}>
        <mesh geometry={g.leaf} material={conc} castShadow receiveShadow />
        <instancedMesh args={[g.sleeveLeaf, m.sleeve, holes.length]} ref={placeAt(holes, 0)} />
        {tongue(0, g.tongueTop, conc, 'y')}
        {tongue(1, g.tongueEnd, conc, 'x')}
        {/* the ferrules' mouths, flush with the face (drawn a little larger than they are, so they read) */}
        <group scale={[1.25, 1.25, 1]}>
          <instancedMesh args={[g.rim, m.zinc, ferrules.length]} ref={placeAt(ferrules.map(([x, y]) => [x / 1.25, y / 1.25]), LEAF + 0.0003)} />
          <instancedMesh args={[g.bore, m.bore, ferrules.length]} ref={placeAt(ferrules.map(([x, y]) => [x / 1.25, y / 1.25]), LEAF + 0.0007)} />
        </group>
        {/* (the thickness: the top's far corner, in the middle of the 30 mm) */}
        <Anchor bus={bus} id="hp-thick" position={[L, W, 0]} />
        {/* (the tie hole at the near end, top: its words stand off that end, clear of the panel) */}
        <Anchor bus={bus} id="hp-hole" position={[holes[1][0], holes[1][1], LEAF]} />
        <Anchor bus={bus} id="hp-ferrule" position={[ferrules[ferrules.length - 2][0], ferrules[ferrules.length - 2][1], LEAF]} />
      </group>
      {/* the outer leaf, the inner one turned about */}
      <group ref={back}>
        <group scale={[1, 1, -1]}>
          <mesh geometry={g.leaf} material={turned} castShadow receiveShadow />
          <instancedMesh args={[g.sleeveLeaf, m.sleeve, holes.length]} ref={placeAt(holes, 0)} />
          {tongue(2, g.tongueTop, turned, 'y')}
          {tongue(3, g.tongueEnd, turned, 'x')}
        </group>
      </group>
      {/* the EPS/SPS core, stay-in-place, its holes in line with the leaves' */}
      <group ref={core} visible={false}>
        <mesh geometry={g.core} material={m.core} castShadow receiveShadow />
        <instancedMesh args={[g.sleeveCore, m.sleeve, holes.length]} ref={placeAt(holes, 0)} />
        <Anchor bus={bus} id="hp-core" position={[L + STEP, W + STEP, CORE / 2]} />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L / 2, -0.001, 0]} material={catcher} receiveShadow>
        <planeGeometry args={[10, 10]} />
      </mesh>
    </group>
  )
}
