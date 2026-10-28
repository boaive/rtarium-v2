import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { smooth, type Progress } from '../../progress'
import { setOpacity, type Shot } from '../kit'
import { mixShot } from '../ScrubRig'
import { prefersReducedMotion } from '../../../lib/motion'
import { block, merge, planarUV } from '../unit/parts'
import { buildingLines, craneLines, latticeLines, Lines } from './building'
import { FatLines, fatMaterial } from './lines'
import { bracketGeometry, colX, columnPanels, D, disposeRainMaterials, G, panelBoxes, railGeometry, rainMaterials, wallWidth, windowGeometry, woolGeometry, ZM } from './parts'

/**
 * Wall to skin (Rainscreen page): the rainscreen put up, on the page's own warm white, the way the
 * installation films show it. Everything starts as a fine line drawing (X-ray) and is made solid by a
 * scan as it is fixed:
 *
 *   1  one bay of the wall: the brackets anchored to it, then the mineral wool round them, held by
 *      its dowels, then the vertical rails clamped to the brackets, then the horizontal hanger profile
 *      the panel will hook onto (the order the installation films show)
 *   2  standing back: the tower crane, an X-ray, lifts the panel off the ground by its head, brings it
 *      in and lowers it onto its rail, where its clips hook on. As it settles it is seen through for a
 *      moment, to the RTARIUM inside it, and the view leans in a little; then it is solid again
 *   3  the apartment block comes in behind as a drawing, its lower floors already clad; one more
 *      scroll and the rest of the façade goes up by itself, floor by floor, and the crane goes
 *
 * Steps 1 and 2 follow the scroll; the façade going up is started by the scroll and runs in time.
 * Sizes and details show the principle; they are not a product drawing.
 */

const COLS = 10
const STOREYS = 7
const DEPTH = 13
const W = wallWidth(COLS)
const H = STOREYS * G.fh
/** the bay followed: its column (an even one, so its panel is a storey high) and its floor */
const I0 = 4
const J0 = 3
const BX = colX(I0)
const BY = J0 * G.fh
/**
 * The crane: its mast in the core, standing only as far out of the roof as its counter-weights need to
 * clear the core's head, its jib just long enough to reach the panel where it starts, on the ground in
 * front.
 */
const MAST: [number, number] = [W / 2, -DEPTH / 2 - 1]
const MAST_H = H + 4
const HEAD = 4
const JIB = 19
const COUNTER = 6
const START_Z = 9
/** the panel is lowered to just above its rail, then dropped the last few centimetres onto it */
const HOOK = 0.05

/** when each step happens (fractions of the section's run) */
export const INSTALL = {
  bracket: [0.02, 0.09],
  wool: [0.11, 0.18],
  rails: [0.2, 0.26],
  hanger: [0.27, 0.32],
  block: [0.33, 0.42],
  crane: [0.38, 0.44],
  lift: [0.43, 0.6],
  hook: [0.6, 0.63],
  look: [0.6, 0.71],
  wide: [0.71, 0.8],
  /** the rest of the façade going up, floor by floor, as the page is scrolled on; the crane goes at the end */
  fill: [0.66, 0.93],
  out: [0.92, 0.98],
} as const

/** how long each lot takes to settle into its place, as a share of the fill */
const RISE = 0.1

