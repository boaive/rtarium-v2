import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshInset } from '../MeshInset'
import { ArrowLine } from '../Box'
import { Anchor } from '../Stage3D'
import { PITCH_M, grainTexture, type LabelBus, type Shot } from '../kit'
import { mixShot } from '../ScrubRig'
import { smooth, type Progress } from '../../progress'
import { MeshField, useCell, useYarnMaterial } from '../../../three/mesh/MeshField'
import type { YarnUniforms } from '../../../three/mesh/yarnMaterial'

/**
 * RTARIUM's answers, one scene filling the pinned screen (Unitized page), on yellow. One piece of the
 * textile at one angle, in the middle of the room right of the words and on their line; what happens
 * to it is the panel being made, in order:
 *
 *   0  XYZ strength           three axes drawn out through the textile, one after the other
 *   1  mesh in textile form   a cut piece is set at 90° along its edge and stitched to it (RTARIUM is
 *                             rigid: it is cut and stitched to shape, never bent)
 *   2  easy spray method      the face coat, sprayed under the textile, comes in behind a scan
 *   3  in-built ferrules      inserts are set down into the textile
 *   4  up to 6 m              the textile grows on where it is, cell by cell (woven on, as on the
 *                             homepage), up to a panel 1.25 × 6 m; the concrete follows it up a little
 *                             behind, in one thickness. The camera only stands back as far as the
 *                             growing panel needs, so it never gets smaller on the screen.
 *
 * `t` runs 0..5 with the scroll (answer k over k..k+1). Each answer plays out once its words are in
 * place (from k + 0.15) and is done before they go (by k + 0.78); the camera moves to the next
 * answer's view only while the words change (k + 0.8 .. k + 1). Nothing moves in time.
 */

const SHEET = { nx: 32, ny: 22 }
const SW = SHEET.nx * PITCH_M
const SH = SHEET.ny * PITCH_M
const RET = { nx: 11 }
const RW = RET.nx * PITCH_M
/** the coats either side of the 10 mm textile: 20 mm in all */
const FACE = [-0.01, -0.004] as const
const BACK = [0.004, 0.01] as const
const TALL = { w: 1.25, h: 6 }
const FERRULES: [number, number][] = [
  [0.07, 0.05],
  [0.11, -0.06],
]
const INK = '#080808'
const FLOOR = -SH / 2 - 0.002
/** the panel's bottom right corner: the piece sits in it and the panel grows up and to the left from it */
const CORNER: [number, number] = [SW / 2, -SH / 2]
/** how high the textile is woven on as real cells; above it, where a cell is a few pixels, it is a sheet */
const WOVEN_H = 1.2
const WOVEN_ROWS = Math.round(WOVEN_H / PITCH_M)
const WOVEN_COLS = Math.round(TALL.w / PITCH_M)
/** the weaving front, in cells (the homepage's band) */
const BAND = 3
const TAN = Math.tan((13 * Math.PI) / 180)
/** the axes: how far out from the textile's corner they start, how far in front of it, and their lengths (m) */
const AX = { off: 0.012, front: 0.01, x: SW + 0.05, y: SH + 0.045, z: 0.13 }

/** the panel being grown, by how far the last answer has run (0..1): the textile's width and height, the concrete's height (m) */
export function tallAt(f: number) {
  const w = SW + (TALL.w - SW) * smooth(0.05, 0.42, f)
  const h = SH + (TALL.h - SH) * smooth(0.05, 0.62, f)
  const c = Math.min(h, TALL.h * smooth(0.2, 0.78, f))
  return { w, h, c }
}

/**
 * Where the piece stands on the screen, as fractions of the canvas, measured by the section from its
 * layout: `x`, the middle of the room right of the words, and `y`, the line the words are centred on.
 */
export interface AnswerAxis {
  x: number
  y: number
}

/**
 * How the piece is seen for each of the first four answers: one angle, close, in the same place on
 * the words' line. On a large screen it has the room right of the words to itself and comes a little
 * closer.
 */
