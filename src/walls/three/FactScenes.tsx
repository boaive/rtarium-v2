import { createContext, Suspense, useContext, useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { prefersReducedMotion } from '../../lib/motion'
import { smooth } from '../../facade/progress'
import { Lines } from '../../flooring/data/three/dc'
import { ink, useDrawing, useInkResolution } from '../../flooring/data/three/draw'
import { disposeWallKit, MM, slab, slabs, useWallTextures, wallKit, type WallKit } from './kit'
import { eyeBoltGeometry } from './piece'
import { Rtarium } from './Panel'
import { WIRE } from '../../three/wire'

/**
 * The story's facts (Wall Panels), two to a block, each a small 3D scene that plays its moment once each time its box
 * comes into view (the magnet takes the nut up, the weights come down, the clock runs), then stands at the moment that
 * says it; the view sways a touch:
 *
 *   strength  a piece of the 30 mm panel hung by two eye bolts in its ferrules, weights on it: 125 kg at each point
 *   magnet    a lifting magnet over a piece lying flat: it has taken the steel nut up, the panel stays
 *   fire      a piece of the 100 mm SIP insulated panel (the fire-rated one; owner): its face takes the heat, amber to
 *             yellow, the heat falling away through its section, a clock beside it at 4:00 hours (no flames)
 *   caliper   a caliper closed on the panel's edge: 30.0 mm
 *   carbon    a square metre of the panel, given up: its concrete gathered into a cube of 0.03 m³, the basalt mesh
 *             stays; less concrete, no steel (RTARIUM alone, nothing compared: owner)
 *
 * Each scene is centred on the origin, its floor at its own foot; `FACT_SIZE` is what the camera fits.
 */

export type Fact = 'strength' | 'magnet' | 'fire' | 'caliper' | 'carbon'

export const FACT_SIZE: Record<Fact, [number, number]> = {
  strength: [1.85, 1.6],
  magnet: [1.05, 1.15],
  fire: [1.5, 1.25],
  caliper: [0.44, 0.3],
  carbon: [2.0, 1.62],
}
/** the moment of each one's sequence that it stands at */
const STILL: Record<Fact, number> = { strength: 5.5, magnet: 2.9, fire: 6.4, caliper: 2.6, carbon: 6.4 }

type Trio = [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
/** a small bounce as something lands (0..1 → 0 at the end) */
const settle = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(x * Math.PI * 2.4) * (1 - x) * 0.5)

/** the panel's finish in a box: light pink as on the rest of the page, the natural grey on a black box */
const Finish = createContext<'pink' | 'natural'>('pink')

function useKit() {
  const tex = useWallTextures()
  const finish = useContext(Finish)
  const m = useMemo(() => wallKit(tex, finish), [tex, finish])
  useEffect(() => () => disposeWallKit(m), [m])
  return m
}
const trio = (m: WallKit): Trio => [m.concrete, m.edge, m.outer]

/** whether a scene's box is on screen (its cell says): it plays each time it comes into view */
const Live = createContext<{ current: boolean }>({ current: true })

/**
 * where a scene stands in its sequence: it plays from the start, in seconds, each time its box comes into view, up to its
 * telling moment, and there it stays (under reduced motion it is simply there)
 */
function useClock(fact: Fact) {
  const live = useContext(Live)
  const invalidate = useThree((st) => st.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const t = useRef(reduced ? STILL[fact] : 0)
  const was = useRef(false)
  useFrame((_, delta) => {
    if (reduced) return
    const on = live.current
    if (on && !was.current) t.current = 0
    was.current = on
    if (on && t.current < STILL[fact]) {
      t.current = Math.min(STILL[fact], t.current + Math.min(delta, 1 / 20))
      invalidate()
    }
  }, -3)
  // (asked for a first frame, so a box that is already open starts playing)
  useEffect(() => invalidate(), [invalidate])
  return t
}

/** the site's own typeface, for the numbers drawn on a display */
const FACE = typeof document === 'undefined' ? 'sans-serif' : getComputedStyle(document.body).fontFamily || 'sans-serif'

/** a face for a digital display: numbers in the brand's yellow on black, drawn again only when they change */
function useDisplay(w = 256, h = 112) {
  const d = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    let last = ''
    const write = (big: string, unit: string) => {
      const k = `${big}|${unit}`
      if (k === last) return
      last = k
      const c = canvas.getContext('2d')!
      c.fillStyle = '#0b0c0d'
      c.fillRect(0, 0, w, h)
      c.fillStyle = '#fdd001'
      c.textBaseline = 'alphabetic'
      c.font = `800 ${Math.round(h * 0.62)}px ${FACE}`
      const bw = c.measureText(big).width
      c.font = `700 ${Math.round(h * 0.26)}px ${FACE}`
      const uw = c.measureText(unit).width
      const x = w - 14 - uw - 8 - bw
      c.font = `800 ${Math.round(h * 0.62)}px ${FACE}`
      c.fillText(big, x, h * 0.76)
      c.font = `700 ${Math.round(h * 0.26)}px ${FACE}`
      c.fillText(unit, w - 14 - uw, h * 0.76)
      tex.needsUpdate = true
    }
    write('0.0', 'kg')
    return { tex, write, material: new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) }
  }, [w, h])
  useEffect(
    () => () => {
      d.tex.dispose()
      d.material.dispose()
    },
    [d],
  )
  return d
}