/** the camera, by the run; `settle` (0..1, as the crane goes) is the last move onto the finished block */
export function installShot(p: number, compact: boolean, settle = 0): Shot {
  const k = compact ? 0.62 : 1
  const kw = compact ? 0.62 : 1
  const cx = BX + G.pw / 2
  const cy = BY + G.fh / 2
  const a = smooth(0, 0.34, p)
  // the bay small on the page, with room round it (the Unitized slab to slab's spacing)
  const near: Shot = { target: [cx - 0.1, cy - 0.15, 0.12], dist: (20 + a * 1.5) * k, azim: -40 + a * 10, elev: 13 - a * 4, frame: [0.5, 0.47] }
  const lift: Shot = { target: [cx + 1, BY * 0.86, 3.5], dist: 58 * kw, azim: -36, elev: 7, frame: [0.5, 0.47] }
  // back at the bay as the panel hooks on, a little closer while RTARIUM shows
  const back: Shot = { target: [cx, cy + 0.4, 0.15], dist: 29 * k, azim: -28, elev: 15, frame: [0.5, 0.48] }
  const lean = smooth(INSTALL.look[0], INSTALL.look[0] + 0.04, p) * (1 - smooth(INSTALL.look[1] - 0.04, INSTALL.look[1], p))
  const look: Shot = { ...back, dist: back.dist * 0.88, azim: -27 }
  const wide: Shot = { target: [W * 0.5, (MAST_H + HEAD) * 0.5, -2], dist: 112 * kw, azim: -28, elev: 9, frame: [0.5, 0.52] }
  const done: Shot = { target: [W * 0.5, H * 0.5, -3], dist: 98 * kw, azim: -30, elev: 9, frame: [0.5, 0.5] }
  let s = mixShot(near, lift, smooth(INSTALL.crane[0] - 0.02, INSTALL.lift[0] + 0.04, p))
  s = mixShot(s, back, smooth(INSTALL.lift[1] - 0.07, INSTALL.hook[1], p))
  s = mixShot(s, look, lean)
  s = mixShot(s, wide, smooth(INSTALL.wide[0], INSTALL.wide[1], p))
  return mixShot(s, done, settle)
}

/** a part as two things: its solid self and its drawing, the scan between them */
interface Part {
  solids: { geo: THREE.BufferGeometry; mat: THREE.Material }[]
  lines: THREE.EdgesGeometry[]
  box: THREE.Box3
}

/** one lot of the façade (a panel, or a storey of window strip) and where it goes */
interface Lot {
  kind: 'full' | 'half' | 'win'
  x: number
  y: number
}

export const INSTALL_FOCUS: [number, number, number] = [W / 2, H / 2, 0]
export const INSTALL_REACH = Math.max(W, H) * 0.75

