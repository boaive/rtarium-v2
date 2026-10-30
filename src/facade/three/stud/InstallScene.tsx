import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { smooth, type Progress } from '../../progress'
import { setOpacity, type Shot } from '../kit'
import { mixShot } from '../ScrubRig'
import { prefersReducedMotion } from '../../../lib/motion'
import { disposeUnitMaterials, planarUV, unitMaterials } from '../unit/parts'
import { craneLines } from '../rain/building'
import { FatLines, fatMaterial } from '../rain/lines'
import { Element, createElementApi } from './Element'
import { BACK, JOINT, LEN, PROFILE, SKIN, bandGeometry, block, merge, offsetPath, type P2 } from './cornice'
import { TOWER, TOWER_H, TOWER_W, bandY, bayLines, elementX, finishGeometry, ringGeometry, scanLines, towerLines } from './tower'

/**
 * On site (Stud Frame page): the Rainscreen page's wall to skin, the same choreography, on the page's
 * warm white. One bay of the tower's front, its wall solid, the rest a drawing (X-ray); each part is
 * made solid by a scan as it is fixed:
 *
 *   1  the bay: the two L frames on the wall, each with its levelling bolt (the element before it in
 *      the band is already up)
 *   2  standing back: the tower crane, an X-ray, lifts the element off the ground in front by its frame,
 *      brings it in and lowers it onto its L frames, swinging a little as it hangs
 *   3  the angles that lock its top; as it settles it is seen through for a moment, to the RTARIUM inside
 *      it, and the view leans in a little
 *   4  in close on the joint with the element before it: the backing rod, then the sealant, traced
 *   5  the tower comes in behind as a drawing, its lower floors already banded; the rest of the bands go
 *      up by themselves, floor by floor, wrapping right round the ends and the back
 *   6  finished: a scan rises up the tower to its top band, and below it the drawing gives way to the
 *      building itself (slabs, black frames, smoked glass you can see into); the roof (its parapet,
 *      plant and the core's head) and the crane are left a drawing
 *
 * In RTARIUM's own colours, against the drawings' basalt pink: the cladding a bright white concrete,
 * the glass smoked graphite, its frames black, so the white bands stand out on the dark glazing.
 *
 * Everything follows the scroll. Sizes and details show the principle; they are not a product drawing.
 */

/** every drawing: basalt pink; the cladding, a bright white concrete */
const WIRE = '#c0786a'
const CLAD = '#f7f5ef'

/** the bay followed: the fifth element of the fourth floor's band */
const I0 = 4
const J0 = 3
const EX = elementX(I0)
const BY = bandY(J0)
/** the joint sealed: between it and the element before it */
const JX = EX - LEN / 2 - JOINT / 2
const SEATS = [-0.8, 0.8] as const
/** the crane: its mast behind the front, inside the plan, its jib long enough to reach the element where it starts, on the ground in front */
const MAST: [number, number] = [TOWER_W * 0.3, -TOWER.r - 1.5]
const MAST_H = TOWER_H + 4
const HEAD = 4
const JIB = 19
const COUNTER = 6
const START_Z = 9
/** it is lowered to just above its L frames, then set the last few centimetres onto them */
const HOOK = 0.05

/** when each step happens (fractions of the section's run) */
export const INSTALL = {
  seats: [0.03, 0.12],
  block: [0.14, 0.24],
  crane: [0.2, 0.26],
  lift: [0.26, 0.43],
  hook: [0.43, 0.46],
  lock: [0.46, 0.53],
  look: [0.5, 0.6],
  rod: [0.6, 0.63],
  bead: [0.63, 0.72],
  wide: [0.72, 0.78],
  /** the rest of the bands going up, floor by floor, as the page is scrolled on; the crane goes at the end */
  fill: [0.72, 0.85],
  out: [0.84, 0.89],
  /** the drawing replaced by the finished building, floor by floor from the ground */
  finish: [0.86, 0.97],
} as const

/** how long each element takes to settle into its place, as a share of the fill */
const RISE = 0.1

