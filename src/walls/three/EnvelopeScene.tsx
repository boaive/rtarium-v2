import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Anchor, MovingKeyLight } from '../../facade/three/Stage3D'
import type { LabelBus } from '../../facade/three/kit'
import { planarUV } from '../../facade/three/unit/parts'
import { smooth, type Progress } from '../../facade/progress'
import { Lines, sortFrom, split } from '../../flooring/data/three/dc'
import { ink, useDrawing, useInkResolution } from '../../flooring/data/three/draw'
import { Rtarium } from './Panel'
import { disposeWallKit, fade, MM, slab, slabs, useWallTextures, wallKit } from './kit'
import { eyeBoltGeometry, FERRULE_LINES, ferruleGeometry, ferruleTieGeometry, GRP_ALONG, rodGeometry, TIP } from './piece'
import { between, fit, type Box, type Room } from './fit'

/**
 * Built for the envelope (Wall Panels): one wall put up in front of you, on the pinned yellow screen, always inside
 * the room right of the words (every frame is cropped to it, so a close look never spills out of it). The panel is
 * the 30 mm panel of the client's plan: 3.6 × 0.6 m, its RTARIUM zone tapered into a tongue along its top and a
 * groove along its foot, its ferrule inserts 1000 / 1600 / 1000 along it and 100 mm in from each long edge, its tie
 * holes 200 mm from each end and 150 mm in, its 3 mm GRP grid (four rods along at 120 mm, one across every 600 mm).
 * `t` runs 0..6 with the scroll, slide k over k..k+1; the camera holds still within a slide except where the slide
 * itself goes in for a closer look:
 *
 *   0  spanning      the panel stands on end; it grows to 5.8 m beside its dimension, the camera still, so the
 *                    growth is seen; it comes back to 3.6 m and is laid down about its foot, horizontal
 *   1  weld-free,    the concrete round its first ferrules turns to an X-ray; the camera goes in close to the
 *      rust-proof    RTARIUM: water runs over the basalt and nothing rusts; the ferrule inserts are set onto the
 *                    mesh; the camera comes out, the concrete closes, and the ferrules and tie holes are marked
 *   2  bolt-down     two steel columns rise either side of the bay; eye bolts in its upper ferrules, it is lifted,
 *                    carried back between the columns and lowered to their foot; the camera goes in at its end: a
 *                    steel angle is bolted to the column and the panel is bolted to it through its tie holes
 *   3  interlocking  a second panel is lowered onto it, then a third; the camera goes in on a section through the
 *                    wall: the third's groove comes down over the tapered tongue below and is taken into line
 *   4  zoned         the three lower panels swell into 100 mm SIPs (the climate-controlled zone), a steel beam goes
 *                    on over them, and three 30 mm solid panels go up above it (the clear height)
 *   5  space         a 230 mm masonry wall closes in from ours, a rack against it; it draws back, and the rack moves
 *                    up into the floor it gives back
 *
 * Sizes are the client's; the ferrule inserts and eye bolts are drawn a little larger than they are, so they read.
 */

type Rect = [number, number, number, number]
type Trio = [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]

export const SLIDES = 6
const L = 3.6
const H = 0.6
const T = 0.03
const J = 15 * MM
const SPAN = 5.8
/** where the panel stands for the first two slides: in front of the wall line */
const DZ = 1.2
/** the columns: their near flanges 30 mm off the panels' ends, flanges across the wall */
const GAP = 0.03
const COL = { d: 0.2, b: 0.2, tf: 0.01, tw: 0.008, h: 4.15, zc: -0.015 }
const BEAM = { d: 0.2, b: 0.1, tf: 0.009, tw: 0.006 }
/** the SIP: two 15 mm leaves on a 70 mm core, 20 mm proud along its top; the beam sits on the top SIP's core */
const CORE = 0.07
/** the courses' pitch: a 1.5 mm seam between two panels, so a joint shows as a line */
const SEAM = 0.0015
const PITCH = H + SEAM
const BEAM_Y = 2 * PITCH + H + 0.02
const SOLID_Y = BEAM_Y + BEAM.d
const TOP = SOLID_Y + 2 * PITCH + H
/** the X-ray's stretch, round the first ferrule line; where the section is cut for the joint's close look */
const XR: [number, number] = [0.62, 1.38]
const XS = 1.8
const FERRULE_AT: [number, number][] = FERRULE_LINES(L).flatMap((x) => [0.1, 0.5].map((y) => [x, y] as [number, number]))
const TIES: [number, number][] = [0.2, L - 0.2].flatMap((x) => [0.15, 0.45].map((y) => [x, y] as [number, number]))
const LIFT_AT = FERRULE_AT.filter(([, y]) => y > H / 2)
const GRP_ACROSS = [0.6, 1.2, 1.8, 2.4, 3.0]
const EYE = 2.2
/** the ferrule inserts, drawn half as large again in the close look so they read beside the mesh */
const BIG = 1.5
/** the steel angle at each tie hole, 100 mm long: one leg bolted to the column, the other on the panel's face, over the hole */
const BR = { h: 0.1, reach: 0.27, leg: 0.075, t: 0.006 }
/** the tie holes at a panel's near end (its far end's are the same, turned about) */
const TIE_Y = TIES.filter(([x]) => x < L / 2).map(([, y]) => y)
/** the bolts, an M8 drawn a little heavier (×1.25) so it reads close to */
const BOLT = { head: 8 * MM, nut: 8 * MM, shank: 5 * MM, washer: 10 * MM }
/** how far a panel is lowered from: above the room, so it comes in through its top edge */
const DROP = 2.6
/** a 230 mm masonry wall's inner face, measured from ours (its outer face on the SIP's) */
const GHOST = 0.23 - 0.1
const RACK = { x0: 0.45, x1: 3.15, d: 0.8, h: 2.4, gap: 0.16 }
const DEG = Math.PI / 180

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
/** on from a to b, off from c to d */
const span = (p: number, a: number, b: number, c: number, d: number) => smooth(a, b, p) * (1 - smooth(c, d, p))

/** the first panel's length as it grows to 5.8 m and comes back (slide 0), for its dimension's count */
export function spanAt(p: number) {
  const grow = ease(smooth(0.08, 0.4, p))
  const back = ease(smooth(0.52, 0.64, p))
  return L + (SPAN - L) * grow * (1 - back)
}