export function InstallScene({ progress, live, settle }: { progress: Progress; live: { current: boolean }; settle: { current: number } }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useEffect(() => {
    gl.localClippingEnabled = true
    ;(camera as THREE.PerspectiveCamera).far = 1200
    camera.updateProjectionMatrix()
  }, [gl, camera])

  const m = useMemo(rainMaterials, [])
  const ink = useMemo(() => new THREE.LineBasicMaterial({ color: '#080808', transparent: true, opacity: 0.5 }), [])
  const draw = useMemo(
    () => ({
      block: fatMaterial('#080808', 1.4, 0),
      context: fatMaterial('#080808', 1.3, 0.3),
      crane: fatMaterial('#080808', 1.2, 0),
      rig: new THREE.LineBasicMaterial({ color: '#080808', transparent: true, opacity: 0 }),
      textile: new THREE.LineBasicMaterial({ color: '#9b6f45', transparent: true, opacity: 0, depthWrite: false }),
    }),
    [],
  )

  // the bay: its wall (solid from the start), and the parts fixed to it, each scanned from drawing to solid
  const parts = useMemo(() => {
    const at = (g: THREE.BufferGeometry) => g.translate(BX, BY, 0)
    const own = (mat: THREE.Material) => {
      const c = mat.clone()
      c.userData = { ...mat.userData }
      return c
    }
    const make = (list: [THREE.BufferGeometry, THREE.Material][]): Part => {
      const box = new THREE.Box3()
      for (const [g] of list) {
        g.computeBoundingBox()
        box.union(g.boundingBox!)
      }
      return { solids: list.map(([geo, mat]) => ({ geo, mat: own(mat) })), lines: list.map(([g]) => new THREE.EdgesGeometry(g, 20)), box }
    }
    const b = bracketGeometry(1, 1)
    const r = railGeometry(1, 1)
    // the wool's dowels: a disc pressed into each board, through to the wall
    const dowels: THREE.BufferGeometry[] = []
    for (const x of [0.16, 0.45, 0.75, 1.04]) for (const y of [0.3, 1.0, 1.75, 2.45, 3.05]) dowels.push(new THREE.CylinderGeometry(0.035, 0.035, 0.006, 16).rotateX(Math.PI / 2).translate(x, y, D.wool[1] + 0.003))
    // the hanger profile across the panel's head (the clips on the panel's back hook over it)
    const hanger = block([0.06, G.fh - 0.2, D.hanger[0]], [G.pw - 0.06, G.fh - 0.15, D.hanger[1]])
    return {
      bracket: make([
        [at(b.steel), m.steel],
        [at(b.pads), m.pad],
      ]),
      wool: make([
        [at(woolGeometry(1, 1)), m.insulation],
        [at(merge(dowels)), m.pad],
      ]),
      rails: make([[at(r.rails), m.steel]]),
      hanger: make([[at(hanger), m.darkSteel]]),
    }
  }, [m])
  type Key = keyof typeof parts
  const planes = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(parts).map((k) => [k, { solid: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), line: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), band: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0) }]),
      ) as Record<Key, { solid: THREE.Plane; line: THREE.Plane; band: THREE.Plane }>,
    [parts],
  )
  const lineMats = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(parts).map((k) => {
          const l = ink.clone()
          l.clippingPlanes = [planes[k as Key].line]
          return [k, l]
        }),
      ) as Record<Key, THREE.LineBasicMaterial>,
    [parts, planes, ink],
  )
  /** the scan: the part's own surface in yellow, in a thin band just above the scan line */
  const scanMats = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(parts).map((k) => {
          const pl = planes[k as Key]
          return [k, new THREE.MeshBasicMaterial({ color: '#fdd001', toneMapped: false, side: THREE.DoubleSide, clippingPlanes: [pl.solid, pl.band], polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })]
        }),
      ) as Record<Key, THREE.MeshBasicMaterial>,
    [parts, planes],
  )
  useMemo(() => {
    for (const k of Object.keys(parts) as Key[]) for (const s of parts[k].solids) s.mat.clippingPlanes = [planes[k].solid]
  }, [parts, planes])

  const bay = useMemo(() => {
    // the wall behind the bay and a little either side, the slab edges above and below as a drawing
    const wall = planarUV(merge([block([BX - 0.02, BY, D.wall[0]], [BX + G.pw + 0.02, BY + G.fh, D.wall[1]])]), 0.9)
    const L = new Lines()
    for (const y of [BY, BY + G.fh]) L.box([BX - 0.9, y - 0.26, -1.4], [BX + G.pw + 0.9, y, D.wall[0]])
    // the panel, with the lifting anchors at its head and the textile in it as an X-ray
    const [rect] = columnPanels(0, 1)
    const panel = planarUV(merge(panelBoxes(rect)), 0.55).translate(BX, BY, 0)
    const clips = merge([0.16, G.pw - 0.16].map((x) => block([x - 0.04, G.fh - 0.17, D.hanger[1]], [x + 0.04, G.fh - 0.12, D.panel[0]]))).translate(BX, BY, 0)
    const textile = latticeLines(rect, ZM, 0.09).translate(BX, BY, 0)
    return { wall, context: L.geometry(), panel, clips, textile, rect }
  }, [])
  const panelMat = useMemo(() => {
    const c = m.concrete.clone()
    c.userData = { ...m.concrete.userData }
    return c
  }, [m])

  // the rest of the façade: lots of each kind, the floors below the bay's already clad
  const lots = useMemo(() => {
    const done: Lot[] = []
    const rest: Lot[] = []
    for (let k = 0; k < COLS; k++)
      for (const [a, b, , d] of columnPanels(k, STOREYS)) {
        if (k === I0 && Math.abs(b - (BY + G.joint / 2)) < 0.01) continue
        const lot: Lot = { kind: d - b > G.fh * 0.75 ? 'full' : 'half', x: a, y: b }
        ;(d <= BY + 0.01 ? done : rest).push(lot)
      }
    for (let k = 0; k < COLS - 1; k++) for (let s = 0; s < STOREYS; s++) (s < J0 ? done : rest).push({ kind: 'win', x: colX(k), y: s * G.fh })
    // the rest go up floor by floor from the bottom, across each floor in turn
    rest.sort((p, q) => Math.floor(p.y / (G.fh / 2) + 0.01) - Math.floor(q.y / (G.fh / 2) + 0.01) || p.x - q.x)
    return { done, rest }
  }, [])
  const lotGeo = useMemo(() => {
    const j = G.joint / 2
    const w = windowGeometry(2, 1)
    return {
      full: planarUV(merge([block([j, j, D.panel[0]], [G.pw - j, G.fh - j, D.panel[1]])]), 0.55),
      half: planarUV(merge([block([j, j, D.panel[0]], [G.pw - j, G.fh / 2 - j, D.panel[1]])]), 0.55),
      frames: merge([w.frames, w.infill]),
      glass: w.glass,
    }
  }, [])
  const doneMats = useMemo(() => {
    const c = (x: THREE.Material) => {
      const y = x.clone()
      y.userData = { ...x.userData }
      return y
    }
    return { concrete: c(m.concrete), alu: c(m.alu), glass: c(m.glass) }
  }, [m])

  const blockLines = useMemo(() => buildingLines({ cols: COLS, storeys: STOREYS, depth: DEPTH }), [])
  const crane = useMemo(() => craneLines(MAST_H, HEAD, JIB, COUNTER), [])
  const rig = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 5), 3))
    return g
  }, [])

  useEffect(
    () => () => {
      for (const p of Object.values(parts)) {
        p.solids.forEach((s) => {
          s.geo.dispose()
          s.mat.dispose()
        })
        p.lines.forEach((l) => l.dispose())
      }
      Object.values(lineMats).forEach((l) => l.dispose())
      Object.values(scanMats).forEach((l) => l.dispose())
      Object.values(draw).forEach((x) => x.dispose())
      Object.values(lotGeo).forEach((g) => g.dispose())
      Object.values(doneMats).forEach((x) => x.dispose())
      bay.wall.dispose()
      bay.context.dispose()
      bay.panel.dispose()
      bay.clips.dispose()
      bay.textile.dispose()
      panelMat.dispose()
      blockLines.dispose()
      crane.mast.dispose()
      crane.jib.dispose()
      rig.dispose()
      ink.dispose()
      disposeRainMaterials(m)
    },
    [parts, lineMats, scanMats, draw, lotGeo, doneMats, bay, panelMat, blockLines, crane, rig, ink, m],
  )

  const scans = useRef<Partial<Record<Key, THREE.Group | null>>>({})
  const panel = useRef<THREE.Group>(null)
  const jib = useRef<THREE.Group>(null)
  const hookBlock = useRef<THREE.Mesh>(null)
  const done = useRef<Record<'full' | 'half' | 'frames' | 'glass', THREE.InstancedMesh | null>>({ full: null, half: null, frames: null, glass: null })
  const moving = useRef<Record<'full' | 'half' | 'frames' | 'glass', THREE.InstancedMesh | null>>({ full: null, half: null, frames: null, glass: null })
  const mx = useMemo(() => new THREE.Matrix4(), [])
  const hidden = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), [])

  /** each lot's index among the instances of its kind */
  const slots = useMemo(() => {
    const index = (list: Lot[]) => {
      const n = { full: 0, half: 0, win: 0 }
      return list.map((l) => n[l.kind]++)
    }
    const count = (list: Lot[], kind: Lot['kind']) => list.filter((l) => l.kind === kind).length
    return {
      done: index(lots.done),
      rest: index(lots.rest),
      doneCount: { full: count(lots.done, 'full'), half: count(lots.done, 'half'), win: count(lots.done, 'win') },
      restCount: { full: count(lots.rest, 'full'), half: count(lots.rest, 'half'), win: count(lots.rest, 'win') },
    }
  }, [lots])

  // the floors already clad never move: their places are set once
  useEffect(() => {
    const d = done.current
    lots.done.forEach((l, n) => {
      const i = slots.done[n]
      mx.makeTranslation(l.x, l.y, 0)
      if (l.kind === 'win') {
        d.frames?.setMatrixAt(i, mx)
        d.glass?.setMatrixAt(i, mx)
      } else d[l.kind]?.setMatrixAt(i, mx)
    })
    for (const im of Object.values(d)) {
      if (!im) continue
      im.instanceMatrix.needsUpdate = true
      im.computeBoundingSphere()
    }
  }, [lots, slots, mx])

  useEffect(() => {
    const f = () => invalidate()
    progress.listeners.add(f)
    return () => void progress.listeners.delete(f)
  }, [progress, invalidate])

  useFrame(() => {
    const p = progress.value

    // 1. the bay: each part scanned from drawing to solid
    const reveal: Record<Key, number> = {
      bracket: smooth(INSTALL.bracket[0], INSTALL.bracket[1], p),
      wool: smooth(INSTALL.wool[0], INSTALL.wool[1], p),
      rails: smooth(INSTALL.rails[0], INSTALL.rails[1], p),
      hanger: smooth(INSTALL.hanger[0], INSTALL.hanger[1], p),
    }
    for (const k of Object.keys(parts) as Key[]) {
      const { box } = parts[k]
      const top = box.max.y + 0.002
      const bottom = box.min.y - 0.002
      const c = reveal[k] >= 1 ? -1e3 : reveal[k] <= 0 ? 1e3 : top - (top - bottom) * reveal[k]
      planes[k].solid.constant = -c
      planes[k].line.constant = c
      planes[k].band.constant = c + 0.02
      const scan = scans.current[k]
      if (scan) scan.visible = reveal[k] > 0.001 && reveal[k] < 0.999
    }

    // 2. the crane: drawn in; the hook's path: hoisted off the ground, brought in, lowered, hooked on
    const craneIn = smooth(INSTALL.crane[0], INSTALL.crane[1], p)
    const lc = smooth(INSTALL.lift[0], INSTALL.lift[1], p)
    const up = smooth(0, 0.45, lc)
    const inward = smooth(0.38, 0.8, lc)
    const down = smooth(0.76, 1, lc)
    const hooked = smooth(INSTALL.hook[0], INSTALL.hook[1], p)
    const uy = (-BY + 0.15) * (1 - up) + 1.4 * up - (1.4 - HOOK) * down - HOOK * hooked
    const uz = START_Z * (1 - inward) + 0.5 * inward - 0.5 * down
    if (panel.current) {
      panel.current.position.set(0, uy, uz)
      panel.current.visible = craneIn > 0.003
    }
    // RTARIUM: as it settles the panel is seen through for a moment, to the textile inside it
    const xr = smooth(INSTALL.look[0], INSTALL.look[0] + 0.035, p) * (1 - smooth(INSTALL.look[1] - 0.035, INSTALL.look[1], p))
    panelMat.opacity = 1 - xr * 0.76
    panelMat.depthWrite = panelMat.opacity > 0.97
    draw.textile.opacity = xr * 0.9
    draw.textile.visible = xr > 0.003

    // 3. the block comes in behind, faint and then clear, its clad floors with it; the bay's own drawing gives way to it
    const faint = smooth(INSTALL.block[0], INSTALL.block[0] + 0.04, p)
    const clear = smooth(INSTALL.block[0] + 0.04, INSTALL.block[1], p)
    // (quieter while the camera is in close, so the bay reads; clear once the whole block is seen)
    draw.block.opacity = faint * 0.06 + clear * 0.06 + smooth(INSTALL.wide[0], INSTALL.wide[1], p) * 0.1
    draw.block.visible = draw.block.opacity > 0.003
    draw.context.opacity = 0.3 * (1 - faint)
    draw.context.visible = draw.context.opacity > 0.003
    setOpacity([doneMats.concrete, doneMats.alu, doneMats.glass], clear)

    // 4. as soon as the panel is on, the rest of the façade goes up with the scroll, floor by floor, then the crane goes
    const fill = (p - INSTALL.fill[0]) / (INSTALL.fill[1] - INSTALL.fill[0])
    const each = (1 - RISE) / Math.max(1, lots.rest.length)
    const craneOut = smooth(INSTALL.out[0], INSTALL.out[1], p)
    settle.current = craneOut
    const mv = moving.current
    lots.rest.forEach((l, n) => {
      const e = smooth(0, RISE, fill - n * each)
      const i = slots.rest[n]
      // each hung from above: lowered the last few centimetres into its place
      const m4 = e > 0.003 ? mx.makeTranslation(l.x, l.y + (1 - e) * 0.5, 0) : hidden
      if (l.kind === 'win') {
        mv.frames?.setMatrixAt(i, m4)
        mv.glass?.setMatrixAt(i, m4)
      } else mv[l.kind]?.setMatrixAt(i, m4)
    })
    for (const im of Object.values(mv)) if (im) im.instanceMatrix.needsUpdate = true

    // the crane and its rig
    const cr = craneIn * (1 - craneOut)
    draw.crane.opacity = 0.42 * cr
    draw.crane.visible = cr > 0.003
    draw.rig.opacity = 0.6 * cr * (1 - hooked)
    draw.rig.visible = draw.rig.opacity > 0.003
    const hx = BX + G.pw / 2
    const hz = uz + D.panel[0] + 0.01
    const head = BY + G.fh + uy
    const hookY = head + 2.2
    if (jib.current) jib.current.rotation.y = Math.atan2(-(hz - MAST[1]), hx - MAST[0])
    const yb = MAST_H + 0.4
    const arr = (rig.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    arr.set([
      // the hoist rope, two falls from the trolley to the hook
      hx - 0.12, yb, hz, hx - 0.12, hookY, hz,
      hx + 0.12, yb, hz, hx + 0.12, hookY, hz,
      // two slings from the hook to the lifting anchors cast into the panel's head
      hx, hookY, hz, hx - 0.38, head, hz,
      hx, hookY, hz, hx + 0.38, head, hz,
      // the trolley
      hx - 0.6, yb - 0.1, hz, hx + 0.6, yb - 0.1, hz,
    ])
    rig.getAttribute('position').needsUpdate = true
    if (hookBlock.current) hookBlock.current.position.set(hx, hookY + 0.2, hz)

    if (live.current && !reduced) invalidate()
  }, -2)

  const drawPart = (k: Key) => {
    const part = parts[k]
    return (
      <>
        {part.solids.map((s, i) => (
          <mesh key={i} geometry={s.geo} material={s.mat} castShadow receiveShadow />
        ))}
        {part.lines.map((l, i) => (
          <lineSegments key={`l${i}`} geometry={l} material={lineMats[k]} />
        ))}
        <group ref={(el) => void (scans.current[k] = el)} visible={false}>
          {part.solids.map((s, i) => (
            <mesh key={i} geometry={s.geo} material={scanMats[k]} />
          ))}
        </group>
      </>
    )
  }

  const kinds: ['full' | 'half' | 'frames' | 'glass', THREE.BufferGeometry, keyof typeof doneMats, 'full' | 'half' | 'win'][] = [
    ['full', lotGeo.full, 'concrete', 'full'],
    ['half', lotGeo.half, 'concrete', 'half'],
    ['frames', lotGeo.frames, 'alu', 'win'],
    ['glass', lotGeo.glass, 'glass', 'win'],
  ]
  const liveMat = { concrete: m.concrete, alu: m.alu, glass: m.glass }
  return (
    <group>
      {/* the bay: its wall, the parts fixed to it, the slab edges as a drawing */}
      <mesh geometry={bay.wall} material={m.wall} receiveShadow />
      <FatLines geometry={bay.context} material={draw.context} />
      {drawPart('bracket')}
      {drawPart('wool')}
      {drawPart('rails')}
      {drawPart('hanger')}
      {/* the panel the crane brings, and RTARIUM in it */}
      <group ref={panel} visible={false}>
        <mesh geometry={bay.panel} material={panelMat} castShadow receiveShadow renderOrder={3} />
        <mesh geometry={bay.clips} material={m.darkSteel} />
        <lineSegments geometry={bay.textile} material={draw.textile} renderOrder={2} />
      </group>
      {/* the floors already clad, and the lots that go up */}
      {kinds.map(([key, g, mat, kind]) => (
        <instancedMesh key={`d${key}`} ref={(el) => void (done.current[key] = el)} args={[g, doneMats[mat], Math.max(1, slots.doneCount[kind])]} renderOrder={key === 'glass' ? 2 : 0} frustumCulled={false} />
      ))}
      {kinds.map(([key, g, mat, kind]) => (
        <instancedMesh key={`m${key}`} ref={(el) => void (moving.current[key] = el)} args={[g, liveMat[mat], Math.max(1, slots.restCount[kind])]} renderOrder={key === 'glass' ? 2 : 0} frustumCulled={false} castShadow={key !== 'glass'} />
      ))}
      {/* the block, a drawing */}
      <FatLines geometry={blockLines} material={draw.block} />
      {/* the tower crane, a drawing; its rope and slings in the world */}
      <group position={[MAST[0], 0, MAST[1]]}>
        <FatLines geometry={crane.mast} material={draw.crane} />
        <group ref={jib}>
          <FatLines geometry={crane.jib} material={draw.crane} />
        </group>
      </group>
      <lineSegments geometry={rig} material={draw.rig} frustumCulled={false} />
      <mesh ref={hookBlock} material={draw.rig}>
        <boxGeometry args={[0.4, 0.45, 0.28]} />
      </mesh>
    </group>
  )
}