/** the camera, by the run; `settle` (0..1, as the crane goes) is the last move onto the finished tower */
export function installShot(p: number, compact: boolean, settle = 0): Shot {
  // (on a phone the bay is pulled further back than the Rainscreen's: it is long and low)
  const k = compact ? 0.95 : 1
  const kw = compact ? 0.62 : 1
  const cx = EX
  const cy = BY + 0.25
  const a = smooth(0, INSTALL.block[0], p)
  // the bay small on the page, with room round it (the Rainscreen wall to skin's spacing)
  const near: Shot = { target: [cx - (compact ? 0.9 : 1.5), cy - 0.15, 0.25], dist: (11 + a * 1) * k, azim: -40 + a * 10, elev: 13 - a * 4, frame: [0.5, 0.47] }
  const lift: Shot = { target: [cx + 1, BY * 0.86, 3.5], dist: 62 * kw, azim: -36, elev: 7, frame: [0.5, 0.47] }
  // back at the bay as it is set, a little closer while RTARIUM shows
  const back: Shot = { target: [cx, cy + 0.3, 0.2], dist: 14 * k, azim: -28, elev: 15, frame: [0.5, 0.48] }
  const lean = smooth(INSTALL.look[0], INSTALL.look[0] + 0.03, p) * (1 - smooth(INSTALL.look[1] - 0.03, INSTALL.look[1], p))
  const look: Shot = { ...back, dist: back.dist * 0.86, azim: -27 }
  // in close on the joint while it is sealed, and back
  const seal: Shot = { target: [JX + 0.2, BY + 0.26, 0.4], dist: 8.5 * k, azim: -24, elev: 8, frame: [0.5, 0.48] }
  const sealing = smooth(INSTALL.rod[0] - 0.03, INSTALL.rod[0] + 0.005, p) * (1 - smooth(INSTALL.bead[1], INSTALL.wide[0] + 0.02, p))
  const wide: Shot = { target: [TOWER_W * 0.5, (MAST_H + HEAD) * 0.5, -4], dist: 118 * kw, azim: -28, elev: 9, frame: [0.5, 0.52] }
  const done: Shot = { target: [TOWER_W * 0.5, TOWER_H * 0.5, -4], dist: 100 * kw, azim: -30, elev: 9, frame: [0.5, 0.5] }
  // finished: round a little, so the bands are seen wrapping the end
  const fin: Shot = { target: [TOWER_W * 0.55, TOWER_H * 0.52, -TOWER.r], dist: 108 * kw, azim: -42, elev: 11, frame: [0.5, 0.47] }
  let s = mixShot(near, lift, smooth(INSTALL.crane[0] - 0.02, INSTALL.lift[0] + 0.04, p))
  s = mixShot(s, back, smooth(INSTALL.lift[1] - 0.07, INSTALL.hook[1], p))
  s = mixShot(s, look, lean)
  s = mixShot(s, seal, sealing)
  s = mixShot(s, wide, smooth(INSTALL.wide[0], INSTALL.wide[1], p))
  s = mixShot(s, done, settle)
  return mixShot(s, fin, smooth(INSTALL.finish[0], INSTALL.finish[1], p))
}

/** a part as two things: its solid self and its drawing, the scan between them */
interface Part {
  solids: { geo: THREE.BufferGeometry; mat: THREE.Material }[]
  lines: THREE.EdgesGeometry[]
  box: THREE.Box3
}

export const INSTALL_FOCUS: [number, number, number] = [TOWER_W / 2, TOWER_H / 2, -TOWER.r]
export const INSTALL_REACH = Math.max(TOWER_W, TOWER_H) * 0.75

