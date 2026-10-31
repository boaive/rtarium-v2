import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { prefersReducedMotion } from '../../../lib/motion'
import { smooth, type Progress } from '../../progress'
import { setOpacity, type LabelBus, type Shot } from '../kit'
import { mixShot } from '../ScrubRig'
import { StudioFog } from '../unit/BurstUnit'
import { Element, createElementApi, type ElementApi } from './Element'
import { Sun } from './Sun'
import { BACK, LEN, PROFILE, SKIN, offsetPath, toLocal } from './cornice'

/**
 * The design stage's three listings, each its own scene in its black box (the rainscreen barrier's
 * boxes), the element standing over the Unitized studio's floor: a fine grid going into the dark, its
 * shadow on it. Each opens on the whole element, seen from behind, the same view and scale for all
 * three, and while its listing holds makes one move to where its point is made, and stays there:
 *
 *   anchor  the frame alone; its flex anchors come in, marked in yellow, and the skin slides in over
 *           them and is fixed there
 *   day     the light warms to 45 °C: the skin grows along its length, the L plates
 *           bending with it, so nothing is forced
 *   night   the light cools: the skin draws back past where it started, the plates
 *           bending the other way, the skin whole all the while
 *
 * The skin's movement is far more than it really moves, so it can be seen at all. `t` (0..1) is how
 * far the listing's hold has been scrolled, eased by the section.
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
const YELLOW = new THREE.Color('#ffd400')
/** the skin's strain at 45 °C, and at night (shown, not real: about 42 mm and −18 mm at the ends) */
const HOT = 0.035
const COLD = -0.015

/** the view every listing opens on, and the one it comes in to: behind the element, to the last stud */
const OPEN: Shot = { target: [0, 0.27, 0.29], dist: 8.8, azim: 150, elev: 16 }
const CLOSE: Shot = { target: [0.15, 0.26, 0.26], dist: 6.2, azim: 140, elev: 15 }

/** the light, set by a scene every frame: the sun's strength and colour, the sky's */
interface Mood {
  intensity: number
  color: THREE.Color
  sky: THREE.Color
  skyI: number
}
const NOON = { sun: new THREE.Color('#ffffff'), sky: new THREE.Color('#ffffff') }
const HEAT = { sun: new THREE.Color('#ffd9a0'), sky: new THREE.Color('#ffb860') }
const DUSK = { sun: new THREE.Color('#9fb8ff'), sky: new THREE.Color('#3a5cff') }

function Studio({
  t,
  live,
  compact,
  open,
  close,
  children,
  play,
  move = [0.12, 0.78],
}: Omit<SceneProps, 'bus'> & { open: Shot; close: Shot; children: ReactNode; play?: (v: number, mood: Mood, now: number) => void; move?: [number, number] }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const focus = useRef(new THREE.Vector3())
  const reach = useRef(3)
  const mood = useRef<Mood>({ intensity: 3, color: NOON.sun.clone(), sky: NOON.sky.clone(), skyI: 0 })
  const sky = useRef<THREE.HemisphereLight>(null)
  const catcher = useMemo(() => new THREE.ShadowMaterial({ color: '#000000', transparent: true, opacity: 0.42, depthWrite: false }), [])
  useEffect(() => () => catcher.dispose(), [catcher])
  useEffect(() => {
    const f = () => invalidate()
    t.listeners.add(f)
    return () => void t.listeners.delete(f)
  }, [t, invalidate])

  useFrame(() => {
    // held a moment on the open view, then in, then held there
    const s = mixShot(open, close, smooth(move[0], move[1], t.value))
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
    play?.(t.value, mood.current, now)
    const h = sky.current
    if (h) {
      h.color.copy(mood.current.sky)
      h.intensity = mood.current.skyI
    }
    if (idle) invalidate()
  }, -1)

  return (
    <>
      <StudioFog color="#080808" near={7} far={18} />
      <Sun focus={focus} reach={reach} offset={[-5, 10, 7]} intensity={3} tone={mood} />
      <hemisphereLight ref={sky} args={['#ffffff', '#080808', 0]} />
      {children}
      <gridHelper args={[14, 56, '#2e2e2e', '#232323']} position={[0, FLOOR, 0.3]} />
      <mesh position={[0, FLOOR + 0.002, 0.3]} rotation={[-Math.PI / 2, 0, 0]} material={catcher} receiveShadow>
        <planeGeometry args={[14, 14]} />
      </mesh>
    </>
  )
}