/** the shadow each scene stands on: its own foot */
function Ground({ y = 0, size = 4, opacity = 0.2 }: { y?: number; size?: number; opacity?: number }) {
  const m = useMemo(() => new THREE.ShadowMaterial({ color: '#000000', transparent: true, opacity, depthWrite: false }), [opacity])
  useEffect(() => () => m.dispose(), [m])
  return (
    <mesh position={[0, y - 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m} receiveShadow>
      <planeGeometry args={[size, size]} />
    </mesh>
  )
}

/** a piece of the 30 mm panel lying flat, its inner face up: x across, z along, its top face at y = 0 */
function flatPiece(w: number, d: number, t = 0.03) {
  const g = slabs([slab(-w / 2, w / 2, -d / 2, d / 2, -t, 0)])
  // made in x–y with its thickness along z: lay it down, the inner face (+z) up
  g.rotateX(-Math.PI / 2)
  return g
}

/** a steel hex nut, `s` across flats, lying flat */
function nutGeometry(s: number, h: number) {
  const shape = new THREE.Shape()
  const r = s / Math.sqrt(3)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const p = [r * Math.cos(a), r * Math.sin(a)]
    if (i === 0) shape.moveTo(p[0], p[1])
    else shape.lineTo(p[0], p[1])
  }
  shape.closePath()
  const hole = new THREE.Path()
  hole.absarc(0, 0, s * 0.31, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelSize: h * 0.08, bevelThickness: h * 0.08, bevelSegments: 1 })
  g.rotateX(-Math.PI / 2)
  return g
}

/* ---- strength: hung by its ferrules, loaded to 125 kg a point ------------------------------------------------ */

const HANG = { y: 0.62, w: 1.2, d: 0.6, beam: 1.5 }
const WEIGHTS = [-0.21, -0.07, 0.07, 0.21]