/** how far the camera is in on a detail (0..1): the room shows its frame while it is */
export function zoomAt(p: number) {
  return Math.max(span(p, 1.14, 1.22, 1.46, 1.54), span(p, 2.62, 2.7, 2.86, 2.94), span(p, 3.42, 3.5, 3.7, 3.78))
}

/* ---- the views: what the camera frames, held through a slide, eased between ------------------------------- */

interface View {
  box: Box
  azim: number
  elev: number
  fill: number
}
const V = {
  stand: { box: [[-0.1, 0, DZ - 0.05], [L + H + 0.75, SPAN + 0.2, DZ + 0.05]], azim: 12, elev: 6, fill: 0.94 },
  panel: { box: [[-0.05, 0, DZ - 0.04], [L + 0.05, H + J + 0.02, DZ + 0.06]], azim: 18, elev: 9, fill: 0.9 },
  mesh: { box: [[0.7, 0.06, DZ - 0.03], [1.3, 0.56, DZ + 0.03]], azim: 30, elev: 20, fill: 1 },
  low: { box: [[-0.3, 0, -0.12], [L + 0.3, 1.45, DZ + 0.12]], azim: 24, elev: 13, fill: 0.92 },
  bolt: { box: [[-0.09, 0.07, -0.04], [0.27, 0.25, 0.09]], azim: 38, elev: 18, fill: 0.96 },
  mid: { box: [[-0.3, 0, -0.12], [L + 0.3, 2.3, 0.3]], azim: 18, elev: 11, fill: 0.92 },
  joint: { box: [[XS - 0.015, 1.14, -0.04], [XS + 0.003, 1.27, 0.012]], azim: 82, elev: 10, fill: 1 },
  full: { box: [[-0.3, 0, -0.14], [L + 0.75, TOP + 0.3, 0.14]], azim: 20, elev: 10, fill: 0.95 },
  space: { box: [[-0.3, 0, -0.14], [L + 0.3, TOP + 0.3, RACK.gap + RACK.d + 0.15]], azim: 30, elev: 22, fill: 0.95 },
} satisfies Record<string, View>

/** the camera's keys over the run: [where, view]; it holds between two keys of one view and eases between two views */
const KEYS: [number, View][] = [
  [0, V.stand],
  [0.86, V.stand],
  [1.06, V.panel],
  [1.14, V.panel],
  [1.22, V.mesh],
  [1.46, V.mesh],
  [1.54, V.panel],
  [1.86, V.panel],
  [2.08, V.low],
  [2.62, V.low],
  [2.7, V.bolt],
  [2.86, V.bolt],
  [2.94, V.low],
  [2.95, V.low],
  [3.1, V.mid],
  [3.42, V.mid],
  [3.5, V.joint],
  [3.7, V.joint],
  [3.78, V.mid],
  [3.86, V.mid],
  [4.08, V.full],
  [4.86, V.full],
  [5.08, V.space],
  [6, V.space],
]

/* ---- the panel ------------------------------------------------------------------------------------------- */

/** the RTARIUM zone from x0 to x1: its section (a tongue tapered 15 → 6 mm along its top, its groove along its foot) run along x */
function zoneBar(x0: number, x1: number) {
  const c = -T / 2
  const h = 0.0075
  const t = TIP / 2
  const s = new THREE.Shape(
    [
      [c - h, 0],
      [c - t, J],
      [c + t, J],
      [c + h, 0],
      [c + h, H],
      [c + t, H + J],
      [c - t, H + J],
      [c - h, H],
    ].map(([a, b]) => new THREE.Vector2(a, b)),
  )
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: false })
  // the shape's x is the panel's depth, its y the panel's height; its run, once turned, goes back along x from x1
  g.rotateY(-Math.PI / 2)
  g.translate(x1, 0, 0)
  return planarUV(g.index ? g.toNonIndexed() : g, 1)
}

/** a stretch of the 30 mm panel from x0 to x1: its inner cover and its zone (15 mm in at the near end, 15 mm proud at the far end), and its outer cover */
function stretch(x0: number, x1: number, outer = true) {
  const inner = [slab(x0, x1, 0, H, -0.0075, 0), zoneBar(x0 <= 0 ? J : x0, x1 >= L ? L + J : x1)]
  return outer ? [...inner, slab(x0, x1, 0, H, -T, -0.0225)] : inner
}

/** a circle of radius r about c, in the plane z = c[2] */
function ring(Ls: Lines, c: [number, number, number], r: number, n = 40) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const b = ((i + 1) / n) * Math.PI * 2
    Ls.seg([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2]], [c[0] + r * Math.cos(b), c[1] + r * Math.sin(b), c[2]])
  }
}

/** a hexagon prism (a bolt head, a nut) `h` long along z, `r` across corners, its back on z = 0 */
function hex(r: number, h: number) {
  const g = new THREE.CylinderGeometry(r, r, h, 6)
  g.rotateX(Math.PI / 2)
  g.rotateZ(Math.PI / 6)
  g.translate(0, 0, h / 2)
  return g
}
function disc(r: number, h: number, n = 20) {
  const g = new THREE.CylinderGeometry(r, r, h, n)
  g.rotateX(Math.PI / 2)
  g.translate(0, 0, h / 2)
  return g
}

/** each lifted panel's own motion: the panel index, when it is lowered, from where, and when it is fixed */
interface Lift {
  /** where it lands (y), and when it comes down (from DROP above) */
  y: number
  down: [number, number]
  /** when its fixings go on: the angle, the column bolts, the tie bolts' tips, the nuts (all at once for the later panels) */
  fix: [number, number]
}
const LIFTS: Lift[] = [
  { y: PITCH, down: [3.13, 3.28], fix: [3.3, 3.37] },
  { y: 2 * PITCH, down: [3.37, 3.66], fix: [3.79, 3.85] },
  { y: SOLID_Y, down: [4.26, 4.33], fix: [4.335, 4.37] },
  { y: SOLID_Y + PITCH, down: [4.35, 4.42], fix: [4.425, 4.46] },
  { y: SOLID_Y + 2 * PITCH, down: [4.44, 4.51], fix: [4.515, 4.55] },
]

/** a panel's fixings, by part, the near end's and the far end's */
interface Fix {
  angle: THREE.Object3D[]
  colBolts: THREE.Object3D[]
  tips: THREE.Object3D[]
  nuts: THREE.Object3D[]
}