/** the flex anchors marked in yellow, `k` of the way from the frame's galvanized grey */
function markPlates(api: ElementApi, k: number) {
  const m = api.mats?.plate
  if (!m) return
  if (!m.userData.steel) m.userData.steel = m.color.clone()
  m.color.copy(m.userData.steel as THREE.Color).lerp(YELLOW, k)
}

/** the skin grown (or drawn back) by `strain` along its length; the plates bend by the same */
function setStrain(api: ElementApi, strain: number) {
  api.strain.value = strain
  if (api.skin) api.skin.scale.x = 1 + strain
}

/**
 * Two arrows at the skin's ends, riding on them, pointing out as it grows and in as it draws back:
 * `push` is +1 out, −1 in, its size how strongly; `strain` keeps them on the skin's ends.
 */
function Arrows({ state }: { state: { current: { push: number; strain: number } } }) {
  const group = useRef<THREE.Group>(null)
  const ends = useRef<(THREE.Group | null)[]>([])
  const geo = useMemo(
    () => ({
      shaft: new THREE.CylinderGeometry(0.009, 0.009, 0.14, 10).rotateZ(-Math.PI / 2).translate(0.07, 0, 0),
      head: new THREE.ConeGeometry(0.032, 0.07, 16).rotateZ(-Math.PI / 2).translate(0.175, 0, 0),
    }),
    [],
  )
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: YELLOW, transparent: true, toneMapped: false, fog: false, depthWrite: false }), [])
  useEffect(
    () => () => {
      geo.shaft.dispose()
      geo.head.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  useFrame(() => {
    const { push, strain } = state.current
    const a = Math.min(1, Math.abs(push))
    mat.opacity = a
    if (group.current) group.current.visible = a > 0.01
    ends.current.forEach((e, i) => {
      if (!e) return
      const side = i === 0 ? 1 : -1
      const end = (LEN / 2) * (1 + strain)
      // out: the arrow stands just off the end, pointing away; in: it stands further off, pointing back at it
      const out = push >= 0
      e.position.set(side * (end + (out ? 0.05 : 0.3)), 0.27, 0.3)
      e.rotation.set(0, side * (out ? 1 : -1) > 0 ? 0 : Math.PI, 0)
      e.scale.setScalar(0.6 + 0.4 * a)
    })
  })
  return (
    <group ref={group}>
      {[0, 1].map((i) => (
        <group key={i} ref={(el) => void (ends.current[i] = el)}>
          <mesh geometry={geo.shaft} material={mat} renderOrder={2} />
          <mesh geometry={geo.head} material={mat} renderOrder={2} />
        </group>
      ))}
    </group>
  )
}

/**
 * fixed over flex anchors: the frame stands alone, its L plates come in (yellow), and the skin slides
 * in from behind them onto their feet, where it is fixed
 */
export function AnchorScene({ t, live, compact }: SceneProps) {
  const api = useMemo(createElementApi, [])
  const play = useMemo(
    () => (v: number, mood: Mood) => {
      const plates = smooth(0.08, 0.34, v)
      const dock = smooth(0.36, 0.8, v)
      // the skin eases in and settles, with the least overshoot as it seats on the plates' feet
      const e = 1 - Math.pow(1 - dock, 3)
      if (api.skin) api.skin.position.z = 0.55 * (1 - e) - 0.006 * Math.sin(Math.PI * dock) * dock
      if (api.mats) {
        setOpacity([api.mats.plate], plates)
      }
      markPlates(api, plates)
      setStrain(api, 0)
      mood.intensity = 3
      mood.color.copy(NOON.sun)
      mood.skyI = 0
    },
    [api],
  )
  return (
    <Studio t={t} live={live} compact={compact} open={OPEN} close={CLOSE} play={play}>
      <Element api={api} lattice={false} />
    </Studio>
  )
}


/** in to the anchors at the element's last stud, where the skin moves most: seen from inside the frame, the plates bending clear of the stud, the skin's end beside them */
const PLATES: Shot = { target: [0.95, 0.2, 0.3], dist: 3, azim: 212, elev: 28 }
/** while the camera comes in, then the heat (or the cool) plays out once it is there */
const MOVE: [number, number] = [0.04, 0.38]
const WARM = new THREE.Color('#ff7a1a')
const COOL = new THREE.Color('#2a5bff')

/** the skin's concrete glowing with the heat it has taken in (`warm`), or cooled by the night air (`cool`), 0..1 */
function tintSkin(api: ElementApi, warm: number, cool: number) {
  if (!api.mats) return
  for (const m of [api.mats.coat, api.mats.backing]) {
    m.emissive.copy(WARM).multiplyScalar(0.32 * warm).add(COOL.clone().multiplyScalar(0.3 * cool))
    m.emissiveIntensity = 1
  }
}

/**
 * Where the skin's end stands at rest: its section drawn dashed at the end of the element, fixed in
 * place, so the skin can be seen to pass it as it grows and to fall short of it as it draws back.
 */
function RestMark({ state }: { state: { current: { show: number } } }) {
  const line = useMemo(() => {
    const x = LEN / 2
    const outer = offsetPath(PROFILE, 0).map((p) => new THREE.Vector3(...toLocal(p, x)))
    const inner = offsetPath(PROFILE, SKIN).map((p) => new THREE.Vector3(...toLocal(p, x)))
    const g = new THREE.BufferGeometry().setFromPoints([...outer, ...inner.reverse(), outer[0]])
    const m = new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.012, gapSize: 0.008, transparent: true, depthWrite: false, toneMapped: false, fog: false })
    const l = new THREE.Line(g, m)
    l.computeLineDistances()
    l.renderOrder = 3
    return l
  }, [])
  useEffect(
    () => () => {
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    },
    [line],
  )
  useFrame(() => {
    const m = line.material as THREE.LineDashedMaterial
    m.opacity = 0.85 * state.current.show
    line.visible = state.current.show > 0.01
  })
  return <primitive object={line} />
}