function Strength({ readout }: { readout: RefObject<HTMLElement | null> }) {
  const m = useKit()
  const t = useClock('strength')
  const g = useMemo(() => {
    const link = new THREE.TorusGeometry(9 * MM, 2.6 * MM, 6, 14)
    return {
      piece: flatPiece(HANG.w, HANG.d),
      weight: new THREE.BoxGeometry(0.13, 0.12, 0.26),
      post: new THREE.BoxGeometry(0.06, HANG.beam, 0.06).translate(0, HANG.beam / 2, 0),
      beam: new THREE.BoxGeometry(1.74, 0.08, 0.08),
      foot: new THREE.BoxGeometry(0.3, 0.02, 0.3),
      eye: eyeBoltGeometry(),
      link,
    }
  }, [])
  const mats = useMemo(
    () => ({
      steel: new THREE.MeshStandardMaterial({ color: '#3e4246', metalness: 0.55, roughness: 0.45 }),
      iron: new THREE.MeshStandardMaterial({ color: '#5d6166', metalness: 0.35, roughness: 0.6 }),
      chain: new THREE.MeshStandardMaterial({ color: '#c9cdd1', metalness: 0.85, roughness: 0.28 }),
    }),
    [],
  )
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      Object.values(mats).forEach((x) => x.dispose())
    },
    [g, mats],
  )
  // the two chains: links from the beam down to each eye bolt, every other one turned
  const top = HANG.beam - 0.04
  const bottom = HANG.y + 0.075
  const pitch = 0.0255
  const n = Math.floor((top - bottom) / pitch)
  const chains = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const im = chains.current
    if (!im) return
    const mx = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    let k = 0
    for (const x of [-0.42, 0.42])
      for (let i = 0; i < n; i++) {
        q.setFromEuler(new THREE.Euler(0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2))
        mx.compose(new THREE.Vector3(x, bottom + (i + 0.5) * pitch, 0), q, new THREE.Vector3(1, 1, 1))
        im.setMatrixAt(k++, mx)
      }
    im.instanceMatrix.needsUpdate = true
  }, [n, bottom])
  const weights = useRef<(THREE.Mesh | null)[]>([])
  useFrame(() => {
    const s = t.current
    // each weight comes down onto the panel in turn, and they lift off together
    let on = 0
    weights.current.forEach((w, i) => {
      if (!w) return
      const a = 0.9 + i * 0.95
      const land = easeOut(smooth(a, a + 0.55, s))
      const off = ease(smooth(7.2, 8.2, s))
      on += land * (1 - off)
      w.position.set(WEIGHTS[i], HANG.y + 0.06 + 0.7 * (1 - land) + 0.9 * off + 0.006 * settle(smooth(a + 0.5, a + 0.9, s)), 0)
      w.visible = land > 0.01 && off < 0.99
    })
    if (readout.current) readout.current.textContent = `${Math.round(125 * (on / 4))} kg per point`
  }, -2)
  return (
    <group position={[0, -0.75, 0]}>
      <mesh geometry={g.piece} material={trio(m)} position={[0, HANG.y, 0]} castShadow receiveShadow />
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} geometry={g.eye} material={m.zinc} position={[x, HANG.y, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={1.4} castShadow />
      ))}
      <instancedMesh ref={chains} args={[g.link, mats.chain, n * 2]} castShadow />
      {[-0.84, 0.84].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh geometry={g.post} material={mats.steel} castShadow receiveShadow />
          <mesh geometry={g.foot} material={mats.steel} position={[0, 0.01, 0]} receiveShadow />
        </group>
      ))}
      <mesh geometry={g.beam} material={mats.steel} position={[0, HANG.beam, 0]} castShadow />
      {WEIGHTS.map((x, i) => (
        <mesh key={x} ref={(el) => void (weights.current[i] = el)} geometry={g.weight} material={mats.iron} castShadow receiveShadow visible={false} />
      ))}
      <Ground />
    </group>
  )
}

/* ---- non-magnetic: the nut goes, the panel stays -------------------------------------------------------------- */