function shots(compact: boolean, ax: AnswerAxis): Shot[] {
  // a phone: further off, and held between the title above and the words below
  const c = (s: Shot): Shot => (compact ? { ...s, dist: s.dist * 1.6, frame: [0.5, 0.53] } : { ...s, frame: [ax.x, ax.y] })
  return [
    c({ target: [0.02, 0, 0], dist: compact ? 1.85 : 1.66, azim: 24, elev: 30 }),
    c({ target: [0.07, 0, 0.03], dist: compact ? 1.8 : 1.62, azim: 32, elev: 27 }),
    c({ target: [0.02, 0, 0], dist: compact ? 1.8 : 1.62, azim: 22, elev: 30 }),
    c({ target: [0, 0, 0], dist: compact ? 1.6 : 1.62, azim: 24, elev: 32 }),
  ]
}

/**
 * The camera on the growing panel: framed on it, standing back only as far as it needs to keep the
 * panel inside its share of the screen (its height, and its width between the words and the edge),
 * in the middle of the room right of the words.
 */
function tallShot(f: number, compact: boolean, start: Shot, aspect: number, x: number): Shot {
  const { w, h } = tallAt(f)
  const g = smooth(0, 1, (h - SH) / (TALL.h - SH))
  const fillH = compact ? 0.5 : 0.7
  const fillW = compact ? 0.56 : 0.34
  const need = Math.max(h / fillH, w / (fillW * aspect)) / (2 * TAN)
  return {
    target: [CORNER[0] - w / 2, CORNER[1] + h / 2, 0],
    dist: Math.max(start.dist, need),
    azim: start.azim + 2 * g,
    elev: start.elev + (10 - start.elev) * Math.sqrt(g),
    // on a phone a little to the left, so its dimension line fits beside it
    frame: compact ? [0.44, 0.5] : [x, 0.5],
  }
}

/** the stitch along the 90° joint: a thread zigzagging between the sheet and the cut piece */
function stitchGeometry() {
  const pts: THREE.Vector3[] = []
  const n = 26
  for (let i = 0; i <= n; i++) {
    const y = -SH / 2 + 0.01 + ((SH - 0.02) * i) / n
    pts.push(i % 2 ? new THREE.Vector3(SW / 2 + 0.008, y, 0.016) : new THREE.Vector3(SW / 2 - 0.014, y, 0.007))
  }
  const path = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1)
  return new THREE.TubeGeometry(path, n * 8, 0.0019, 6, false)
}

/**
 * The textile as a sheet, for where its cells are a few pixels across: bronze rovings with their
 * darker edges and the connecting fibres at the crossings, one face offset from the other.
 */