/** a fixed scatter for the particles: four numbers in 0..1 for each */
const seeds = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    [0, 1, 2, 3].map((k) => {
      const s = Math.sin((i + 1) * (12.9898 + k * 78.233)) * 43758.5453
      return s - Math.floor(s)
    }),
  )

/**
 * What moves the skin, drawn as fine streaks: `heat`, hot air rising off the skin's top and up through
 * the cavity behind it, along its last stretch; `air`, the night's cool air drawn in along the element,
 * over its top and through the cavity, past the plates. `amount` (0..1) is how strongly.
 */
function Flow({ kind, state }: { kind: 'heat' | 'air'; state: { current: { amount: number } } }) {
  const N = 90
  const mesh = useRef<THREE.InstancedMesh>(null)
  const rnd = useMemo(() => seeds(N), [])
  const geo = useMemo(() => (kind === 'heat' ? new THREE.BoxGeometry(0.005, 0.06, 0.005) : new THREE.BoxGeometry(0.14, 0.004, 0.004)), [kind])
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: kind === 'heat' ? '#ff8a2a' : '#9fd4ff', transparent: true, toneMapped: false, fog: false, depthWrite: false, opacity: 0.85 }),
    [kind],
  )
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const a = state.current.amount
    m.visible = a > 0.01
    if (!m.visible) return
    const now = performance.now() / 1000
    rnd.forEach(([r0, r1, r2, r3], i) => {
      const period = kind === 'heat' ? 2 + r1 * 1.6 : 1.6 + r1 * 1.2
      const ph = (now / period + r0) % 1
      const cavity = i % 2 === 0
      if (kind === 'heat') {
        // rising, wavering as hot air does
        const x = 0.35 + r2 * 0.95 + 0.012 * Math.sin(ph * 14 + r0 * 6)
        if (cavity) dummy.position.set(x, 0.02 + ph * 0.5, 0.09 + r3 * 0.12)
        else dummy.position.set(x, 0.56 + ph * 0.4, BACK + 0.02 + r3 * 0.36)
        dummy.rotation.set(0, 0, 0.15 * Math.sin(ph * 9 + r1 * 5))
      } else {
        // drawn in from the end, along the element
        const x = 1.75 - ph * 1.5
        const wave = 0.008 * Math.sin(ph * 10 + r0 * 6)
        if (cavity) dummy.position.set(x, 0.05 + r2 * 0.42 + wave, 0.09 + r3 * 0.14)
        else dummy.position.set(x, 0.58 + r2 * 0.12 + wave, BACK + r3 * 0.4)
        dummy.rotation.set(0, 0, 0)
      }
      dummy.scale.setScalar(Math.sin(Math.PI * ph) * a)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[geo, mat, N]} frustumCulled={false} renderOrder={2} />
}