function Magnet({ readout }: { readout: RefObject<HTMLElement | null> }) {
  const m = useKit()
  const t = useClock('magnet')
  const g = useMemo(
    () => ({
      piece: flatPiece(0.6, 0.6),
      body: new THREE.CylinderGeometry(0.17, 0.17, 0.1, 40).translate(0, 0.05, 0),
      band: new THREE.CylinderGeometry(0.172, 0.172, 0.025, 40).translate(0, 0.07, 0),
      face: new THREE.CylinderGeometry(0.165, 0.165, 0.01, 40).translate(0, 0.005, 0),
      lug: new THREE.TorusGeometry(0.035, 0.009, 8, 20),
      nut: nutGeometry(0.06, 0.03),
    }),
    [],
  )
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color: '#26292c', metalness: 0.5, roughness: 0.45 }),
      band: new THREE.MeshStandardMaterial({ color: '#fdd001', metalness: 0.2, roughness: 0.5 }),
      face: new THREE.MeshStandardMaterial({ color: '#8e959b', metalness: 0.8, roughness: 0.3 }),
      nut: new THREE.MeshStandardMaterial({ color: '#b8bdc2', metalness: 0.85, roughness: 0.3 }),
      cable: ink(1.4, '#080808', 0.85),
    }),
    [],
  )
  useInkResolution(useMemo(() => [mats.cable], [mats]))
  const cableL = useMemo(() => {
    const l = new Lines()
    l.seg([0, 0.14, 0], [0, 3, 0])
    return l
  }, [])
  const cable = useDrawing(cableL, mats.cable)
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      for (const x of [mats.body, mats.band, mats.face, mats.nut]) x.dispose()
    },
    [g, mats],
  )
  const magnet = useRef<THREE.Group>(null)
  const nut = useRef<THREE.Mesh>(null)
  const PANEL = 0.03
  const NUT_H = 0.03
  useFrame(() => {
    const s = t.current
    // down to hover over the nut: the nut leaps to it; down onto the panel, up again (the panel stays); back down,
    // the nut let go; away
    const high = 0.76
    const hover = PANEL + NUT_H + 0.075
    const touch = PANEL + NUT_H + 0.001
    const steps: [number, number, number][] = [
      [0.2, 1.2, hover],
      [1.6, 2.1, touch],
      [2.4, 3.4, high],
      [4.4, 5.2, hover],
      [5.8, 6.8, high],
    ]
    let y = high
    for (const [a, b, to] of steps) y += (to - y) * ease(smooth(a, b, s))
    if (magnet.current) magnet.current.position.y = y
    // the nut: lying on the panel, it leaps to the magnet's face, rides with it, and drops back when it is let go
    if (nut.current) {
      const rest = PANEL
      const leap = smooth(1.2, 1.38, s)
      const drop = smooth(5.2, 5.45, s)
      let ny = rest
      if (s < 5.2) ny = rest + (y - NUT_H - rest) * leap * leap
      else ny = rest + (y - NUT_H - rest) * (1 - drop * drop) + 0.006 * settle(smooth(5.42, 5.9, s))
      nut.current.position.y = ny
    }
    if (readout.current) readout.current.textContent = 'The steel nut goes. The panel stays.'
  }, -2)
  return (
    <group position={[0, -0.45, 0]}>
      <mesh geometry={g.piece} material={trio(m)} position={[0, PANEL, 0]} castShadow receiveShadow />
      <mesh ref={nut} geometry={g.nut} material={mats.nut} position={[0.06, PANEL, 0.05]} castShadow />
      <group ref={magnet}>
        <mesh geometry={g.body} material={mats.body} castShadow />
        <mesh geometry={g.band} material={mats.band} />
        <mesh geometry={g.face} material={mats.face} />
        <mesh geometry={g.lug} material={mats.body} position={[0, 0.13, 0]} />
        <primitive object={cable.obj} />
      </group>
      <Ground />
    </group>
  )
}

/* ---- fire-rated, 4 hours: the insulated panel's face takes the heat (the rating is the SIP panel's; no flames: owner) -- */

const HEAT_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
/**
 * Heat on a face: deep amber, to the brand's yellow, to pale as it builds, hottest at the foot, a slow shimmer rising through it.
 * `uDepth` > 0 turns it into the section's: the heat falls away through the thickness (u: 0 the cool face, 1 the hot one).
 */
const HEAT_FS = /* glsl */ `
uniform float uHeat;
uniform float uTime;
uniform float uDepth;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float n = noise(vec2(vUv.x * 5.0, vUv.y * 4.0 - uTime * 0.35)) * 0.6 + noise(vec2(vUv.x * 11.0 + 3.0, vUv.y * 9.0 - uTime * 0.6)) * 0.4;
  float h = uHeat * (0.74 + 0.26 * (1.0 - vUv.y)) + (n - 0.5) * 0.12 * uHeat;
  if (uDepth > 0.0) h *= exp(-(1.0 - vUv.x) * uDepth);
  vec3 c = mix(vec3(0.36, 0.24, 0.02), vec3(0.78, 0.55, 0.03), smoothstep(0.05, 0.45, h));
  c = mix(c, vec3(0.99, 0.76, 0.05), smoothstep(0.4, 0.8, h));
  c = mix(c, vec3(1.0, 0.86, 0.42), smoothstep(0.8, 1.05, h));
  gl_FragColor = vec4(c, smoothstep(0.02, 0.3, h) * 0.92);
}`

/** the clock: 0:00 to 4:00 hours over the heat's run */
const BURN: [number, number] = [0.6, 5.4]

