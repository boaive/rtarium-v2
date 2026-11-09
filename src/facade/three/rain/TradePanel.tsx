import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { ArrowLine } from '../Box'
import { Anchor } from '../Stage3D'
import { approach, type LabelBus } from '../kit'
import { prefersReducedMotion } from '../../../lib/motion'
import { smooth } from '../../progress'
import { StudioFog } from '../unit/BurstUnit'

/**
 * The trade-offs of the façade materials RTARIUM is set against (Rainscreen page), one material to a card, each
 * playing out what it falls short on, in the studio of the Unitized page's four problems (`FlawPanel`):
 *
 *   0  precast concrete   the panel swells to its 125–150 mm, and its weight comes on under it
 *   1  natural stone      small tiles come in one by one, and the joints between them light up
 *   2  GRC                the glass fibre in it shortens and dulls with age, and a crack runs across
 *   3  UHPC               its steel fibre rusts, and the rust bleeds out onto the face
 *   4  metal / ACP        a knock dents it, and its colour fades
 *
 * `act` is how far the card has played (0..1), written by the section's card clock; pointing at a card (`hover`)
 * shows it played out, and in a `card` the panel stands closer, turned to the visitor. A visual model, not a test.
 */

const W = 1.2
const H = 0.8
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

/** the crack that runs across the GRC panel as it gives */
const crackY = (x: number) => 0.04 + 0.02 * Math.sin(x * 21 + 0.7) + 0.01 * Math.sin(x * 53 + 0.2)

/** the stone's tiles: a small panel each, in a grid with joints between */
const COLS = 4
const ROWS = 4
const GAP = 0.016
const TW = (W - GAP * (COLS - 1)) / COLS
const TH = (H - GAP * (ROWS - 1)) / ROWS

/** where the ACP panel is knocked in */
const DENT: [number, number] = [0.2, 0.06]

export const TRADE_STATES = 5