/**
 * day, 45 °C: the light warms; the camera comes in to the plates at the last stud;
 * the skin takes in the heat (it glows, hot air rises off it) and grows along its length, past where
 * its end stood, and the L plates, fixed at the stud, bend over their length to go with it
 */
export function DayScene({ t, live, compact }: SceneProps) {
  const api = useMemo(createElementApi, [])
  const arrows = useRef({ push: 0, strain: 0 })
  const heatFlow = useRef({ amount: 0 })
  const rest = useRef({ show: 0 })
  const play = useMemo(
    () => (v: number, mood: Mood) => {
      const heat = smooth(0.3, 0.88, v)
      const strain = HOT * heat
      setStrain(api, strain)
      markPlates(api, 0.85)
      tintSkin(api, heat, 0)
      mood.intensity = 3 + 0.9 * smooth(0.05, 0.5, v)
      mood.color.copy(NOON.sun).lerp(HEAT.sun, smooth(0.05, 0.6, v))
      mood.sky.copy(HEAT.sky)
      mood.skyI = 0.5 * smooth(0.05, 0.6, v)
      heatFlow.current.amount = smooth(0.2, 0.45, v)
      rest.current.show = smooth(0.25, 0.38, v)
      arrows.current.push = 0.7 * smooth(0.45, 0.65, v)
      arrows.current.strain = strain
    },
    [api],
  )
  return (
    <Studio t={t} live={live} compact={compact} open={OPEN} close={PLATES} move={MOVE} play={play}>
      <Element api={api} lattice={false} />
      <RestMark state={rest} />
      <Flow kind="heat" state={heatFlow} />
      <Arrows state={arrows} />
    </Studio>
  )
}

/**
 * night: the light cools; the camera comes in to the same plates; the night's air is
 * drawn along the element, over it and through the cavity, and takes the heat out of the skin (its glow
 * goes, it turns cold); the skin draws back, short of where its end stood, and the plates bend back with
 * it, the skin flat and whole all the while: no warping, no cracking
 */
export function NightScene({ t, live, compact }: SceneProps) {
  const api = useMemo(createElementApi, [])
  const arrows = useRef({ push: 0, strain: 0 })
  const air = useRef({ amount: 0 })
  const rest = useRef({ show: 0 })
  const play = useMemo(
    () => (v: number, mood: Mood) => {
      const cool = smooth(0.32, 0.9, v)
      const strain = HOT + (COLD - HOT) * cool
      setStrain(api, strain)
      markPlates(api, 0.85)
      tintSkin(api, 1 - smooth(0.25, 0.7, v), cool)
      const dusk = smooth(0.0, 0.4, v)
      mood.intensity = 3.9 - 2.9 * dusk
      mood.color.copy(HEAT.sun).lerp(DUSK.sun, dusk)
      mood.sky.copy(HEAT.sky).lerp(DUSK.sky, dusk)
      mood.skyI = 0.5 - 0.25 * dusk
      air.current.amount = smooth(0.18, 0.4, v)
      rest.current.show = smooth(0.25, 0.38, v)
      arrows.current.push = -0.7 * smooth(0.45, 0.65, v)
      arrows.current.strain = strain
    },
    [api],
  )
  return (
    <Studio t={t} live={live} compact={compact} open={OPEN} close={PLATES} move={MOVE} play={play}>
      <Element api={api} lattice={false} />
      <RestMark state={rest} />
      <Flow kind="air" state={air} />
      <Arrows state={arrows} />
    </Studio>
  )
}