function Fire({ readout }: { readout: RefObject<HTMLElement | null> }) {
  const m = useKit()
  const t = useClock('fire')
  const screen = useDisplay()
  const g = useMemo(() => {
    // a piece of the 100 mm SIP upright, 600 × 1000: its two 15 mm leaves (the outer one to the heat, towards the
    // camera) and the EPS/SPS core between them, showing at its edges
    const leaves = slabs([slab(-0.3, 0.3, 0.06, 1.06, 0, 0.015), slab(-0.3, 0.3, 0.06, 1.06, 0.085, 0.1)])
    const core = new THREE.BoxGeometry(0.6, 1.0, 0.07).translate(0, 0.56, 0.05)
    // the heat on its face, and in its section along its left edge (u across the thickness: back to front)
    const face = new THREE.PlaneGeometry(0.6, 1.0).translate(0, 0.56, 0.1006)
    const edge = new THREE.PlaneGeometry(0.1, 1.0).rotateY(-Math.PI / 2).translate(-0.3006, 0.56, 0.05)
    return {
      leaves,
      core,
      face,
      edge,
      foot: new THREE.BoxGeometry(0.08, 0.06, 0.24).translate(0, 0.03, 0),
      // the clock on its stand, beside the panel, turned to the camera
      box: new THREE.BoxGeometry(0.34, 0.16, 0.06).translate(0, 0.08, 0),
      dial: new THREE.PlaneGeometry(0.3, 0.131),
    }
  }, [])
  const heat = useMemo(() => {
    const make = (depth: number) =>
      new THREE.ShaderMaterial({
        vertexShader: HEAT_VS,
        fragmentShader: HEAT_FS,
        uniforms: { uHeat: { value: 0 }, uTime: { value: 0 }, uDepth: { value: depth } },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
    return { face: make(0), edge: make(7) }
  }, [])
  const mats = useMemo(() => ({ steel: new THREE.MeshStandardMaterial({ color: '#2a2d30', metalness: 0.4, roughness: 0.55 }) }), [])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      Object.values(heat).forEach((x) => x.dispose())
      Object.values(mats).forEach((x) => x.dispose())
    },
    [g, heat, mats],
  )
  const light = useRef<THREE.PointLight>(null)
  useFrame(() => {
    const s = t.current
    // the heat builds over the four hours, holds, and goes
    const run = Math.min(1, Math.max(0, (s - BURN[0]) / (BURN[1] - BURN[0])))
    const on = ease(smooth(BURN[0], BURN[1], s)) * (1 - ease(smooth(7.4, 8.4, s)))
    for (const h of [heat.face, heat.edge]) {
      h.uniforms.uHeat.value = 0.15 + 0.85 * on
      h.uniforms.uTime.value = s
      h.visible = on > 0.01
    }
    if (light.current) light.current.intensity = 1.6 * on
    // the clock: hours and minutes, held at 4:00, back to 0:00 once the heat has gone
    const mins = s > 8.4 ? 0 : Math.round(run * 240)
    screen.write(`${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`, 'h')
    if (readout.current) readout.current.textContent = 'Heat on one face'
  }, -2)
  return (
    <group position={[-0.14, -0.55, 0]}>
      <mesh geometry={g.leaves} material={[m.outer, m.edge, m.concrete]} castShadow receiveShadow />
      <mesh geometry={g.core} material={m.core} castShadow receiveShadow />
      <mesh geometry={g.face} material={heat.face} renderOrder={4} />
      <mesh geometry={g.edge} material={heat.edge} renderOrder={4} />
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} geometry={g.foot} material={mats.steel} position={[x, 0, 0.05]} castShadow receiveShadow />
      ))}
      <group position={[0.58, 0, 0.16]} rotation={[0, (-22 * Math.PI) / 180, 0]}>
        <mesh geometry={g.box} material={mats.steel} castShadow receiveShadow />
        <mesh geometry={g.dial} material={screen.material} position={[0, 0.08, 0.0305]} />
      </group>
      <pointLight ref={light} position={[0, 0.3, 0.45]} color="#fdc000" intensity={0} distance={1.5} decay={2} />
      <Ground />
    </group>
  )
}