export function TradePanel({ k, act, hover, bus, live, compact = false, card = false }: { k: number; act: { current: number }; hover: boolean; bus: LabelBus; live: { current: boolean }; compact?: boolean; card?: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])

  const m = useMemo(
    () => ({
      concrete: new THREE.MeshStandardMaterial({ color: '#cfc8ba', roughness: 0.92 }),
      // see-through concrete, where what is inside it is the point
      glass: new THREE.MeshStandardMaterial({ color: '#d8d2c6', roughness: 0.9, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
      edge: new THREE.LineBasicMaterial({ color: '#e9e4d8', transparent: true, opacity: 0.55 }),
      steel: new THREE.MeshStandardMaterial({ color: '#9aa1a8', metalness: 0.75, roughness: 0.32 }),
      glassFibre: new THREE.MeshStandardMaterial({ color: '#f4f6f2', emissive: '#6d736f', roughness: 0.35 }),
      steelFibre: new THREE.MeshStandardMaterial({ color: '#8d949b', metalness: 0.7, roughness: 0.35 }),
      rust: new THREE.MeshBasicMaterial({ color: '#9c4a1c', transparent: true, opacity: 0, depthWrite: false }),
      stone: ['#6b6b6e', '#7b7976', '#5c5e62'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.05 })),
      joint: new THREE.LineBasicMaterial({ color: '#fdd001', transparent: true, opacity: 0, toneMapped: false }),
      acp: new THREE.MeshStandardMaterial({ color: '#4f7896', metalness: 0.55, roughness: 0.3, side: THREE.DoubleSide }),
      load: new THREE.MeshBasicMaterial({ color: '#fdd001', toneMapped: false }),
      crack: new THREE.LineBasicMaterial({ color: '#fdd001', toneMapped: false }),
    }),
    [],
  )
  const geo = useMemo(() => {
    const unit = new THREE.BoxGeometry(W, H, 1)
    // the stone's joints: the lines between its tiles
    const jp: number[] = []
    for (let c = 1; c < COLS; c++) {
      const x = -W / 2 + c * (TW + GAP) - GAP / 2
      jp.push(x, -H / 2, 0.016, x, H / 2, 0.016)
    }
    for (let r = 1; r < ROWS; r++) {
      const y = -H / 2 + r * (TH + GAP) - GAP / 2
      jp.push(-W / 2, y, 0.016, W / 2, y, 0.016)
    }
    const joints = new THREE.BufferGeometry()
    joints.setAttribute('position', new THREE.Float32BufferAttribute(jp, 3))
    // the GRC's crack, drawn across as it opens
    const cp: number[] = []
    const steps = 60
    for (let i = 0; i < steps; i++) {
      const x0 = -W / 2 + (i / steps) * W
      const x1 = -W / 2 + ((i + 1) / steps) * W
      cp.push(x0, crackY(x0), 0.011, x1, crackY(x1), 0.011)
    }
    const crack = new THREE.BufferGeometry()
    crack.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3))
    return {
      unit,
      unitEdges: new THREE.EdgesGeometry(unit),
      thin: new THREE.BoxGeometry(W, H, 0.02),
      thinEdges: new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, 0.02)),
      beam: new THREE.BoxGeometry(W * 1.25, 0.05, 0.05),
      rod: new THREE.CylinderGeometry(0.006, 0.006, 0.07, 8),
      tile: new THREE.BoxGeometry(TW, TH, 0.025),
      joints,
      crack,
      glassFibre: new THREE.CylinderGeometry(0.0022, 0.0022, 0.06, 5).rotateZ(Math.PI / 2),
      steelFibre: new THREE.CylinderGeometry(0.0018, 0.0018, 0.045, 5).rotateZ(Math.PI / 2),
      stain: new THREE.CircleGeometry(1, 28),
      sheet: new THREE.PlaneGeometry(W, H, 48, 32),
    }
  }, [])
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      Object.values(m).forEach((x) => (Array.isArray(x) ? x.forEach((y) => y.dispose()) : x.dispose()))
    },
    [geo, m],
  )

  // the strands in the GRC and UHPC panels, and the rust stains on the UHPC's face
  const strands = useMemo(() => {
    const rnd = seeded(17 + k)
    return Array.from({ length: k === 3 ? 260 : 220 }, () => ({ x: (rnd() - 0.5) * (W - 0.08), y: (rnd() - 0.5) * (H - 0.08), z: (rnd() - 0.5) * 0.012, a: rnd() * Math.PI }))
  }, [k])
  const stains = useMemo(() => {
    const rnd = seeded(41)
    return Array.from({ length: 8 }, () => ({ x: (rnd() - 0.5) * (W - 0.2), y: (rnd() - 0.5) * (H - 0.2), r: 0.035 + rnd() * 0.05 }))
  }, [])
  // the stone's tiles, in the order they come in, each its own shade
  const tiles = useMemo(() => {
    const rnd = seeded(5)
    const out: { x: number; y: number; s: number; at: number }[] = []
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) out.push({ x: -W / 2 + TW / 2 + c * (TW + GAP), y: -H / 2 + TH / 2 + r * (TH + GAP), s: Math.floor(rnd() * 3), at: (r * COLS + c) / (ROWS * COLS) })
    return out
  }, [])
  // the ACP sheet as it stands, before the knock
  const flat = useMemo(() => Float32Array.from(geo.sheet.attributes.position.array as ArrayLike<number>), [geo])

  const s = useRef({ h: 0 })
  const lastA = useRef(-1)
  const panel = useRef<THREE.Group>(null)
  const weight = useRef<THREE.Group>(null)
  const tileRefs = useRef<(THREE.Mesh | null)[]>([])
  const fibres = useRef<THREE.InstancedMesh>(null)
  const crackLine = useRef<THREE.LineSegments>(null)
  const stainRefs = useRef<(THREE.Mesh | null)[]>([])
  const knock = useRef<THREE.Group>(null)
  const sheet = useRef<THREE.Mesh>(null)
  useEffect(() => invalidate(), [hover, invalidate])

  const mx = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const sc = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const zAxis = useMemo(() => new THREE.Vector3(0, 0, 1), [])
  const steelColor = useMemo(() => new THREE.Color('#8d949b'), [])
  const rustColor = useMemo(() => new THREE.Color('#a24d1b'), [])
  const freshGlass = useMemo(() => new THREE.Color('#f4f6f2'), [])
  const agedGlass = useMemo(() => new THREE.Color('#7a756b'), [])
  const freshAcp = useMemo(() => new THREE.Color('#4f7896'), [])
  const fadedAcp = useMemo(() => new THREE.Color('#aab5bb'), [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const st = s.current
    let moving = false
    if (approach(st, 'h', hover ? 1 : 0, reduced ? 1e3 : 5, dt, 1e-3)) moving = true
    const a = lerp(act.current, 1, st.h)

    // the camera: in front, a little to the side, held clear of the words under the card
    const t = performance.now() / 1000
    const idle = !reduced && live.current
    const sway = idle ? 3 * Math.sin((t * Math.PI * 2) / 14) : 0
    const Az = ((22 + sway - (card ? st.h * 12 : 0)) * Math.PI) / 180
    const E = (12 * Math.PI) / 180
    const base = k === 0 ? 3.35 : 3.1
    const d = base * (card ? 1.2 * Math.max(1, 1.14 / (size.width / size.height)) : compact ? 1.15 : 1.22)
    const ty = k === 0 ? -0.06 : 0
    camera.fov = 26
    camera.position.set(d * Math.cos(E) * Math.sin(Az), ty + d * Math.sin(E), d * Math.cos(E) * Math.cos(Az))
    camera.lookAt(0, ty, 0)
    camera.setViewOffset(size.width, size.height, 0, compact ? 0 : size.height * 0.04, size.width, size.height)
    camera.updateProjectionMatrix()

    if (a !== lastA.current) {
      lastA.current = a
      if (k === 0) {
        // precast: thin to its full thickness, then its weight on the frame, the panel settling under it
        const thick = lerp(0.02, 0.14, smooth(0, 0.55, a))
        const load = smooth(0.45, 1, a)
        if (panel.current) {
          panel.current.scale.z = thick
          panel.current.position.y = -0.025 * load
        }
        if (weight.current) {
          weight.current.visible = load > 0.01
          weight.current.scale.setScalar(Math.max(0.001, load))
        }
      } else if (k === 1) {
        // stone: tile after tile comes down into place, then the joints between them light up
        tiles.forEach((tl, i) => {
          const el = tileRefs.current[i]
          if (!el) return
          const p = smooth(tl.at * 0.7, tl.at * 0.7 + 0.14, a)
          el.visible = p > 0.005
          el.position.set(tl.x, tl.y + (1 - p) * 0.28, (1 - p) * 0.12)
          el.scale.setScalar(0.7 + 0.3 * p)
        })
        m.joint.opacity = smooth(0.78, 1, a)
      } else if (k === 2 || k === 3) {
        // GRC: the glass fibre shortens and dulls, then the panel cracks; UHPC: the steel fibre rusts and bleeds
        const age = smooth(0, 0.7, a)
        const im = fibres.current
        if (im) {
          sc.set(k === 2 ? 1 - 0.65 * age : 1, 1, 1)
          strands.forEach((f, i) => {
            q.setFromAxisAngle(zAxis, f.a)
            v.set(f.x, f.y, f.z)
            mx.compose(v, q, sc)
            im.setMatrixAt(i, mx)
          })
          im.instanceMatrix.needsUpdate = true
        }
        if (k === 2) {
          m.glassFibre.color.copy(freshGlass).lerp(agedGlass, age)
          m.glassFibre.emissiveIntensity = 1 - 0.8 * age
          const open = smooth(0.7, 1, a)
          if (crackLine.current) crackLine.current.visible = open > 0.002
          geo.crack.setDrawRange(0, Math.floor((geo.crack.attributes.position.count * open) / 2) * 2)
        } else {
          m.steelFibre.color.copy(steelColor).lerp(rustColor, smooth(0, 0.6, a))
          m.steelFibre.metalness = 0.7 - 0.5 * smooth(0, 0.6, a)
          const bleed = smooth(0.35, 1, a)
          m.rust.opacity = 0.55 * bleed
          stains.forEach((sn, i) => {
            const el = stainRefs.current[i]
            if (!el) return
            el.visible = bleed > 0.01
            el.scale.setScalar(Math.max(0.001, sn.r * (0.3 + 0.7 * bleed)))
          })
        }
      } else if (k === 4) {
        // ACP: a knock comes in and dents it, then the colour fades
        const hit = smooth(0, 0.3, a)
        const dent = smooth(0.22, 0.42, a)
        const fade = smooth(0.5, 1, a)
        if (knock.current) {
          knock.current.visible = hit > 0.01 && dent < 0.98
          knock.current.position.z = 0.52 - 0.46 * hit
        }
        const pos = geo.sheet.attributes.position as THREE.BufferAttribute
        for (let i = 0; i < pos.count; i++) {
          const x = flat[i * 3]
          const y = flat[i * 3 + 1]
          const r2 = (x - DENT[0]) ** 2 + (y - DENT[1]) ** 2
          pos.setZ(i, -0.07 * dent * Math.exp(-r2 / (2 * 0.075 ** 2)))
        }
        pos.needsUpdate = true
        geo.sheet.computeVertexNormals()
        m.acp.color.copy(freshAcp).lerp(fadedAcp, fade)
        m.acp.roughness = 0.3 + 0.45 * fade
        m.acp.metalness = 0.55 - 0.35 * fade
      }
    }
    if (moving || idle) invalidate()
  }, -1)

  return (
    <group>
      {k === 0 && (
        <group>
          {/* the frame it hangs from, and the panel at its full weight */}
          <mesh geometry={geo.beam} material={m.steel} position={[0, H / 2 + 0.1, 0]} castShadow />
          {[-0.4, 0.4].map((x) => (
            <mesh key={x} geometry={geo.rod} material={m.steel} position={[x, H / 2 + 0.04, 0]} />
          ))}
          <group ref={panel} scale={[1, 1, 0.02]}>
            <mesh geometry={geo.unit} material={m.concrete} castShadow />
            <lineSegments geometry={geo.unitEdges} material={m.edge} />
          </group>
          <group ref={weight} position={[0, -H / 2 - 0.08, 0.1]} visible={false}>
            <group rotation={[0, 0, Math.PI]}>
              <ArrowLine length={0.36} mat={m.load} radius={0.009} />
            </group>
          </group>
          <Anchor bus={bus} id="tr-0" position={[W / 2, -H / 4, 0.07]} />
        </group>
      )}
      {k === 1 && (
        <group>
          {tiles.map((tl, i) => (
            <mesh key={i} ref={(el) => void (tileRefs.current[i] = el)} geometry={geo.tile} material={m.stone[tl.s]} position={[tl.x, tl.y, 0]} visible={false} castShadow />
          ))}
          <lineSegments geometry={geo.joints} material={m.joint} />
          <Anchor bus={bus} id="tr-1" position={[-W / 2 + 2 * (TW + GAP) - GAP / 2, -H / 2 + 2 * (TH + GAP) - GAP / 2, 0.016]} />
        </group>
      )}
      {(k === 2 || k === 3) && (
        <group>
          <mesh geometry={geo.thin} material={m.glass} renderOrder={2} castShadow />
          <lineSegments geometry={geo.thinEdges} material={m.edge} />
          <instancedMesh ref={fibres} args={[k === 2 ? geo.glassFibre : geo.steelFibre, k === 2 ? m.glassFibre : m.steelFibre, strands.length]} frustumCulled={false} />
          {k === 2 && <lineSegments ref={crackLine} geometry={geo.crack} material={m.crack} visible={false} />}
          {k === 3 &&
            stains.map((sn, i) => (
              <mesh key={i} ref={(el) => void (stainRefs.current[i] = el)} geometry={geo.stain} material={m.rust} position={[sn.x, sn.y, 0.0112]} visible={false} renderOrder={3} />
            ))}
          <Anchor bus={bus} id={k === 2 ? 'tr-2' : 'tr-3'} position={k === 2 ? [0.3, crackY(0.3), 0.011] : [stains[0].x, stains[0].y, 0.011]} />
        </group>
      )}
      {k === 4 && (
        <group>
          <mesh ref={sheet} geometry={geo.sheet} material={m.acp} castShadow />
          <lineSegments geometry={geo.thinEdges} material={m.edge} scale={[1, 1, 0.2]} />
          {/* the knock, coming in at the face */}
          <group ref={knock} position={[DENT[0], DENT[1], 0.52]} visible={false}>
            <group rotation={[-Math.PI / 2, 0, 0]}>
              <ArrowLine length={0.24} mat={m.load} radius={0.008} />
            </group>
          </group>
          <Anchor bus={bus} id="tr-4" position={[DENT[0], DENT[1], 0]} />
        </group>
      )}
      {/* the studio: a fine grid going into the dark, the shadows on it */}
      <StudioFog color="#0b0b0b" near={7} far={16} />
      <gridHelper args={[14, 56, '#2e2e2e', '#232323']} position={[0, -0.98, 0]} />
      <mesh position={[0, -0.975, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <shadowMaterial color="#000000" opacity={0.42} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}