function sheetTexture(offset: number) {
  const n = 64
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  g.clearRect(0, 0, n, n)
  const o = offset * n
  // a roving a quarter of the cell wide, rounded by its shading: from afar it covers the ground as
  // the woven cells do (about two thirds, the two faces together)
  const r = 8
  const roving = (horizontal: boolean) => {
    const grad = horizontal ? g.createLinearGradient(0, o - r, 0, o + r) : g.createLinearGradient(o - r, 0, o + r, 0)
    grad.addColorStop(0, '#45301f')
    grad.addColorStop(0.3, '#6a4b30')
    grad.addColorStop(0.5, '#8c6945')
    grad.addColorStop(0.7, '#6a4b30')
    grad.addColorStop(1, '#45301f')
    g.fillStyle = grad
    for (const k of [-n, 0, n]) {
      if (horizontal) g.fillRect(0, o - r + k, n, 2 * r)
      else g.fillRect(o - r + k, 0, 2 * r, n)
    }
  }
  roving(false)
  roving(true)
  // the connecting fibres where the rovings cross
  g.fillStyle = '#35251a'
  g.beginPath()
  g.arc(o, o, 5.5, 0, Math.PI * 2)
  g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

interface Front {
  /** how far the textile reaches from the corner, across and up (m) */
  uFront: { value: THREE.Vector2 }
  /** below this height the cells are woven ones (m) */
  uFrom: { value: number }
  /** how far the sheet is laid over the woven cells there: none while they are large on the screen, all once they are a few pixels */
  uLow: { value: number }
  /** the weaving front (m) */
  uBandM: { value: number }
}

/**
 * The sheet's material: a cell is there once the front has passed it, fading in across the front,
 * as the woven cells below it do; over the woven part it comes in as the camera stands back, so from
 * afar the panel is one sheet with no join. `vLocal` is the point's distance from the corner, across
 * and up.
 */
function sheetMaterial(map: THREE.Texture, front: Front) {
  const mat = new THREE.MeshStandardMaterial({ map, transparent: true, side: THREE.DoubleSide, roughness: 0.72, depthWrite: false })
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, front)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = vec2(-position.x, position.y);')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLocal;\nuniform vec2 uFront;\nuniform float uFrom;\nuniform float uLow;\nuniform float uBandM;')
      .replace(
        '#include <alphatest_fragment>',
        `{
          vec2 cell = (floor(vLocal / ${PITCH_M.toFixed(4)}) + 0.5) * ${PITCH_M.toFixed(4)};
          float b = clamp(min(uFront.x - cell.x, uFront.y - cell.y) / uBandM, 0.0, 1.0);
          float low = vLocal.y < uFrom ? uLow : 1.0;
          if (b <= 0.0 || low <= 0.001) discard;
          diffuseColor.a *= b * low;
        }
        #include <alphatest_fragment>`,
      )
  }
  return mat
}

/**
 * The textile woven on round the piece, as the homepage weaves its sheet: the real cells of the
 * model, laid out over the panel's lower part (the piece itself left out), drawn only inside a
 * window that grows from the piece (yarnMaterial uWin, centred on the piece). Chunks wholly outside
 * the window are not drawn at all.
 */
function WovenField({ nx, ny, span, win, off }: { nx: number; ny: number; span: readonly [number, number, number, number]; win: { current: YarnUniforms | null }; off: { current: boolean } }) {
  const cell = useCell(10)
  const yarn = useYarnMaterial({ lite: true })
  const invalidate = useThree((s) => s.invalidate)
  const chunks = useRef<THREE.Group | null>(null)
  useEffect(() => {
    const u = yarn.uniforms
    u.uFaceColor.value.set('#a07a55')
    u.uPileColor.value.set('#4a3322')
    u.uAoStrength.value = 0.9
    u.uWin.value.set(nx, ny)
    u.uBand.value = BAND
    u.uLift.value = 0.02
    u.uWeave.value.set(1, 1)
    win.current = u
    invalidate()
    return () => void (win.current = null)
  }, [yarn, nx, ny, win, invalidate])
  const hole = useMemo(() => [0, nx, 0, ny] as const, [nx, ny])
  useFrame(() => {
    const g = chunks.current
    const u = win.current
    if (!g || !u) return
    const hx = u.uWin.value.x / 2 + 1
    const hy = u.uWin.value.y / 2 + 1
    for (const c of g.children) {
      const near = c.userData.near as [number, number] | undefined
      if (near) c.visible = !off.current && near[0] < hx && near[1] < hy
    }
  }, -2)
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <MeshField cell={cell} nx={nx} nz={ny} material={yarn.material} span={span} hole={hole} chunk={10} lodDistance={1} farDistance={2.4} culling groupRef={(g) => void (chunks.current = g)} />
    </group>
  )
}

const WOVEN_SPAN = [SHEET.nx - WOVEN_COLS, SHEET.nx, SHEET.ny - WOVEN_ROWS, SHEET.ny] as const
const WOVEN_SPAN_RET = [0, RET.nx, SHEET.ny - WOVEN_ROWS, SHEET.ny] as const