/** the joint's profile, as a path for the backing rod and the sealant */
function jointPath(d: number) {
  const pts = offsetPath(PROFILE, d).map(([u, v]: P2) => new THREE.Vector3(JX, BY + v, BACK + u))
  const path = new THREE.CurvePath<THREE.Vector3>()
  for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]))
  return path
}

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
  useEffect(() => {
    const f = () => invalidate()
    progress.listeners.add(f)
    return () => void progress.listeners.delete(f)
  }, [progress, invalidate])

  const api = useMemo(createElementApi, [])
  const m = useMemo(() => {
    const u = unitMaterials()
    return {
      u,
      wall: new THREE.MeshStandardMaterial({ color: '#c9c4ba', roughness: 0.95 }),
      steel: new THREE.MeshStandardMaterial({ color: '#5d6268', metalness: 0.62, roughness: 0.42 }),
      done: u.concrete.clone(),
      sealant: new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.32 }),
      rod: new THREE.MeshStandardMaterial({ color: '#efede6', roughness: 1 }),
      // the finished building: its slabs, its frames, its glass, smoked but see-through so the bands read against it
      slab: new THREE.MeshStandardMaterial({ color: '#8d8b86', roughness: 0.9, transparent: true }),
      frame: new THREE.MeshStandardMaterial({ color: '#080808', metalness: 0.4, roughness: 0.45, transparent: true }),
      glass: new THREE.MeshStandardMaterial({ color: '#2a3035', metalness: 0.6, roughness: 0.08, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }),
    }
  }, [])
  // the cladding a bright white concrete: the elements going up, those already up, the one the crane brings
  useMemo(() => {
    m.u.concrete.color.set(CLAD)
    m.done.color.set(CLAD)
  }, [m])
  useEffect(() => {
    if (!api.mats) return
    api.mats.coat.color.set(CLAD)
    api.mats.backing.color.set(CLAD)
  }, [api])
  /** the scan that rises up the tower as it is finished: below it, the building; above it, still the drawing */
  const sweep = useMemo(() => ({ below: new THREE.Plane(new THREE.Vector3(0, -1, 0), -1e3), above: new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e3) }), [])
  useMemo(() => {
    for (const x of [m.slab, m.frame, m.glass]) x.clippingPlanes = [sweep.below]
  }, [m, sweep])
  const ink = useMemo(() => new THREE.LineBasicMaterial({ color: WIRE, transparent: true, opacity: 0.6 }), [])
  const draw = useMemo(
    () => ({
      block: fatMaterial(WIRE, 1.2, 0),
      scan: fatMaterial('#fdd001', 3, 0),
      context: fatMaterial(WIRE, 1.3, 0.3),
      crane: fatMaterial(WIRE, 1.2, 0),
      rig: new THREE.LineBasicMaterial({ color: WIRE, transparent: true, opacity: 0 }),
    }),
    [],
  )

  // the bay's parts, each scanned from drawing to solid: the L frames with their bolts; the angles that lock the top
  const parts = useMemo(() => {
    const at = (g: THREE.BufferGeometry) => g.translate(EX, BY, 0)
    const make = (list: [THREE.BufferGeometry, THREE.Material][]): Part => {
      const box = new THREE.Box3()
      for (const [g] of list) {
        g.computeBoundingBox()
        box.union(g.boundingBox!)
      }
      return { solids: list.map(([geo, mat]) => ({ geo, mat: mat.clone() })), lines: list.map(([g]) => new THREE.EdgesGeometry(g, 20)), box }
    }
    const seats = merge(SEATS.flatMap((x) => [block([x - 0.06, 0.01, 0], [x + 0.06, 0.02, 0.1]), block([x - 0.06, -0.14, 0], [x + 0.06, 0.02, 0.008])]))
    const bolts = merge(
      SEATS.flatMap((x) => [
        new THREE.CylinderGeometry(0.013, 0.013, 0.008, 6).translate(x, 0.024, 0.055),
        new THREE.CylinderGeometry(0.006, 0.006, 0.07, 10).translate(x, -0.015, 0.055),
        new THREE.CylinderGeometry(0.014, 0.014, 0.01, 6).translate(x, 0.005, 0.055),
      ]),
    )
    const locks = merge(SEATS.flatMap((x) => [block([x - 0.05, 0.5, 0], [x + 0.05, 0.507, 0.086]), block([x - 0.05, 0.468, 0.079], [x + 0.05, 0.507, 0.086]), block([x - 0.05, 0.4, 0], [x + 0.05, 0.507, 0.008])]))
    return {
      seats: make([
        [at(seats), m.steel],
        [at(bolts), m.steel],
      ]),
      locks: make([[at(locks), m.steel]]),
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

  const geo = useMemo(() => {
    const x0 = elementX(I0 - 1) - LEN / 2 - 0.3
    const x1 = EX + LEN / 2 + 0.6
    return {
      // the bay's slab edge (the band covers it), solid from the start; the slabs and the glazing below as a drawing
      wall: block([x0, BY - 0.3, -0.3], [x1, (J0 + 1) * TOWER.fh, -0.01]),
      context: bayLines(x0, x1, J0),
      skin: planarUV(bandGeometry(0, SKIN), 1.1),
      tower: towerLines(),
      scan: scanLines(),
      rod: new THREE.TubeGeometry(jointPath(0.007), 300, 0.005, 8, false),
      bead: new THREE.TubeGeometry(jointPath(-0.003), 300, 0.0068, 10, false),
    }
  }, [])
  const crane = useMemo(() => craneLines(MAST_H, HEAD, JIB, COUNTER), [])
  const finished = useMemo(() => ({ ...finishGeometry(), rings: Array.from({ length: TOWER.storeys }, (_, k) => ringGeometry(k)) }), [])
  useMemo(() => {
    // the drawing stays wherever the building is not yet: above the scan
    draw.block.clippingPlanes = [sweep.above]
    draw.block.clipping = true
  }, [draw, sweep])
  const rig = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 4), 3))
    return g
  }, [])

  // the bands: the element before it, up from the start; the floors below, up when the tower comes in; the rest going up
  const lots = useMemo(() => {
    const done: THREE.Vector3[] = []
    const rest: THREE.Vector3[] = []
    for (let k = 0; k < TOWER.storeys; k++)
      for (let i = 0; i < TOWER.perFloor; i++) {
        if (k === J0 && (i === I0 || i === I0 - 1)) continue
        ;(k < J0 ? done : rest).push(new THREE.Vector3(elementX(i), bandY(k), 0))
      }
    // the rest go up floor by floor from the bottom, across each floor in turn
    rest.sort((p, q) => p.y - q.y || p.x - q.x)
    // each floor's ring round the ends goes up with the middle of its floor's elements
    const ringAt = Array.from({ length: TOWER.storeys }, (_, k) => {
      const mine = rest.map((v, n) => (Math.abs(v.y - bandY(k)) < 1e-3 ? n : -1)).filter((n) => n >= 0)
      return mine.length ? mine[Math.floor(mine.length / 2)] : -1
    })
    return { done, rest, ringAt }
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
      Object.values(geo).forEach((g) => g.dispose())
      crane.mast.dispose()
      crane.jib.dispose()
      finished.slabs.dispose()
      finished.glass.dispose()
      finished.frames.dispose()
      finished.rings.forEach((g) => g.dispose())
      rig.dispose()
      ink.dispose()
      disposeUnitMaterials(m.u)
      for (const x of [m.wall, m.steel, m.done, m.sealant, m.rod, m.slab, m.frame, m.glass]) x.dispose()
    },
    [parts, lineMats, scanMats, draw, geo, crane, rig, ink, m, finished],
  )

  const scans = useRef<Partial<Record<Key, THREE.Group | null>>>({})
  const jib = useRef<THREE.Group>(null)
  const hookBlock = useRef<THREE.Mesh>(null)
  const doneMesh = useRef<THREE.InstancedMesh>(null)
  const moving = useRef<THREE.InstancedMesh>(null)
  const rod = useRef<THREE.Mesh>(null)
  const rings = useRef<(THREE.Mesh | null)[]>([])
  const finishGroup = useRef<THREE.Group>(null)
  const scanLine = useRef<THREE.Group>(null)
  const bead = useRef<THREE.Mesh>(null)
  const mx = useMemo(() => new THREE.Matrix4(), [])
  const hidden = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), [])

  // the floors already banded never move: their places are set once
  useEffect(() => {
    const d = doneMesh.current
    if (!d) return
    lots.done.forEach((v, i) => d.setMatrixAt(i, mx.makeTranslation(v.x, v.y, v.z)))
    d.instanceMatrix.needsUpdate = true
    d.computeBoundingSphere()
  }, [lots, mx])

  useFrame(() => {
    const p = progress.value
    const e = api
    if (!e.root || !e.mats) return

    // 1. the bay: each part scanned from drawing to solid
    const reveal: Record<Key, number> = { seats: smooth(INSTALL.seats[0], INSTALL.seats[1], p), locks: smooth(INSTALL.lock[0], INSTALL.lock[1], p) }
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
    // the locks' drawing shows only once their turn comes
    lineMats.locks.opacity = 0.5 * smooth(INSTALL.lock[0] - 0.03, INSTALL.lock[0], p)

    // 2. the crane: drawn in; the hook's path: hoisted off the ground, brought in, lowered, set on its L frames
    const craneIn = smooth(INSTALL.crane[0], INSTALL.crane[1], p)
    const lc = smooth(INSTALL.lift[0], INSTALL.lift[1], p)
    const up = smooth(0, 0.45, lc)
    const inward = smooth(0.38, 0.8, lc)
    const down = smooth(0.76, 1, lc)
    const hooked = smooth(INSTALL.hook[0], INSTALL.hook[1], p)
    const uy = (-BY + 0.15) * (1 - up) + 1.4 * up - (1.4 - HOOK) * down - HOOK * hooked
    const uz = START_Z * (1 - inward) + 0.5 * inward - 0.5 * down
    e.root.position.set(EX, BY + uy, uz)
    // (it swings a little as it hangs, and is still once it is set)
    const t = performance.now() / 1000
    e.root.rotation.z = reduced ? 0 : 0.03 * Math.sin(t * 1.3) * smooth(0, 0.2, lc) * (1 - hooked)
    e.root.visible = craneIn > 0.003
    // seen through for a moment as it settles, to RTARIUM inside it
    const xr = smooth(INSTALL.look[0], INSTALL.look[0] + 0.03, p) * (1 - smooth(INSTALL.look[1] - 0.03, INSTALL.look[1], p))
    setOpacity([e.mats.coat, e.mats.backing], 1 - xr * 0.76)
    setOpacity([e.mats.roving, e.mats.fibre, e.mats.thread], xr)

    // 3. the tower comes in behind, faint and then clear, its banded floors with it; the bay's own drawing gives way to it
    const faint = smooth(INSTALL.block[0], INSTALL.block[0] + 0.04, p)
    const clear = smooth(INSTALL.block[0] + 0.04, INSTALL.block[1], p)
    draw.block.opacity = faint * 0.12 + clear * 0.12 + smooth(INSTALL.wide[0], INSTALL.wide[1], p) * 0.3
    draw.block.visible = draw.block.opacity > 0.003
    draw.context.opacity = 0.3 * (1 - faint)
    draw.context.visible = draw.context.opacity > 0.003
    setOpacity([m.done], clear)

    // 4. the joint sealed: the backing rod pressed in, then the sealant traced along it, slowly
    const rodF = smooth(INSTALL.rod[0], INSTALL.rod[1], p)
    const beadF = smooth(INSTALL.bead[0], INSTALL.bead[1], p)
    if (rod.current) {
      rod.current.geometry.setDrawRange(0, Math.floor(rodF * 300) * 8 * 6)
      rod.current.visible = rodF > 0.001
    }
    if (bead.current) {
      bead.current.geometry.setDrawRange(0, Math.floor(beadF * 300) * 10 * 6)
      bead.current.visible = beadF > 0.001
    }

    // 5. as soon as the tower is drawn wide, the rest of the bands go up, floor by floor, then the crane goes
    const fill = (p - INSTALL.fill[0]) / (INSTALL.fill[1] - INSTALL.fill[0])
    const each = (1 - RISE) / Math.max(1, lots.rest.length)
    const craneOut = smooth(INSTALL.out[0], INSTALL.out[1], p)
    settle.current = craneOut
    const mv = moving.current
    if (mv) {
      lots.rest.forEach((v, n) => {
        const r = smooth(0, RISE, fill - n * each)
        // each hung from above: lowered the last half metre into its place
        mv.setMatrixAt(n, r > 0.003 ? mx.makeTranslation(v.x, v.y + (1 - r) * 0.5, v.z) : hidden)
      })
      mv.instanceMatrix.needsUpdate = true
    }
    // the rings round the ends and the back: the floors below the bay's with the tower, the rest with their floor's elements
    rings.current.forEach((ring, k) => {
      if (!ring) return
      const n = lots.ringAt[k]
      const r = n < 0 ? clear : smooth(0, RISE, fill - n * each)
      ring.visible = n < 0 ? clear > 0.003 : r > 0.003
      ring.position.y = n < 0 ? 0 : (1 - r) * 0.5
    })

    // 6. finished: the scan rises from the ground to the roof; below it the building, above it the drawing
    const fin = smooth(INSTALL.finish[0], INSTALL.finish[1], p)
    // (it stops at the roof slab: the parapet, the plant and the core's head are left a drawing)
    const y = fin <= 0 ? -1e3 : -0.5 + (TOWER_H + 0.55) * fin
    sweep.below.constant = y
    sweep.above.constant = -y
    if (finishGroup.current) finishGroup.current.visible = fin > 0.001
    draw.scan.opacity = smooth(0, 0.06, fin) * (1 - smooth(0.94, 1, fin))
    draw.scan.visible = draw.scan.opacity > 0.003
    if (scanLine.current) scanLine.current.position.y = y

    // the crane and its rig
    // the crane stays up: the building is not finished yet
    const cr = craneIn
    draw.crane.opacity = 0.42 * cr
    draw.crane.visible = cr > 0.003
    draw.rig.opacity = 0.6 * cr * (1 - hooked)
    draw.rig.visible = draw.rig.opacity > 0.003
    e.root.updateWorldMatrix(true, false)
    const lp = e.root.localToWorld(new THREE.Vector3(0, 0.48, 0.055))
    const hx = lp.x
    const hz = lp.z
    const hookY = lp.y + 1.6
    if (jib.current) jib.current.rotation.y = Math.atan2(-(hz - MAST[1]), hx - MAST[0])
    const yb = MAST_H + 0.4
    const sl = SEATS.map((x) => e.root!.localToWorld(new THREE.Vector3(x, 0.48, 0.055)))
    const arr = (rig.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    arr.set([
      // the hoist rope, two falls from the trolley to the hook
      hx - 0.12, yb, hz, hx - 0.12, hookY, hz,
      hx + 0.12, yb, hz, hx + 0.12, hookY, hz,
      // two slings from the hook to the frame's top chord
      hx, hookY, hz, sl[0].x, sl[0].y, sl[0].z,
      hx, hookY, hz, sl[1].x, sl[1].y, sl[1].z,
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

  return (
    <group>
      {/* the bay: its wall, its fixings, the slab edges as a drawing; the element before it in the band */}
      <mesh geometry={geo.wall} material={m.wall} receiveShadow />
      <FatLines geometry={geo.context} material={draw.context} />
      {drawPart('seats')}
      {drawPart('locks')}
      <mesh geometry={geo.skin} material={m.u.concrete} position={[elementX(I0 - 1), BY, 0]} castShadow receiveShadow />
      {/* the element the crane brings, and RTARIUM in it */}
      <Element api={api} />
      <mesh ref={rod} geometry={geo.rod} material={m.rod} visible={false} />
      <mesh ref={bead} geometry={geo.bead} material={m.sealant} visible={false} castShadow />
      {/* the floors already banded, and the bands that go up */}
      <instancedMesh ref={doneMesh} args={[geo.skin, m.done, Math.max(1, lots.done.length)]} frustumCulled={false} castShadow receiveShadow />
      <instancedMesh ref={moving} args={[geo.skin, m.u.concrete, Math.max(1, lots.rest.length)]} frustumCulled={false} castShadow />
      {/* the rings of the bands round the ends and the back */}
      {finished.rings.map((g, k) => (
        <mesh key={k} ref={(el) => void (rings.current[k] = el)} geometry={g} material={lots.ringAt[k] < 0 ? m.done : m.u.concrete} visible={false} castShadow receiveShadow />
      ))}
      {/* the tower, a drawing, and then the building finished under the scan */}
      <FatLines geometry={geo.tower} material={draw.block} />
      <group ref={finishGroup} visible={false}>
        <mesh geometry={finished.slabs} material={m.slab} castShadow receiveShadow />
        <mesh geometry={finished.frames} material={m.frame} />
        <mesh geometry={finished.glass} material={m.glass} renderOrder={1} />
      </group>
      <group ref={scanLine}>
        <FatLines geometry={geo.scan} material={draw.scan} />
      </group>
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