/** the fixings' state at p, for a panel fixed over [a, b] (the first panel's are slower, in its close look) */
function fixingsAt(p: number, a: number, b: number) {
  const d = b - a
  return {
    angle: easeOut(smooth(a, a + 0.25 * d, p)),
    colBolts: easeOut(smooth(a + 0.2 * d, a + 0.45 * d, p)),
    tips: easeOut(smooth(a + 0.42 * d, a + 0.65 * d, p)),
    nuts: smooth(a + 0.62 * d, b, p),
  }
}

export function EnvelopeScene({ t, bus, room }: { t: Progress; bus: LabelBus; room: { current: Room } }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    gl.localClippingEnabled = true
    return () => gl.setScissorTest(false)
  }, [gl])
  const tex = useWallTextures()
  /** the columns are made solid by a scan up them */
  const scan = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), -1), [])
  const m = useMemo(() => {
    const k = wallKit(tex)
    // EPS reads white, even on a face in shade (its cut in the section)
    k.core.emissive.set('#45443f')
    const trio = (): Trio => [k.concrete.clone(), k.edge.clone(), k.outer.clone()]
    // the RTARIUM zone's cut, a warmer bronze grey, so a section shows the tongue and groove between the covers
    const tint = (x: Trio): Trio => {
      x[1].color.set('#c9b38f')
      return x
    }
    const catcher = new THREE.ShadowMaterial({ color: '#4a3000', transparent: true, opacity: 0.22, depthWrite: false })
    // the shadow fades out round the bay, so it stays in the room
    catcher.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorld;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
        .replace(
          'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
          `float fx = 1.0 - smoothstep(${(L / 2 + 0.4).toFixed(2)}, ${(L / 2 + 1.3).toFixed(2)}, abs(vWorld.x - ${(L / 2).toFixed(2)}));
          float fz = 1.0 - smoothstep(1.1, 2.0, abs(vWorld.z - 0.6));
          gl_FragColor = vec4( color, opacity * fx * fz * ( 1.0 - getShadowMask() ) );`,
        )
    }
    return {
      ...k,
      conc: [k.concrete, k.edge, k.outer] as Trio,
      catcher,
      xr: trio(),
      cut: trio(),
      zoneSet: tint(trio()),
      zoneCut: tint(trio()),
      boreCut: k.bore.clone(),
      core: k.core,
      steel: new THREE.MeshStandardMaterial({ color: '#4f555c', metalness: 0.6, roughness: 0.42, clippingPlanes: [scan] }),
      yarn: new THREE.MeshStandardMaterial({ color: '#9a744f', roughness: 0.78 }),
      beam: new THREE.MeshStandardMaterial({ color: '#4f555c', metalness: 0.6, roughness: 0.42 }),
      angle: new THREE.MeshStandardMaterial({ color: '#9aa1a8', metalness: 0.7, roughness: 0.36 }),
      water: new THREE.MeshStandardMaterial({ color: '#cfe4f2', metalness: 0.15, roughness: 0.04, transparent: true, opacity: 0, depthWrite: false }),
      ghost: new THREE.MeshStandardMaterial({ color: '#efe9dd', roughness: 1, transparent: true, opacity: 0, depthWrite: false }),
    }
  }, [tex, scan])

  const g = useMemo(() => {
    const joined = (ranges: [number, number][]) => slabs(ranges.flatMap(([a, b]) => stretch(a, b)))
    // the X-ray opens the inner cover and the zone; the outer cover stays, so the mesh is seen against its concrete
    const opened = slabs([...stretch(0, XR[0]), ...stretch(XR[1], L), slab(XR[0], XR[1], 0, H, -T, -0.0225)])
    // a SIP leaf, 15 mm; the core, a unit deep (scaled as it grows), 20 mm in at the near end and the foot
    const leaf = slabs([slab(0, L, 0, H, -0.015, 0)])
    const core = slabs([slab(0.02, L + 0.02, 0.02, H + 0.02, -1, 0)])
    // a column, its near flange's face at x = 0 looking along +x (the other column is this one turned about)
    const zc = COL.zc
    const column = slabs(
      [
        slab(-COL.tf, 0, 0, COL.h, zc - COL.b / 2, zc + COL.b / 2),
        slab(-COL.d, -COL.d + COL.tf, 0, COL.h, zc - COL.b / 2, zc + COL.b / 2),
        slab(-COL.d + COL.tf, -COL.tf, 0, COL.h, zc - COL.tw / 2, zc + COL.tw / 2),
      ],
      'x',
    )
    // the beam between the columns, its foot at y = 0, an end plate at each end
    const beam = slabs(
      [
        slab(-GAP + 0.01, L + GAP - 0.01, 0, BEAM.tf, -0.1, 0),
        slab(-GAP + 0.01, L + GAP - 0.01, BEAM.d - BEAM.tf, BEAM.d, -0.1, 0),
        slab(-GAP + 0.01, L + GAP - 0.01, BEAM.tf, BEAM.d - BEAM.tf, -0.05 - BEAM.tw / 2, -0.05 + BEAM.tw / 2),
        slab(-GAP, -GAP + 0.01, 0, BEAM.d, -0.11, 0.01),
        slab(L + GAP - 0.01, L + GAP, 0, BEAM.d, -0.11, 0.01),
      ],
      'y',
    )
    // a steel angle at a tie hole (centred on it in y), its corner on the column's flange (x = 0 here) and the panel's face
    const angle = slabs([slab(0, BR.t, -BR.h / 2, BR.h / 2, 0, BR.leg), slab(0, GAP + BR.reach, -BR.h / 2, BR.h / 2, 0, BR.t)])
    return {
      first: { body: opened, xr: slabs(stretch(XR[0], XR[1], false)) },
      halves: { near: slabs(stretch(0, XS).filter((_, i) => i !== 1)), nearZone: slabs([zoneBar(J, XS)]), far: slabs(stretch(XS, L).filter((_, i) => i !== 1)), farZone: slabs([zoneBar(XS, L + J)]) },
      whole: joined([[0, L]]),
      leaf,
      core,
      column,
      beam,
      angle,
      head: hex(BOLT.head, 5.5 * MM),
      nut: hex(BOLT.nut, 6.5 * MM),
      washer: disc(BOLT.washer, 1.6 * MM),
      shank: disc(BOLT.shank / 1.25, 1, 12),
      eye: eyeBoltGeometry(),
      ferrule: ferruleGeometry(0.02),
      tie: ferruleTieGeometry(0.02),
      rod: rodGeometry(3.2 * MM),
      mouth: new THREE.CircleGeometry(5 * MM, 18),
      hole: new THREE.CircleGeometry(7 * MM, 18),
      drop: new THREE.SphereGeometry(3 * MM, 12, 10),
      ghost: slab(0, L, 0, TOP, 0, 1),
    }
  }, [])
  useEffect(
    () => () => {
      const geos = (v: unknown): void => {
        if (v instanceof THREE.BufferGeometry) v.dispose()
        else if (v && typeof v === 'object') Object.values(v).forEach(geos)
      }
      geos(g)
      // (the kit's own materials, and every one this scene made: sets included, each once)
      disposeWallKit(m)
    },
    [g, m],
  )

  const mats = useMemo(
    () => ({
      dim: ink(1.3),
      xr: ink(1, '#080808', 0.8),
      rings: ink(1.4),
      sling: [0, 1, 2, 3, 4, 5].map(() => ink(1.3)),
      bracket: ink(1.1),
      ghost: ink(1, '#080808', 0.5),
      floor: ink(1, '#080808', 0.8),
      rack: ink(1, '#080808', 0.7),
    }),
    [],
  )
  useInkResolution(useMemo(() => [mats.dim, mats.xr, mats.rings, ...mats.sling, mats.bracket, mats.ghost, mats.floor, mats.rack], [mats]))

  const lines = useMemo(() => {
    // the dimension beside the panel on end: a line a metre long (stretched at run time), and a tick
    const dimLine = new Lines()
    dimLine.seg([0, 0, 0], [0, 1, 0])
    const tick = new Lines()
    tick.seg([-0.09, 0, 0], [0.09, 0, 0])
    // the X-ray's stretch, outlined; the ferrules ringed and the tie holes squared on the whole panel
    const xr = new Lines()
    xr.rectZ(XR[0], 0, XR[1], H, 0.003)
    const rings = new Lines()
    for (const [x, y] of FERRULE_AT) ring(rings, [x, y, 0.003], 0.045)
    for (const [x, y] of TIES) rings.rectZ(x - 0.04, y - 0.04, x + 0.04, y + 0.04, 0.003)
    // the slings, from each lifting eye bolt to the hook over the panel's middle, and the crane's line up from it
    const apex: [number, number, number] = [L / 2, H + 1.05, 0.1]
    const sling = new Lines()
    for (const [x, y] of LIFT_AT) sling.seg([x, y + 0.02, 0.1], apex)
    sling.box([apex[0] - 0.05, apex[1], apex[2] - 0.03], [apex[0] + 0.05, apex[1] + 0.14, apex[2] + 0.03])
    sling.seg([apex[0], apex[1] + 0.14, apex[2]], [apex[0], apex[1] + 4, apex[2]])
    // the two zones bracketed beside the bay
    const bracket = new Lines()
    const bx = L + 0.45
    bracket.seg([bx, 0, 0.02], [bx, 2 * PITCH + H, 0.02])
    bracket.seg([bx, SOLID_Y, 0.02], [bx, TOP, 0.02])
    for (const y of [0, 2 * PITCH + H, SOLID_Y, TOP]) bracket.seg([bx - 0.07, y, 0.02], [bx + 0.07, y, 0.02])
    // the masonry wall's edges and the hatching on its top, in its own depth (0..1, scaled at run time)
    const ghost = new Lines()
    ghost.box([0, 0, 0], [L, TOP, 1])
    for (let x = 0; x + 0.2 <= L; x += 0.14) ghost.seg([x, TOP, 0], [x + 0.2, TOP, 1])
    // the floor it gives back: a strip along the wall
    const floor = new Lines()
    floor.seg([0, 0.002, GHOST], [L, 0.002, GHOST])
    for (let x = 0; x + GHOST <= L; x += 0.08) floor.seg([x, 0.002, 0.004], [x + GHOST, 0.002, GHOST])
    // the rack: three frames, three levels, a pallet load on the lower two
    const rack = new Lines()
    const z0 = RACK.gap
    const z1 = z0 + RACK.d
    const mid = (RACK.x0 + RACK.x1) / 2
    for (const x of [RACK.x0, mid, RACK.x1]) for (const z of [z0, z1]) rack.seg([x, 0, z], [x, RACK.h, z])
    for (const y of [0.15, 1.25, 2.35]) {
      rack.seg([RACK.x0, y, z0], [RACK.x1, y, z0])
      rack.seg([RACK.x0, y, z1], [RACK.x1, y, z1])
      for (const x of [RACK.x0, mid, RACK.x1]) rack.seg([x, y, z0], [x, y, z1])
    }
    for (const y of [0.15, 1.25])
      for (const [a, b] of [
        [RACK.x0 + 0.1, mid - 0.1],
        [mid + 0.1, RACK.x1 - 0.1],
      ])
        rack.box([a, y + 0.05, z0 + 0.05], [b, y + 0.95, z1 - 0.05])
    return {
      dimLine,
      tick,
      xr,
      rings: sortFrom(rings, [0, 0, 0]),
      sling: split(sling, 0.25),
      bracket: sortFrom(split(bracket, 0.15), [bx, 0, 0]),
      ghost: split(ghost, 0.15),
      floor: sortFrom(floor, [0, 0, 0]),
      rack: sortFrom(rack, [RACK.x0, 0, z0]),
    }
  }, [])
  const dimLine = useDrawing(lines.dimLine, mats.dim)
  const dimFoot = useDrawing(lines.tick, mats.dim)
  const dimTop = useDrawing(lines.tick, mats.dim)
  const xrD = useDrawing(lines.xr, mats.xr)
  const ringsD = useDrawing(lines.rings, mats.rings)
  const slings = [
    useDrawing(lines.sling, mats.sling[0]),
    useDrawing(lines.sling, mats.sling[1]),
    useDrawing(lines.sling, mats.sling[2]),
    useDrawing(lines.sling, mats.sling[3]),
    useDrawing(lines.sling, mats.sling[4]),
    useDrawing(lines.sling, mats.sling[5]),
  ]
  const bracket = useDrawing(lines.bracket, mats.bracket)
  const ghostD = useDrawing(lines.ghost, mats.ghost)
  const floor = useDrawing(lines.floor, mats.floor)
  const rack = useDrawing(lines.rack, mats.rack)

  // the first panel: placed at its foot's corner, turned about it, grown along its length
  const place = useRef<THREE.Group>(null)
  const turn = useRef<THREE.Group>(null)
  const grow = useRef<THREE.Group>(null)
  const firstBores = useRef<THREE.Group>(null)
  const insideXR = useRef<THREE.Group>(null)
  const ferrules = useRef<THREE.Group>(null)
  const drops = useRef<THREE.InstancedMesh>(null)
  const dims = useRef<THREE.Group>(null)
  const dimLen = useRef<THREE.Group>(null)
  const dimHead = useRef<THREE.Group>(null)
  /** the lifted panels (the second, the third, the three solid ones above the beam), and the SIPs they become */
  const lifted = useRef<(THREE.Group | null)[]>([])
  const thirties = useRef<THREE.Group>(null)
  const sips = useRef<(THREE.Group | null)[]>([])
  const outerLeaves = useRef<(THREE.Group | null)[]>([])
  const cores = useRef<(THREE.Group | null)[]>([])
  /** each panel's eye bolts, and its fixings at both ends (the angle, the column bolts, the tie bolts and their nuts) */
  const eyes = useRef<(THREE.Group | null)[]>([])
  const fixings = useRef<Fix[]>([])
  const fixRef = (k: number, part: keyof Fix, end: number) => (el: THREE.Object3D | null) => {
    if (el) (fixings.current[k] ??= { angle: [], colBolts: [], tips: [], nuts: [] })[part][end] = el
  }
  const columns = useRef<THREE.Group>(null)
  const beamG = useRef<THREE.Group>(null)
  const ghost = useRef<THREE.Mesh>(null)
  const ghostL = useRef<THREE.Group>(null)
  const rackG = useRef<THREE.Group>(null)

  /** the water running down the mesh: where each drop starts across the stretch, how fast it runs */
  const drip = useMemo(() => Array.from({ length: 40 }, (_, i) => ({ x: XR[0] + 0.03 + ((i * 0.6180339) % 1) * (XR[1] - XR[0] - 0.06), speed: 0.05 + ((i * 0.37) % 1) * 0.05, at: (i * 0.731) % 1 })), [])
  const mx = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const v3 = useMemo(() => new THREE.Vector3(), [])
  const s3 = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const on = () => invalidate()
    t.listeners.add(on)
    return () => void t.listeners.delete(on)
  }, [t, invalidate])

  useFrame(() => {
    const p = Math.min(SLIDES - 1e-4, Math.max(0, t.value))

    // the camera: held through a slide's keys, eased between two views
    const aspect = size.width / Math.max(1, size.height)
    let i = 0
    while (i < KEYS.length - 2 && p >= KEYS[i + 1][0]) i++
    const [p0, a] = KEYS[i]
    const [p1, b] = KEYS[i + 1]
    const shotOf = (v: View) => fit(v.box, v.azim, v.elev, room.current, aspect, v.fill)
    const shot = a === b ? shotOf(a) : between(shotOf(a), shotOf(b), ease(clamp01((p - p0) / Math.max(1e-4, p1 - p0))))
    const A = shot.azim * DEG
    const E = shot.elev * DEG
    const [tx, ty, tz] = shot.target
    camera.fov = 26
    camera.near = Math.max(0.01, shot.dist * 0.02)
    camera.far = shot.dist * 6 + 40
    camera.position.set(tx + shot.dist * Math.cos(E) * Math.sin(A), ty + shot.dist * Math.sin(E), tz + shot.dist * Math.cos(E) * Math.cos(A))
    camera.lookAt(tx, ty, tz)
    const fr = shot.frame ?? [0.5, 0.5]
    camera.setViewOffset(size.width, size.height, -(fr[0] - 0.5) * size.width, -(fr[1] - 0.5) * size.height, size.width, size.height)
    camera.updateProjectionMatrix()
    // nothing is drawn outside the room: a close look is cropped to it, never spills over the words or the bar
    const r = room.current
    const pad = 6
    gl.setScissorTest(true)
    gl.setScissor(r.x * size.width - pad, (1 - r.y - r.h) * size.height - pad, r.w * size.width + 2 * pad, r.h * size.height + 2 * pad)

    // 0: on end, grown to 5.8 m and back, laid down about its foot
    const len = spanAt(p)
    const lay = ease(smooth(0.66, 0.84, p))
    // 2: lifted from where it was laid, carried back between the columns, lowered to their foot
    const up = ease(smooth(2.33, 2.4, p)) * (1 - ease(smooth(2.48, 2.56, p)))
    const back = ease(smooth(2.4, 2.48, p))
    if (place.current) place.current.position.set(L, 0.75 * up, DZ * (1 - back))
    if (turn.current) turn.current.rotation.z = (-Math.PI / 2) * (1 - lay)
    if (grow.current) grow.current.scale.x = len / L
    const dimOn = span(p, 0.04, 0.1, 0.6, 0.66)
    fade(mats.dim, dimOn)
    if (dims.current) dims.current.visible = dimOn > 0.004
    if (dimLen.current) dimLen.current.scale.y = len
    if (dimHead.current) dimHead.current.position.y = len

    // 1: the X-ray; the close look; water down the basalt; the ferrules set onto the mesh; out, closed, marked
    const xr = span(p, 1.08, 1.14, 1.52, 1.58)
    for (const x of m.xr) fade(x, 1 - 0.9 * xr)
    fade(mats.xr, 0.8 * xr)
    if (insideXR.current) insideXR.current.visible = xr > 0.01
    if (firstBores.current) firstBores.current.visible = len < L + 1e-3 && xr < 0.02 && p < 3.88
    if (ferrules.current) {
      const set = easeOut(smooth(1.34, 1.44, p))
      ferrules.current.visible = p > 1.33 && xr > 0.01
      ferrules.current.position.z = 0.09 * (1 - set)
    }
    const wet = span(p, 1.22, 1.26, 1.34, 1.38)
    m.water.opacity = 0.92 * wet
    m.water.visible = wet > 0.004
    const dr = drops.current
    if (dr) {
      dr.visible = wet > 0.004
      if (wet > 0.004) {
        const now = performance.now() / 1000
        drip.forEach((d, k) => {
          const run = H + J + 0.04
          const y = H + J + 0.02 - ((now * d.speed + d.at * run) % run)
          v3.set(d.x, y, -0.0075 + 0.0035)
          s3.set(1, 1.7, 0.6)
          mx.compose(v3, q, s3)
          dr.setMatrixAt(k, mx)
        })
        dr.instanceMatrix.needsUpdate = true
        // the water runs in time while it is shown
        invalidate()
      }
    }
    // (the holes are drawn once the panel is whole again, and held until the words go: time to look at them)
    ringsD.show(smooth(1.58, 1.64, p))
    fade(mats.rings, span(p, 1.58, 1.6, 1.9, 1.97))

    // 2: the columns rise; eye bolts in its upper ferrules, the slings; the lift; the close look at its fixings
    const st = smooth(2.1, 2.26, p)
    scan.constant = st >= 1 ? 1e3 : -0.05 + (COL.h + 0.1) * st
    if (columns.current) columns.current.visible = st > 0.002
    // [the eye bolts going in, coming out] for the first panel and each lifted one
    const eyeAt: [number, number][] = [[smooth(2.24, 2.3, p), smooth(2.58, 2.62, p)], ...LIFTS.map((l) => [smooth(l.down[0] - 0.04, l.down[0] - 0.01, p), smooth(l.down[1] + 0.01, l.down[1] + 0.04, p)] as [number, number])]
    eyes.current.forEach((e, k) => {
      if (!e) return
      const [on, off] = eyeAt[k]
      e.visible = on > 0.01 && off < 0.99
      e.children.forEach((c) => {
        c.position.z = 0.08 * (1 - on)
        c.rotation.z = (1 - on) * Math.PI * 3 - off * Math.PI * 2
        c.scale.setScalar(EYE * Math.max(1e-3, 1 - off))
      })
    })
    const slingAt: [number, number][] = [[smooth(2.29, 2.33, p), smooth(2.56, 2.59, p)], ...LIFTS.map((l) => [smooth(l.down[0] - 0.02, l.down[0], p), smooth(l.down[1], l.down[1] + 0.02, p)] as [number, number])]
    slings.forEach((s, k) => {
      s.show(slingAt[k][0])
      fade(mats.sling[k], 1 - slingAt[k][1])
    })
    // the fixings: the first panel's in its close look, every later one's as it lands
    const fixAt: [number, number][] = [[2.68, 2.86], ...LIFTS.map((l) => l.fix)]
    fixings.current.forEach((f, k) => {
      if (!f) return
      const s = fixingsAt(p, fixAt[k][0], fixAt[k][1])
      for (const o of f.angle) {
        o.visible = s.angle > 0.01
        o.position.z = 0.16 * (1 - s.angle)
      }
      // the column bolts go in along x, turning; the tie bolts' shanks come through from behind; the nuts run on
      for (const o of f.colBolts) {
        o.visible = s.colBolts > 0.01
        o.children.forEach((c) => {
          c.position.x = BR.t + 0.05 * (1 - s.colBolts)
          c.rotation.x = (1 - s.colBolts) * Math.PI * 4
        })
      }
      for (const o of f.tips) {
        o.visible = s.tips > 0.01
        o.position.z = -0.06 * (1 - s.tips)
      }
      for (const o of f.nuts) {
        o.visible = s.nuts > 0.01
        o.children.forEach((c) => {
          c.position.z = BR.t + 0.05 * (1 - ease(smooth(0, 0.55, s.nuts)))
          c.rotation.z = (1 - s.nuts) * Math.PI * 4
        })
      }
    })

    // a cut panel's far end has nothing to fix: the second's and third's far fixings go with their far halves (slide 3)
    const farCut = span(p, 3.42, 3.48, 3.72, 3.78)
    fixings.current.forEach((f, k) => {
      if (f && (k === 1 || k === 2) && farCut > 0.5) for (const part of [f.angle, f.colBolts, f.tips, f.nuts]) if (part[1]) part[1].visible = false
    })

    // 3 and 4: the lifted panels come down; the third is taken into line by the taper as it seats
    LIFTS.forEach((l, k) => {
      const el = lifted.current[k]
      if (!el) return
      let y: number
      let dz = 0
      if (k === 1) {
        // the third: down to just above its seat, then slowly home during the close look, out of line by 4 mm until the taper takes it
        const near = 0.08
        const fast = ease(smooth(l.down[0], 3.48, p))
        const home = ease(smooth(3.5, l.down[1], p))
        y = l.y + near + DROP * (1 - fast) - near * home
        const left = Math.max(0, y - l.y)
        dz = 0.004 * clamp01(left / J)
      } else y = l.y + DROP * (1 - ease(smooth(l.down[0], l.down[1], p)))
      // (the second and third become SIPs in slide 4, drawn on their own)
      el.visible = p > l.down[0] - 0.003 && (k > 1 || p < 3.88)
      el.position.set(0, y, dz)
    })
    // the section's far halves give way while the camera is in on the joint
    const cut = span(p, 3.42, 3.48, 3.72, 3.78)
    for (const x of [...m.cut, ...m.zoneCut, m.boreCut]) fade(x, 1 - cut)

    // 4: the lower three are the 100 mm SIPs of the climate-controlled zone (they become so while the camera moves on, not
    // shown: owner); the beam goes on; the solid panels above it; then the two zones are marked
    const swell = ease(smooth(3.88, 3.98, p))
    const sipOn = p > 3.88
    if (thirties.current) thirties.current.visible = !sipOn
    sips.current.forEach((s) => s && (s.visible = sipOn))
    outerLeaves.current.forEach((o) => o?.position.set(0, 0, -(CORE * swell)))
    cores.current.forEach((c) => {
      if (!c) return
      c.visible = swell > 0.002
      c.position.z = -0.015
      c.scale.z = Math.max(1e-4, CORE * swell)
    })
    const beamDown = ease(smooth(4.1, 4.22, p))
    if (beamG.current) {
      beamG.current.visible = p > 4.09
      beamG.current.position.y = BEAM_Y + DROP * (1 - beamDown)
    }
    bracket.show(smooth(4.58, 4.66, p))
    fade(mats.bracket, span(p, 4.58, 4.6, 4.9, 4.97))

    // 5: a masonry wall closes in from ours, a rack against it; it draws back, and the rack moves up into the floor
    const close = ease(smooth(5.12, 5.3, p))
    const open = ease(smooth(5.46, 5.62, p))
    const thick = close * (1 - open)
    const seen = smooth(5.1, 5.16, p)
    if (ghost.current) {
      ghost.current.visible = thick > 0.002 && seen > 0.002
      ghost.current.scale.z = Math.max(1e-3, GHOST * thick)
    }
    fade(m.ghost, 0.4 * seen * smooth(0, 0.2, thick))
    m.ghost.depthWrite = false
    if (ghostL.current) {
      ghostL.current.visible = thick > 0.002 && seen > 0.002
      ghostL.current.scale.z = Math.max(1e-3, GHOST * thick)
    }
    fade(mats.ghost, 0.55 * seen)
    rack.show(smooth(5.2, 5.34, p))
    fade(mats.rack, 0.75 * seen)
    if (rackG.current) rackG.current.position.z = GHOST * (1 - ease(smooth(5.5, 5.68, p)))
    floor.show(smooth(5.58, 5.72, p))
    fade(mats.floor, 0.85 * seen)
  }, -1)

  /** a set of instances, each a translation */
  const placeAt = (list: [number, number][], z: number) => (el: THREE.InstancedMesh | null) => {
    if (!el) return
    const mm = new THREE.Matrix4()
    list.forEach(([x, y], k) => el.setMatrixAt(k, mm.makeTranslation(x, y, z)))
    el.instanceMatrix.needsUpdate = true
    el.computeBoundingSphere()
  }
  /** the ferrule mouths and the tie holes in a panel's inner face; those beyond the section in `far`, which can fade with it */
  const bores = (far: THREE.Material = m.bore) => {
    const z = 0.0004
    const near = (l: [number, number][]) => l.filter(([x]) => x < XS)
    const out = (l: [number, number][]) => l.filter(([x]) => x >= XS)
    return (
      <>
        <instancedMesh args={[g.mouth, m.bore, near(FERRULE_AT).length]} ref={placeAt(near(FERRULE_AT), z)} />
        <instancedMesh args={[g.hole, m.bore, near(TIES).length]} ref={placeAt(near(TIES), z)} />
        <instancedMesh args={[g.mouth, far, out(FERRULE_AT).length]} ref={placeAt(out(FERRULE_AT), z)} />
        <instancedMesh args={[g.hole, far, out(TIES).length]} ref={placeAt(out(TIES), z)} />
      </>
    )
  }
  /** a panel's lifting eye bolts, in its upper ferrules (hidden until it is lifted) */
  const eyeBolts = (k: number) => (
    <group ref={(el) => void (eyes.current[k] = el)} visible={false}>
      {LIFT_AT.map(([x, y]) => (
        <group key={x} position={[x, y, 0]}>
          <mesh geometry={g.eye} material={m.zinc} castShadow />
        </group>
      ))}
    </group>
  )
  /** the GRP grid where the X-ray shows it: rods along at 120 mm, one across every 600 mm */
  const grp = ([x0, x1, y0, y1]: Rect) => (
    <>
      {GRP_ALONG.filter((y) => y > y0 && y < y1).map((y) => (
        <mesh key={`a${y}`} geometry={g.rod} material={m.grp} position={[x0, y, -T / 2]} rotation={[0, 0, -Math.PI / 2]} scale={[1, x1 - x0, 1]} />
      ))}
      {GRP_ACROSS.filter((x) => x > x0 && x < x1).map((x) => (
        <mesh key={`c${x}`} geometry={g.rod} material={m.grp} position={[x, Math.max(y0, J), -T / 2]} scale={[1, Math.min(y1, H + J) - Math.max(y0, J), 1]} />
      ))}
    </>
  )
  /**
   * A panel's fixings, at both its ends: the steel angle (one leg on the column's flange, one on the panel's face over
   * its two tie holes), two bolts through it into the column, and a bolt through each tie hole, its washer and nut
   * run on against the angle. The far end's are the near end's, turned about.
   */
  const fixingsOf = (k: number) =>
    [0, 1].map((e) => (
      <group key={e} position={[e ? L + GAP : -GAP, 0, 0]} scale={[e ? -1 : 1, 1, 1]}>
        <group ref={fixRef(k, 'angle', e)} visible={false}>
          {TIE_Y.map((y) => (
            <mesh key={y} geometry={g.angle} material={m.angle} position={[0, y, 0]} castShadow receiveShadow />
          ))}
        </group>
        <group ref={fixRef(k, 'colBolts', e)} visible={false}>
          {TIE_Y.map((y) => (
            <group key={y} position={[BR.t, y, 0.045]} rotation={[0, Math.PI / 2, 0]}>
              <mesh geometry={g.washer} material={m.galv} />
              <mesh geometry={g.head} material={m.galv} position={[0, 0, 1.6 * MM]} />
            </group>
          ))}
        </group>
        {/* the tie bolts: their shanks come through from behind, then the washers and nuts go on */}
        <group ref={fixRef(k, 'tips', e)} visible={false}>
          {TIES.filter(([x]) => x < L / 2).map(([x, y]) => (
            <mesh key={y} geometry={g.shank} material={m.galv} position={[GAP + x, y, -T - 0.004]} scale={[1, 1, T + BR.t + 0.016]} />
          ))}
        </group>
        <group ref={fixRef(k, 'nuts', e)} visible={false}>
          {TIES.filter(([x]) => x < L / 2).map(([x, y]) => (
            <group key={y} position={[GAP + x, y, BR.t]}>
              <mesh geometry={g.washer} material={m.galv} />
              <mesh geometry={g.nut} material={m.galv} position={[0, 0, 1.6 * MM]} castShadow />
            </group>
          ))}
        </group>
      </group>
    ))

  return (
    <group>
      <MovingKeyLight focus={[L / 2, 1.6, 0.4]} reach={4.6} offset={[-4, 8, 9]} />

      {/* ---- the first panel ---- */}
      <group ref={place}>
        <group ref={turn}>
          <group ref={grow}>
            <group position={[-L, 0, 0]}>
              <group ref={thirties}>
                <mesh geometry={g.first.body} material={m.conc} castShadow receiveShadow />
                <mesh geometry={g.first.xr} material={m.xr} castShadow receiveShadow />
              </group>
              <group ref={firstBores}>{bores()}</group>
              <primitive object={xrD.obj} />
              <primitive object={ringsD.obj} />
              {/* inside the X-ray: RTARIUM, its GRP grid, the water on it, and the two ferrule inserts set down onto it */}
              <group ref={insideXR} visible={false}>
                <group position={[(XR[0] + XR[1]) / 2, H / 2 + J / 2, -T / 2]}>
                  <Suspense fallback={null}>
                    <Rtarium t={15} nx={Math.round((XR[1] - XR[0]) / 0.012)} ny={Math.round(H / 0.012)} />
                  </Suspense>
                </group>
                {grp([XR[0], XR[1], 0, H])}
                <instancedMesh ref={drops} args={[g.drop, m.water, drip.length]} frustumCulled={false} visible={false} />
                <group ref={ferrules} visible={false}>
                  {FERRULE_AT.filter(([x]) => x > XR[0] && x < XR[1]).map(([x, y]) => (
                    <group key={`${x}-${y}`} position={[x, y, 0]} scale={[BIG, BIG, 1]}>
                      <mesh geometry={g.ferrule} material={m.zinc} castShadow />
                      <mesh geometry={g.tie} material={m.yarn} />
                    </group>
                  ))}
                </group>
                <Anchor bus={bus} id="e-mesh" position={[0.82, 0.42, -0.008]} />
                <Anchor bus={bus} id="e-ferrule" position={[FERRULE_AT[1][0], FERRULE_AT[1][1] + 0.012, 0.004]} />
              </group>
              {eyeBolts(0)}
              <primitive object={slings[0].obj} />
              <Anchor bus={bus} id="e-ferrules" position={[FERRULE_AT[3][0], FERRULE_AT[3][1] + 0.045, 0.003]} />
              <Anchor bus={bus} id="e-ties" position={[TIES[2][0], TIES[2][1] - 0.04, 0.003]} />
              <Anchor bus={bus} id="e-lift" position={[LIFT_AT[1][0], LIFT_AT[1][1] + 0.05, 0.1]} />
            </group>
          </group>
        </group>
      </group>
      {/* its fixings, where it ends up (the first panel comes to rest at the foot of the bay) */}
      {fixingsOf(0)}
      <Anchor bus={bus} id="e-angle" position={[-GAP + 0.012, TIES[0][1] + 0.03, BR.leg * 0.7]} />
      <Anchor bus={bus} id="e-bolt" position={[TIES[0][0], TIES[0][1], BR.t + 0.009]} />

      {/* the dimension beside the panel on end */}
      <group ref={dims} position={[L + H + 0.32, 0, DZ]} visible={false}>
        <group ref={dimLen}>
          <primitive object={dimLine.obj} />
        </group>
        <primitive object={dimFoot.obj} />
        <group ref={dimHead}>
          <primitive object={dimTop.obj} />
          <Anchor bus={bus} id="e-span" position={[0, 0, 0]} />
        </group>
      </group>

      {/* ---- the panels lowered on: the second and third (each in two halves, for the section), the three solid ones ---- */}
      {LIFTS.map((_, k) => (
        <group key={k} ref={(el) => void (lifted.current[k] = el)} visible={false}>
          {k < 2 ? (
            <>
              <mesh geometry={g.halves.near} material={m.conc} castShadow receiveShadow />
              <mesh geometry={g.halves.nearZone} material={m.zoneSet} castShadow receiveShadow />
              <mesh geometry={g.halves.far} material={m.cut} castShadow receiveShadow />
              <mesh geometry={g.halves.farZone} material={m.zoneCut} castShadow receiveShadow />
            </>
          ) : (
            <mesh geometry={g.whole} material={m.conc} castShadow receiveShadow />
          )}
          {bores(k < 2 ? m.boreCut : m.bore)}
          {eyeBolts(k + 1)}
          <primitive object={slings[k + 1].obj} />
        </group>
      ))}
      {LIFTS.map((l, k) => (
        <group key={`f${k}`} position={[0, l.y, 0]}>
          {fixingsOf(k + 1)}
        </group>
      ))}
      <Anchor bus={bus} id="e-joint" position={[XS, 2 * PITCH + 0.004, -T / 2]} />

      {/* ---- the SIPs the lower three become: an inner leaf, an outer leaf that moves out, the core that grows ---- */}
      {[0, 1, 2].map((k) => (
        <group key={k} ref={(el) => void (sips.current[k] = el)} position={[0, k * PITCH, 0]} visible={false}>
          <mesh geometry={g.leaf} material={m.conc} castShadow receiveShadow />
          <group ref={(el) => void (outerLeaves.current[k] = el)}>
            <mesh geometry={g.leaf} material={m.conc} position={[0, 0, -0.015]} castShadow receiveShadow />
          </group>
          <group ref={(el) => void (cores.current[k] = el)} visible={false}>
            <mesh geometry={g.core} material={m.core} castShadow receiveShadow />
          </group>
          {bores()}
        </group>
      ))}

      {/* ---- the steel: two columns, and the beam ---- */}
      <group ref={columns} visible={false}>
        <mesh geometry={g.column} material={m.steel} position={[-GAP, 0, 0]} castShadow receiveShadow />
        <mesh geometry={g.column} material={m.steel} position={[L + GAP, 0, 0]} scale={[-1, 1, 1]} castShadow receiveShadow />
      </group>
      <group ref={beamG} visible={false}>
        <mesh geometry={g.beam} material={m.beam} castShadow receiveShadow />
        {[-GAP + 0.01, L + GAP - 0.01].flatMap((x) =>
          [0.06, 0.14].map((y) => (
            <mesh key={`${x}-${y}`} geometry={g.head} material={m.galv} position={[x, y, -0.05]} rotation={[0, x < L / 2 ? Math.PI / 2 : -Math.PI / 2, 0]} />
          )),
        )}
        <Anchor bus={bus} id="e-beam" position={[L * 0.62, BEAM.d, 0]} />
      </group>
      <primitive object={bracket.obj} />
      <Anchor bus={bus} id="e-sip" position={[L + 0.45, 1.5 * H, 0.02]} />
      <Anchor bus={bus} id="e-solid" position={[L + 0.45, SOLID_Y + 1.5 * H, 0.02]} />

      {/* ---- the masonry wall, faint, closing in and drawing back; the floor it gives back; the rack ---- */}
      <mesh ref={ghost} geometry={g.ghost} material={m.ghost} visible={false} renderOrder={3} />
      <group ref={ghostL} visible={false}>
        <primitive object={ghostD.obj} />
        <Anchor bus={bus} id="e-ghost" position={[L * 0.7, TOP, 1]} />
      </group>
      <primitive object={floor.obj} />
      <group ref={rackG}>
        <primitive object={rack.obj} />
      </group>
      <Anchor bus={bus} id="e-floor" position={[L * 0.78, 0, GHOST / 2]} />
      <mesh position={[L / 2, 0, 0.6]} rotation={[-Math.PI / 2, 0, 0]} material={m.catcher} receiveShadow>
        <planeGeometry args={[L + 4, 5]} />
      </mesh>
    </group>
  )
}