export function AnswerScene({ t, bus, compact, axis }: { t: Progress; bus: LabelBus; compact: boolean; axis: { current: AnswerAxis } }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])

  // the face coat is revealed across the piece by a scan; the full panel's concrete up its height
  const planes = useMemo(
    () => ({
      face: new THREE.Plane(new THREE.Vector3(-1, 0, 0), -1e3),
      faceBand: new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e3),
      cast: new THREE.Plane(new THREE.Vector3(0, -1, 0), -1e3),
      castBand: new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e3),
    }),
    [],
  )
  const fronts = useMemo(
    () => ({
      main: { uFront: { value: new THREE.Vector2(0, 0) }, uFrom: { value: WOVEN_H }, uLow: { value: 0 }, uBandM: { value: BAND * PITCH_M } },
      ret: { uFront: { value: new THREE.Vector2(9, 0) }, uFrom: { value: WOVEN_H }, uLow: { value: 0 }, uBandM: { value: BAND * PITCH_M } },
    }),
    [],
  )
  const m = useMemo(() => {
    const grain = grainTexture('#dcd6ca', 7000, [168, 228], 1)
    const concrete = (clip: THREE.Plane[]) => new THREE.MeshStandardMaterial({ color: '#dcd6ca', map: grain, roughness: 0.86, clippingPlanes: clip })
    const scan = (clip: THREE.Plane[]) => new THREE.MeshBasicMaterial({ color: INK, toneMapped: false, side: THREE.DoubleSide, clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })
    const texA = sheetTexture(0.25)
    const texB = sheetTexture(0.75)
    for (const tex of [texA, texB]) tex.repeat.set(1 / PITCH_M, 1 / PITCH_M)
    return {
      grain,
      axis: new THREE.MeshBasicMaterial({ color: INK, toneMapped: false, transparent: true }),
      thread: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.6 }),
      face: concrete([planes.face]),
      faceScan: scan([planes.face, planes.faceBand]),
      cast: concrete([planes.cast]),
      castScan: scan([planes.cast, planes.castBand]),
      sheetA: sheetMaterial(texA, fronts.main),
      sheetB: sheetMaterial(texB, fronts.main),
      sheetRet: sheetMaterial(texA, fronts.ret),
      steel: new THREE.MeshStandardMaterial({ color: '#c3c8cd', metalness: 0.55, roughness: 0.36 }),
      dim: new THREE.MeshBasicMaterial({ color: INK, toneMapped: false, transparent: true }),
    }
  }, [planes, fronts])
  const geo = useMemo(
    () => ({
      face: new THREE.BoxGeometry(SW, SH, FACE[1] - FACE[0]).translate(0, 0, (FACE[0] + FACE[1]) / 2),
      stitch: stitchGeometry(),
      ferrule: new THREE.CylinderGeometry(0.014, 0.014, BACK[1] + 0.006, 6).rotateX(Math.PI / 2).translate(0, 0, (BACK[1] - 0.006) / 2),
      // the textile as a sheet over the whole panel, from the corner up and to the left (uv in metres)
      sheet: (() => {
        const g = new THREE.PlaneGeometry(TALL.w, TALL.h).translate(-TALL.w / 2, TALL.h / 2, 0)
        const uv = g.getAttribute('uv') as THREE.BufferAttribute
        const pos = g.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i))
        return g
      })(),
      // and along the return, its depth across
      sheetReturn: (() => {
        const g = new THREE.PlaneGeometry(RW, TALL.h).translate(-RW / 2, TALL.h / 2, 0)
        const uv = g.getAttribute('uv') as THREE.BufferAttribute
        const pos = g.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i))
        return g
      })(),
      // the finished panel at its full size, from the corner, and its return
      tall: new THREE.BoxGeometry(TALL.w, TALL.h, BACK[1] - FACE[0]).translate(-TALL.w / 2, TALL.h / 2, 0),
      tallReturn: new THREE.BoxGeometry(0.02, TALL.h, RW).translate(0, TALL.h / 2, RW / 2),
      tick: new THREE.BoxGeometry(0.22, 0.02, 0.02),
      line: new THREE.BoxGeometry(0.018, 1, 0.018).translate(0, 0.5, 0),
    }),
    [],
  )
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      m.grain.dispose()
      m.sheetA.map?.dispose()
      m.sheetB.map?.dispose()
      for (const [k, v] of Object.entries(m)) if (k !== 'grain') (v as THREE.Material).dispose()
    },
    [geo, m],
  )

  const axes = useRef<(THREE.Group | null)[]>([])
  const axesGroup = useRef<THREE.Group>(null)
  const ret = useRef<THREE.Group>(null)
  const ferrules = useRef<THREE.Group>(null)
  const tall = useRef<THREE.Group>(null)
  const dims = useRef<THREE.Group>(null)
  const dimLine = useRef<THREE.Mesh>(null)
  const dimTop = useRef<THREE.Mesh>(null)
  const dimFoot = useRef<THREE.Mesh>(null)
  const faceScan = useRef<THREE.Mesh>(null)
  const castScan = useRef<THREE.Group>(null)
  const thick = useRef<THREE.Object3D>(null)
  const win = useRef<YarnUniforms | null>(null)
  const winRet = useRef<YarnUniforms | null>(null)
  /** the woven cells are given up to the sheet once it covers them */
  const wovenOff = useRef(false)

  // every step of the track's easing asks for a frame
  useEffect(() => {
    const on = () => invalidate()
    t.listeners.add(on)
    return () => void t.listeners.delete(on)
  }, [t, invalidate])

  useFrame(() => {
    const v = Math.min(4.9999, Math.max(0, t.value))
    const k = Math.floor(v)
    const f = v - k

    // the camera: still while an answer plays out, moving on only while the words change
    const list = shots(compact, axis.current)
    const start = list[3]
    const tallX = axis.current.x
    let shot: Shot
    const aspect = size.width / Math.max(1, size.height)
    if (k < 3) shot = mixShot(list[k], list[k + 1], smooth(0.8, 1, f))
    else if (k === 3) shot = mixShot(list[3], tallShot(0, compact, start, aspect, tallX), smooth(0.8, 1, f))
    else shot = tallShot(f, compact, start, aspect, tallX)
    const A = (shot.azim * Math.PI) / 180
    const E = (shot.elev * Math.PI) / 180
    const [tx, ty, tz] = shot.target
    camera.fov = 26
    camera.near = 0.01
    camera.far = 160
    camera.position.set(tx + shot.dist * Math.cos(E) * Math.sin(A), ty + shot.dist * Math.sin(E), tz + shot.dist * Math.cos(E) * Math.cos(A))
    camera.lookAt(tx, ty, tz)
    const fr = shot.frame ?? [0.5, 0.5]
    camera.setViewOffset(size.width, size.height, -(fr[0] - 0.5) * size.width, -(fr[1] - 0.5) * size.height, size.width, size.height)
    camera.updateProjectionMatrix()

    // 0. the axes drawn out one after the other, gone as the words change
    const a0 = k === 0 ? f : 1
    const out0 = k === 0 ? smooth(0.8, 0.95, f) : 1
    const grow = [smooth(0.15, 0.35, a0), smooth(0.32, 0.52, a0), smooth(0.49, 0.69, a0)]
    m.axis.opacity = 1 - out0
    if (axesGroup.current) axesGroup.current.visible = out0 < 0.999
    axes.current.forEach((g, i) => {
      if (!g) return
      g.visible = grow[i] > 0.002
      g.scale.set(1, Math.max(0.001, grow[i]), 1)
    })
    // 1. the cut piece comes in to the edge, standing at 90°, and is stitched on
    const at1 = v - 1
    const set = smooth(0.15, 0.45, at1)
    if (ret.current) {
      ret.current.visible = set > 0.002
      ret.current.position.x = SW / 2 + (1 - set) * 0.12
    }
    const stitch = smooth(0.45, 0.75, at1)
    const total = geo.stitch.index ? geo.stitch.index.count : 0
    geo.stitch.setDrawRange(0, Math.floor((total * stitch) / 36) * 36)
    // 2. the face coat under the textile, behind a scan running across it
    const fc = smooth(0.18, 0.72, v - 2)
    const fx = fc >= 1 ? 1e3 : fc <= 0 ? -1e3 : -SW / 2 - 0.005 + (SW + 0.01) * fc
    planes.face.constant = fx
    planes.faceBand.constant = -(fx - 0.012)
    if (faceScan.current) faceScan.current.visible = fc > 0.001 && fc < 0.999
    // 3. the ferrules are set down into the textile
    const fe = smooth(0.18, 0.6, v - 3)
    if (ferrules.current) {
      ferrules.current.visible = fe > 0.002
      ferrules.current.position.z = (1 - fe) * 0.09
    }
    // 4. the textile woven on up to its full 1.25 × 6 m, the concrete cast up it a little behind
    const f4 = k === 4 ? f : 0
    const { w, h, c } = tallAt(f4)
    const uw = win.current
    // the window's half-size reaches the front; once the panel is full width, past the last column by the front's own width
    const gw = (w - SW) / (TALL.w - SW)
    if (uw) uw.uWin.value.set(Math.max(SHEET.nx, (2 * (w - SW / 2)) / PITCH_M + 2 * BAND * gw), Math.max(SHEET.ny, (2 * (h - SH / 2)) / PITCH_M))
    const ur = winRet.current
    if (ur) ur.uWin.value.set(RET.nx + 1, Math.max(SHEET.ny, (2 * (h - SH / 2)) / PITCH_M))
    fronts.main.uFront.value.set(w, h)
    fronts.ret.uFront.value.set(9, h)
    // over the woven part, the sheet comes in as their cells get to a few pixels across
    const low = k === 4 ? smooth(2.8, 5.6, shot.dist) : 0
    fronts.main.uLow.value = low
    fronts.ret.uLow.value = low
    wovenOff.current = low > 0.995
    const cy = c >= TALL.h ? 1e3 : c <= 0 ? -1e3 : CORNER[1] + c
    planes.cast.constant = cy
    planes.castBand.constant = -(cy - 0.05)
    if (tall.current) tall.current.visible = c > 0.001
    if (castScan.current) castScan.current.visible = c > 0.001 && c < TALL.h - 0.001
    // its height, dimensioned beside it as it grows: drawn the same weight on the screen however far off the camera is
    const dimOn = smooth(0.04, 0.12, f4)
    const weight = shot.dist / 17
    m.dim.opacity = dimOn
    if (dims.current) {
      dims.current.visible = dimOn > 0.01
      dims.current.position.x = CORNER[0] + 0.03 * shot.dist
    }
    if (dimLine.current) dimLine.current.scale.set(weight, h, weight)
    if (dimTop.current) {
      dimTop.current.position.y = h
      dimTop.current.scale.setScalar(weight)
    }
    if (dimFoot.current) dimFoot.current.scale.setScalar(weight)
    if (thick.current) thick.current.position.y = Math.min(c, TALL.h * 0.62)
  }, -1)

  return (
    <group>
      <group>
        <Suspense fallback={null}>
          <MeshInset nx={SHEET.nx} ny={SHEET.ny} lod={3} shadows />
          <WovenField nx={SHEET.nx} ny={SHEET.ny} span={WOVEN_SPAN} win={win} off={wovenOff} />
        </Suspense>
        {/* the cut piece, standing at 90° along the right edge, and the same return woven on up the panel */}
        <group ref={ret} position={[SW / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]} visible={false}>
          <group position={[RW / 2, 0, 0]}>
            <Suspense fallback={null}>
              <MeshInset nx={RET.nx} ny={SHEET.ny} lod={3} shadows />
              <WovenField nx={RET.nx} ny={SHEET.ny} span={WOVEN_SPAN_RET} win={winRet} off={wovenOff} />
            </Suspense>
          </group>
          <mesh geometry={geo.sheetReturn} material={m.sheetRet} position={[RW, CORNER[1], 0]} />
        </group>
        <mesh geometry={geo.stitch} material={m.thread} />
        <mesh geometry={geo.face} material={m.face} castShadow receiveShadow />
        <mesh ref={faceScan} geometry={geo.face} material={m.faceScan} visible={false} />
        {/* the axes stand just outside the textile, in front of its corner and longer than it, so neither they nor their letters touch it */}
        <group ref={axesGroup} position={[-SW / 2 - AX.off, -SH / 2 - AX.off, AX.front]}>
          <group rotation={[0, 0, -Math.PI / 2]}>
            <group ref={(el) => void (axes.current[0] = el)}>
              <ArrowLine length={AX.x} mat={m.axis} radius={0.0018} />
            </group>
          </group>
          <group ref={(el) => void (axes.current[1] = el)}>
            <ArrowLine length={AX.y} mat={m.axis} radius={0.0018} />
          </group>
          <group rotation={[Math.PI / 2, 0, 0]}>
            <group ref={(el) => void (axes.current[2] = el)}>
              <ArrowLine length={AX.z} mat={m.axis} radius={0.0018} />
            </group>
          </group>
          <Anchor bus={bus} id="a-x" position={[AX.x, 0, 0]} />
          <Anchor bus={bus} id="a-y" position={[0, AX.y, 0]} />
          <Anchor bus={bus} id="a-z" position={[0, 0, AX.z]} />
        </group>
        <group ref={ferrules} visible={false}>
          {FERRULES.map(([x, y], i) => (
            <mesh key={i} geometry={geo.ferrule} material={m.steel} position={[x, y, 0]} castShadow />
          ))}
          <Anchor bus={bus} id="a-ferrule" position={[FERRULES[0][0], FERRULES[0][1], BACK[1]]} />
        </group>
        <Anchor bus={bus} id="a-face" position={[-0.12, -0.06, FACE[0]]} />
        <Anchor bus={bus} id="a-stitch" position={[SW / 2, 0.06, 0.012]} />
      </group>
      {/* the textile as a sheet above the woven part, its two faces a little apart */}
      <group position={[CORNER[0], CORNER[1], 0]}>
        <mesh geometry={geo.sheet} material={m.sheetA} position={[0, 0, -0.004]} />
        <mesh geometry={geo.sheet} material={m.sheetB} position={[0, 0, 0.004]} />
      </group>
      {/* the finished panel, cast up from the bottom behind a scan */}
      <group ref={tall} position={[CORNER[0], CORNER[1], 0]} visible={false}>
        <mesh geometry={geo.tall} material={m.cast} castShadow receiveShadow />
        <mesh geometry={geo.tallReturn} material={m.cast} castShadow receiveShadow />
        <group ref={castScan} visible={false}>
          <mesh geometry={geo.tall} material={m.castScan} />
          <mesh geometry={geo.tallReturn} material={m.castScan} />
        </group>
        <object3D ref={thick}>
          <Anchor bus={bus} id="a-thick" position={[-TALL.w, 0, 0]} />
        </object3D>
      </group>
      {/* its height, dimensioned beside it */}
      <group ref={dims} position={[CORNER[0], CORNER[1], 0]} visible={false}>
        <mesh ref={dimLine} geometry={geo.line} material={m.dim} />
        <mesh ref={dimFoot} geometry={geo.tick} material={m.dim} />
        <mesh ref={dimTop} geometry={geo.tick} material={m.dim} />
      </group>
      <mesh position={[0, FLOOR, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <shadowMaterial color="#4a3000" opacity={0.28} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}