/* ---- millimetric: the caliper on its edge ---------------------------------------------------------------------- */

function Caliper({ readout }: { readout: RefObject<HTMLElement | null> }) {
  const m = useKit()
  const t = useClock('caliper')
  const screen = useDisplay()
  const g = useMemo(
    () => ({
      // the piece raised on two blocks, its near long edge overhanging them, so the jaws reach round it
      piece: flatPiece(0.6, 0.4),
      block: new THREE.BoxGeometry(0.08, 0.06, 0.3).translate(0, 0.03, 0),
      // the caliper, standing: its beam upright, the fixed jaw at its foot, the slider with its display above
      beam: new THREE.BoxGeometry(0.024, 0.24, 0.005).translate(0, 0.12, 0),
      jaw: new THREE.BoxGeometry(0.018, 0.012, 0.075).translate(0, 0, -0.0375),
      slider: new THREE.BoxGeometry(0.075, 0.06, 0.018),
      face: new THREE.PlaneGeometry(0.06, 0.028),
    }),
    [],
  )
  const mats = useMemo(
    () => ({
      steel: new THREE.MeshStandardMaterial({ color: '#dfe3e7', metalness: 0.55, roughness: 0.28 }),
      body: new THREE.MeshStandardMaterial({ color: '#25282b', metalness: 0.2, roughness: 0.55 }),
      block: new THREE.MeshStandardMaterial({ color: '#7a7f84', metalness: 0.3, roughness: 0.6 }),
    }),
    [],
  )
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      Object.values(mats).forEach((x) => x.dispose())
    },
    [g, mats],
  )
  const caliper = useRef<THREE.Group>(null)
  const slider = useRef<THREE.Group>(null)
  const T = 0.03
  const Y = 0.06
  useFrame(() => {
    const s = t.current
    // in to the edge, closed (60 → 30 mm), read, opened, out; along the edge, and again
    const at = (a: number) => ({
      inn: ease(smooth(a, a + 0.6, s)) * (1 - ease(smooth(a + 2.6, a + 3.2, s))),
      shut: ease(smooth(a + 0.7, a + 1.3, s)) * (1 - ease(smooth(a + 2.2, a + 2.6, s))),
    })
    const one = at(0.2)
    const two = at(4.2)
    const along = ease(smooth(3.4, 4.1, s)) * (1 - ease(smooth(7.5, 7.95, s)))
    const inn = Math.max(one.inn, two.inn)
    const shut = Math.max(one.shut, two.shut)
    const gap = 0.06 - 0.03 * shut
    if (caliper.current) caliper.current.position.set(-0.08 + 0.16 * along, Y - 0.012, 0.2 + 0.12 * (1 - inn))
    if (slider.current) slider.current.position.y = 0.012 + gap + 0.006
    screen.write((gap * 1000).toFixed(1), 'mm')
    if (readout.current) readout.current.textContent = shut > 0.98 ? 'Thickness: 30.0 mm' : 'Thickness'
  }, -2)
  return (
    <group position={[0, -0.12, 0]}>
      <mesh geometry={g.piece} material={trio(m)} position={[0, Y + T, -0.05]} castShadow receiveShadow />
      {[-0.2, 0.2].map((x) => (
        <mesh key={x} geometry={g.block} material={mats.block} position={[x, 0, -0.08]} castShadow receiveShadow />
      ))}
      <group ref={caliper}>
        <mesh geometry={g.beam} material={mats.steel} castShadow />
        <mesh geometry={g.jaw} material={mats.steel} position={[0, 0.006, 0]} castShadow />
        <group ref={slider}>
          <mesh geometry={g.jaw} material={mats.steel} castShadow />
          <group position={[0, 0.042, 0.007]}>
            <mesh geometry={g.slider} material={mats.body} castShadow />
            <mesh geometry={g.face} material={screen.material} position={[0, 0.003, 0.0091]} />
          </group>
        </group>
      </group>
      <Ground />
    </group>
  )
}

/* ---- lower carbon: a square metre of the wall gives up what it is made of ------------------------------------- */

/** where the square metre stands, and where its concrete goes once gathered */
const SQ_X = -0.25
const CUBE_X = 0.62

function Carbon({ readout, dark }: { readout: RefObject<HTMLElement | null>; dark: boolean }) {
  const m = useKit()
  const t = useClock('carbon')
  const mats = useMemo(() => ({ outline: ink(1.2, dark ? '#fdd001' : '#080808', 0.9) }), [dark])
  useInkResolution(useMemo(() => [mats.outline], [mats]))
  const lines = useMemo(() => {
    const l = new Lines()
    l.rectZ(-0.5, 0, 0.5, 1, 0.012)
    // the corners marked a little proud, as a drawing's
    for (const [x, y] of [
      [-0.5, 0],
      [0.5, 0],
      [0.5, 1],
      [-0.5, 1],
    ]) {
      l.seg([x - 0.03 * Math.sign(x), y, 0.012], [x + 0.03 * Math.sign(x), y, 0.012])
    }
    return l
  }, [])
  const outline = useDrawing(lines, mats.outline)
  const mesh = useRef<THREE.Mesh>(null)
  const sheet = useRef<THREE.Group>(null)
  const frame = useRef<THREE.Group>(null)
  const last = useRef('')
  useEffect(() => () => mesh.current?.geometry.dispose(), [])
  const V = 0.03
  const C = Math.cbrt(V)
  useFrame(() => {
    const s = t.current
    // it parts: the concrete gathers into the cube it makes and moves off to the right, RTARIUM stays where it was
    const k = ease(smooth(1.4, 3.0, s)) * (1 - ease(smooth(7.6, 9.2, s)))
    const x = SQ_X * smooth(0, 0.35, k)
    // the same volume all the way: width and height move together on a log scale, the depth makes up the rest
    const w = Math.exp(Math.log(C) * k)
    const d = V / (w * w)
    const key = `${w.toFixed(4)}`
    const me = mesh.current
    if (me) {
      if (key !== last.current) {
        last.current = key
        const old = me.geometry
        me.geometry = slabs([slab(-w / 2, w / 2, 0, w, -d / 2, d / 2)])
        old.dispose()
      }
      me.position.x = x + (CUBE_X - x) * smooth(0.25, 1, k)
    }
    if (sheet.current) {
      sheet.current.visible = k > 0.01
      sheet.current.position.x = x
    }
    if (frame.current) frame.current.position.x = x
    mats.outline.opacity = (dark ? 0.9 : WIRE.opacity) * smooth(0.6, 1.0, s) * (1 - smooth(9.2, 9.8, s))
    if (readout.current)
      readout.current.textContent =
        s < 1.4 || s >= 7.6 ? '1 m² of wall, 30 mm thick' : s < 3.4 ? 'Its concrete: 0.03 m³' : s < 5.6 ? 'Its reinforcement: basalt, no steel' : 'Less concrete, no steel: lower carbon'
  }, -2)
  return (
    <group position={[0, -0.5, 0]}>
      <mesh ref={mesh} material={trio(m)} castShadow receiveShadow />
      {/* RTARIUM, a square metre of it: what stays when the concrete has gone */}
      <group ref={sheet} position={[SQ_X, 0.5, 0]} visible={false}>
        <Suspense fallback={null}>
          <Rtarium t={15} nx={84} ny={84} light={dark} />
        </Suspense>
      </group>
      <group ref={frame}>
        <primitive object={outline.obj} />
      </group>
      <Ground />
    </group>
  )
}

export function FactScene({ fact, readout, dark, live }: { fact: Fact; readout: RefObject<HTMLElement | null>; dark: boolean; live?: { current: boolean } }) {
  const always = useMemo(() => ({ current: true }), [])
  return (
    <Live.Provider value={live ?? always}>
      <Finish.Provider value={dark ? 'natural' : 'pink'}>{scene(fact, readout, dark)}</Finish.Provider>
    </Live.Provider>
  )
}

function scene(fact: Fact, readout: RefObject<HTMLElement | null>, dark: boolean) {
  switch (fact) {
    case 'strength':
      return <Strength readout={readout} />
    case 'magnet':
      return <Magnet readout={readout} />
    case 'fire':
      return <Fire readout={readout} />
    case 'caliper':
      return <Caliper readout={readout} />
    case 'carbon':
      return <Carbon readout={readout} dark={dark} />
  }
}
