import { useEffect, useMemo, useRef, type Ref } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { Shot } from '../kit'
import { mixShot } from '../ScrubRig'
import { smooth } from '../../progress'
import { block, merge, planarUV } from '../unit/parts'
import { buildingLines } from './building'
import { FatLines, fatMaterial } from './lines'
import { bracketGeometry, bracketYs, colX, columnPanels, D, disposeRainMaterials, G, panelsGeometry, railGeometry, railXs, rainMaterials, stripX, wallGeometry, wallWidth, windowGeometry, woolGeometry, type RainMaterials } from './parts'

/**
 * What the barrier's three pages share (Rainscreen page): one piece of an apartment block, its
 * structure drawn in lines on black and its front clad in the pink panels, the rainscreen cut through
 * at its near end; and the weather on it, drawn the way a flow study is drawn, in fine lines (rain,
 * the air in the cavity, the wind). Each page builds its own scene from these (`BarrierScenes`).
 *
 * Everything is cut to a box in the world (`clip`), so a scene keeps to the middle of its black box
 * without a frame: as the view goes in, the piece is cut down to what it frames, like a section model,
 * and ends at its own cut edges rather than at the edge of a window.
 */

export const COLS = 4
export const STOREYS = 3
export const DEPTH = 8
export const W = wallWidth(COLS)
export const H = STOREYS * G.fh
export const NEAR = COLS - 1
export const FACE = D.panel[1]
export const ZM_CAV = (D.wool[1] + D.panel[0]) / 2
export const INK = '#f2f0e9'
/** the near column's outer rail, which rides in its slotted brackets, and the face of those brackets' arms */
export const RAIL_X = railXs(NEAR)[1]
export const ARM_X = RAIL_X + 0.0076

let seed = 29
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

/* ---- the camera --------------------------------------------------------------------------------- */

/** the shot at `t` along a list of keys (t, shot), moving smoothly between them */
export function shotAlong(keys: [number, Shot][], t: number): Shot {
  for (let i = 0; i < keys.length - 1; i++) {
    const [ta, a] = keys[i]
    const [tb, b] = keys[i + 1]
    if (t <= tb) return mixShot(a, b, smooth(ta, tb, t))
  }
  return keys[keys.length - 1][1]
}

/** puts the camera on its orbit (the target in the middle of the canvas) */
export function placeCamera(camera: THREE.PerspectiveCamera, size: { width: number; height: number }, s: Shot, k = 1) {
  const A = (s.azim * Math.PI) / 180
  const E = (s.elev * Math.PI) / 180
  const [tx, ty, tz] = s.target
  const d = s.dist * k
  camera.fov = 26
  camera.near = 0.01
  camera.far = 400
  camera.position.set(tx + d * Math.cos(E) * Math.sin(A), ty + d * Math.sin(E), tz + d * Math.cos(E) * Math.cos(A))
  camera.lookAt(tx, ty, tz)
  camera.setViewOffset(size.width, size.height, 0, 0, size.width, size.height)
  camera.updateProjectionMatrix()
}

/* ---- the cut ---------------------------------------------------------------------------------- */

/** a box in the world: x0, y0, z0, x1, y1, z1 */
export type Box = [number, number, number, number, number, number]

/** the planes of a box, kept by every material of a scene (three.js keeps what is on their positive side) */
export function boxPlanes() {
  const axes = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]
  return axes.map(([x, y, z]) => new THREE.Plane(new THREE.Vector3(x, y, z), 0))
}

export function setBox(planes: THREE.Plane[], b: Box) {
  planes[0].constant = -b[0]
  planes[1].constant = b[3]
  planes[2].constant = -b[1]
  planes[3].constant = b[4]
  planes[4].constant = -b[2]
  planes[5].constant = b[5]
}

/** the whole piece and its weather, as the opening view frames it */
export const ALL: Box = [-0.35, -1.05, -DEPTH - 0.35, W + 0.6, H + 2.65, FACE + 1.3]

/* ---- rain ------------------------------------------------------------------------------------ */

const RAIN_VS = /* glsl */ `
  attribute vec4 aHit;   // where it strikes: x, y, the z it runs at, and its kind (0 face, 1 joint, 2 passes by)
  attribute vec3 aSeed;  // how far in front of the face it starts (0..1), its phase, and which end (0 tail, 1 head)
  #include <clipping_planes_pars_vertex>
  uniform float uTime;
  uniform float uFace;
  uniform float uOpacity;
  uniform float uAmount;
  varying float vA;
  const float VY = 8.0;
  const float WZ = 2.4;
  const float WX = 0.55;
  const float VRUN = 0.95;
  const float RUN = 1.15;
  const float FALL = 1.6;
  void main() {
    float kind = aHit.w;
    float zs = uFace + 0.3 + aSeed.x * 3.4;
    float zt = kind > 0.5 && kind < 1.5 ? uFace : aHit.z;
    float tf = kind > 1.5 ? FALL : (zs - zt) / WZ;
    float life = tf + (kind > 1.5 ? 0.0 : RUN);
    float t = mod(uTime + aSeed.y * life, life);
    float tau = max(t - (aSeed.z > 0.5 ? 0.0 : 0.024), 0.0);
    vec3 p;
    float a;
    if (tau < tf) {
      p = vec3(aHit.x, aHit.y, zt) + vec3(-WX, VY, WZ) * (tf - tau);
      a = smoothstep(0.0, 0.3, tau) * (kind > 1.5 ? 1.0 - smoothstep(tf * 0.7, tf, tau) : 1.0);
    } else {
      // a film down the face from where it struck: its head running on, its tail held back
      float drop = VRUN * max(t - tf, 0.0);
      float y = aSeed.z > 0.5 ? drop : max(0.0, drop - 0.32);
      p = vec3(aHit.x, aHit.y - y, aHit.z);
      a = 0.7 * (1.0 - smoothstep(RUN * 0.5, RUN, t - tf));
    }
    // how much of the rain is falling yet: each streak has its own threshold
    a *= step(fract(aSeed.y * 13.7 + aSeed.x * 3.1), uAmount);
    vA = a * uOpacity;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`
const LINE_FS = /* glsl */ `
  #include <clipping_planes_pars_fragment>
  uniform vec3 uColor;
  varying float vA;
  void main() {
    #include <clipping_planes_fragment>
    gl_FragColor = vec4(uColor, vA);
  }
`

export function rainGeometry(count: number) {
  const hit: number[] = []
  const sd: number[] = []
  const push = (x: number, y: number, z: number, kind: number) => {
    const s = rnd()
    const ph = rnd()
    for (const end of [0, 1]) {
      hit.push(x, y, z, kind)
      sd.push(s, ph, end)
    }
  }
  const inStrip = (x: number) => {
    for (let k = 0; k < COLS - 1; k++) if (x > stripX(k) && x < stripX(k) + G.ww) return true
    return false
  }
  for (let i = 0; i < count; i++) {
    const x = 0.05 + rnd() * (W - 0.1)
    const y = 0.6 + rnd() * (H - 0.8)
    push(x, y, inStrip(x) ? D.window[1] + 0.006 : FACE + 0.004, 0)
  }
  // the odd one finds an open joint of the near column and runs down the back of the panel
  const joints = columnPanels(NEAR, STOREYS).map((r) => r[3]).filter((y) => y < H - 0.1)
  // (most of them by the cut, in front of the outer rail, where the view looks into the cavity)
  for (let i = 0; i < Math.round(count * 0.08); i++) {
    const x = i % 3 ? W - 0.035 - rnd() * 0.15 : colX(NEAR) + 0.08 + rnd() * (G.pw - 0.16)
    push(x, joints[Math.floor(rnd() * joints.length)] - 0.03, D.panel[0] - 0.004, 1)
  }
  // and past the end of the building the rain simply falls
  for (let i = 0; i < Math.round(count * 0.12); i++) push(W + 0.25 + rnd() * 1.6, 0.4 + rnd() * (H - 0.4), 0.6 + rnd() * 2, 2)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((hit.length / 4) * 3), 3))
  g.setAttribute('aHit', new THREE.Float32BufferAttribute(hit, 4))
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 3))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(W / 2, H / 2, 0), 40)
  return g
}

/* ---- streamlines (air in the cavity, wind on the face) --------------------------------------- */

const FLOW_VS = /* glsl */ `
  attribute vec3 aFlow;   // distance along the line, its length, its phase
  #include <clipping_planes_pars_vertex>
  varying vec3 vFlow;
  void main() {
    vFlow = aFlow;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`
const FLOW_FS = /* glsl */ `
  #include <clipping_planes_pars_fragment>
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uGap;
  uniform float uBase;
  uniform float uPulse;
  uniform float uOpacity;
  uniform float uFade;
  varying vec3 vFlow;
  void main() {
    #include <clipping_planes_fragment>
    float s = vFlow.x;
    float f = fract((s - uTime * uSpeed) / uGap + vFlow.z);
    // a trace moving along the line: a sharp head, a long fading tail
    float trace = smoothstep(0.0, 0.9, f) * (1.0 - smoothstep(0.9, 0.93, f));
    float ends = smoothstep(0.0, uFade, s) * (1.0 - smoothstep(vFlow.y - uFade, vFlow.y, s));
    gl_FragColor = vec4(uColor, (uBase + uPulse * trace * trace) * ends * uOpacity);
  }
`

export function flowGeometry(lines: THREE.Vector3[][]) {
  const pos: number[] = []
  const flow: number[] = []
  for (const line of lines) {
    let len = 0
    for (let i = 1; i < line.length; i++) len += line[i].distanceTo(line[i - 1])
    const ph = rnd()
    let s = 0
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]
      const b = line[i]
      const d = a.distanceTo(b)
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z)
      flow.push(s, len, ph, s + d, len, ph)
      s += d
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3))
  g.computeBoundingSphere()
  return g
}

/** air through the near column's cavity: in at the foot, up behind the panels, out at the top */
export function airLines() {
  const lines: THREE.Vector3[][] = []
  const x0 = colX(NEAR) + 0.1
  const x1 = W - 0.1
  for (let i = 0; i < 9; i++) {
    const x = x0 + ((x1 - x0) * (i + rnd() * 0.6)) / 9
    const zc = ZM_CAV + (rnd() - 0.5) * 0.03
    const ph = rnd() * 6
    const pts: THREE.Vector3[] = []
    pts.push(...new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, -0.9, FACE + 0.6), new THREE.Vector3(x, -0.05, FACE + 0.1), new THREE.Vector3(x, 0.35, zc)).getPoints(16))
    for (let y = 0.45; y < H - 0.4; y += 0.12) pts.push(new THREE.Vector3(x, y, zc + 0.01 * Math.sin(y * 2.1 + ph)))
    pts.push(...new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, H - 0.3, zc), new THREE.Vector3(x, H + 0.1, FACE + 0.1), new THREE.Vector3(x, H + 0.9, FACE + 0.7)).getPoints(16))
    lines.push(pts)
  }
  return flowGeometry(lines)
}

/**
 * The wind on the near end of the block, traced through a simple field: a steady wind towards the
 * face that comes right up to the skin before it turns, then runs up it, close against the panels.
 * The near end is a cut through a longer façade, so the wind does not turn round it: each trace stops
 * at the cut (its tail fading out before it), and none passes between the cut and the eye. Traced
 * finely near the skin, where the close view looks.
 */
export function windLines() {
  const c = new THREE.Vector3(W / 2, (H + 0.9) / 2, (-DEPTH + FACE) / 2)
  const half = new THREE.Vector3(W / 2 + 0.3, (H + 0.9) / 2, (DEPTH + FACE) / 2)
  const sdf = (p: THREE.Vector3) => {
    const qx = Math.abs(p.x - c.x) - half.x
    const qy = Math.abs(p.y - c.y) - half.y
    const qz = Math.abs(p.z - c.z) - half.z
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0)
  }
  const U = new THREE.Vector3(0.16, -0.04, -1).normalize()
  /** how far from a surface the wind starts to turn (m) */
  const R = 0.9
  const n = new THREE.Vector3()
  const v = new THREE.Vector3()
  const e = 0.04
  const tmp = new THREE.Vector3()
  const field = (p: THREE.Vector3) => {
    v.copy(U)
    const d = sdf(p)
    if (d < R) {
      n.set(
        sdf(tmp.set(p.x + e, p.y, p.z)) - sdf(tmp.set(p.x - e, p.y, p.z)),
        sdf(tmp.set(p.x, p.y + e, p.z)) - sdf(tmp.set(p.x, p.y - e, p.z)),
        sdf(tmp.set(p.x, p.y, p.z + e)) - sdf(tmp.set(p.x, p.y, p.z - e)),
      ).normalize()
      const k = 1 - THREE.MathUtils.smoothstep(d, 0, R)
      const vn = v.dot(n)
      if (vn < 0) v.addScaledVector(n, -vn * k)
      v.addScaledVector(n, 0.02 * k)
      // and on the skin it is turned up it
      v.y += 0.75 * k
    }
    return v.normalize()
  }
  const lines: THREE.Vector3[][] = []
  const z0 = FACE + 3.2
  for (let i = 0; i < 34; i++) {
    const tx = W - 2.5 + rnd() * 2.38
    const ty = 1.2 + rnd() * (H - 3.2)
    const p = new THREE.Vector3(tx - 0.16 * (z0 - FACE), ty, z0)
    const pts = [p.clone()]
    for (let s = 0; s < 1400; s++) {
      const near = sdf(p) < 1.2
      p.addScaledVector(field(p), near ? 0.025 : 0.1)
      if (p.x > W - 0.02) break
      if (near || s % 3 === 0) pts.push(p.clone())
      if (p.z < -DEPTH - 1 || p.y < 0.2 || p.y > H + 2.4) break
    }
    if (pts.length > 8) lines.push(pts)
  }
  return flowGeometry(lines)
}

/* ---- the near column: panels that flex, a bracket that slides -------------------------------- */

/** the near column's panels, finely divided down their height so each can bow between its ends */
function flexPanels() {
  const parts: THREE.BufferGeometry[] = []
  const [zb, zf] = D.panel
  for (const [a, b, c, d] of columnPanels(NEAR, STOREYS)) {
    const segs = Math.max(4, Math.round((d - b) / 0.12))
    parts.push(new THREE.BoxGeometry(c - a, d - b, zf - zb, 1, segs, 1).translate((a + c) / 2, (b + d) / 2, (zb + zf) / 2))
  }
  const g = planarUV(merge(parts), 0.55)
  // where each point sits along its own panel (0 at its foot, 1 at its head), for the bow
  const spans = columnPanels(NEAR, STOREYS)
  const pos = g.getAttribute('position')
  const along = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const s = spans.find((r) => y >= r[1] - 1e-4 && y <= r[3] + 1e-4) ?? spans[0]
    along[i] = (y - s[1]) / (s[3] - s[1])
  }
  return { g, base: (pos.array as Float32Array).slice(), along }
}

/** the slot in the arm of each bracket up the outer rail, and the bolt that rides in it */
function slotGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (const y of bracketYs(STOREYS)) parts.push(block([ARM_X, y - 0.013, 0.064], [ARM_X + 0.0014, y + 0.013, 0.108]))
  return merge(parts)
}


/* ---- the piece ---------------------------------------------------------------------------------- */

export interface Piece {
  m: RainMaterials
  geo: {
    wall: THREE.BufferGeometry
    wool: THREE.BufferGeometry
    brackets: THREE.BufferGeometry
    pads: THREE.BufferGeometry
    rails: THREE.BufferGeometry
    rail: THREE.BufferGeometry
    hangers: THREE.BufferGeometry
    frames: THREE.BufferGeometry
    infill: THREE.BufferGeometry
    glass: THREE.BufferGeometry
    panels: THREE.BufferGeometry
    flex: THREE.BufferGeometry
    flexEdges: THREE.EdgesGeometry
    slots: THREE.BufferGeometry
    bolts: THREE.BufferGeometry
    block: THREE.BufferGeometry
  }
  flexBase: Float32Array
  flexAlong: Float32Array
  /** the near column's skin (it can be seen through), its outline while it is, the building's lines */
  near: THREE.MeshStandardMaterial
  ghost: THREE.LineBasicMaterial
  lines: ReturnType<typeof fatMaterial>
  slot: THREE.MeshBasicMaterial
  /** the box the scene is cut to (see `setBox`), shared by every material in it */
  clip: THREE.Plane[]
}

/** the piece's geometry and materials, built once per scene and freed with it */
export function usePiece(): Piece {
  const piece = useMemo<Piece>(() => {
    const m = rainMaterials()
    const b = bracketGeometry(COLS, STOREYS)
    const r = railGeometry(COLS, STOREYS, RAIL_X)
    const w = windowGeometry(COLS, STOREYS)
    const flex = flexPanels()
    const own: THREE.BufferGeometry[] = []
    for (let s = 0; s < STOREYS; s++) {
      const y0 = s * G.fh + 0.02
      const y1 = (s + 1) * G.fh - 0.02
      own.push(block([RAIL_X - 0.0016, y0, D.rail[0]], [RAIL_X + 0.0016, y1, D.rail[1] - 0.004]), block([RAIL_X - 0.04, y0, D.rail[1] - 0.004], [RAIL_X + 0.04, y1, D.rail[1]]))
    }
    const near = m.concrete.clone()
    near.userData = { ...m.concrete.userData }
    const clip = boxPlanes()
    setBox(clip, ALL)
    const ghost = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false })
    const lines = fatMaterial(INK, 1.15, 0.24)
    const slot = new THREE.MeshBasicMaterial({ color: '#050505' })
    for (const mat of [...(Object.values(m) as THREE.Material[]), near, ghost, lines, slot]) mat.clippingPlanes = clip
    return {
      m,
      geo: {
        wall: wallGeometry(COLS, STOREYS),
        wool: woolGeometry(COLS, STOREYS),
        brackets: b.steel,
        pads: b.pads,
        rails: r.rails,
        rail: merge(own),
        hangers: r.hangers,
        frames: w.frames,
        infill: w.infill,
        glass: w.glass,
        panels: panelsGeometry(COLS, STOREYS, { skip: (k) => k === NEAR }),
        flex: flex.g,
        flexEdges: new THREE.EdgesGeometry(flex.g, 30),
        slots: slotGeometry(),
        bolts: merge(bracketYs(STOREYS).map((y) => new THREE.CylinderGeometry(0.008, 0.008, 0.02, 12).rotateZ(Math.PI / 2).translate(ARM_X - 0.006, y, 0))),
        block: buildingLines({ cols: COLS, storeys: STOREYS, depth: DEPTH }),
      },
      flexBase: flex.base,
      flexAlong: flex.along,
      near,
      ghost,
      lines,
      slot,
      clip,
    }
  }, [])
  useEffect(
    () => () => {
      Object.values(piece.geo).forEach((g) => g.dispose())
      piece.near.dispose()
      piece.ghost.dispose()
      piece.lines.dispose()
      piece.slot.dispose()
      disposeRainMaterials(piece.m)
    },
    [piece],
  )
  return piece
}

/** the near column seen through (x 0..1): its skin all but gone, its outline drawn */
export function setGhost(p: Piece, x: number) {
  p.near.opacity = 1 - x * 0.9
  p.near.depthWrite = p.near.opacity > 0.97
  p.ghost.opacity = x * 0.45
  p.ghost.visible = x > 0.003
}

/** the near column's panels bowed by `bow` (m, out from the wall), each between its own ends */
export function setBow(p: Piece, bow: number) {
  const pos = p.geo.flex.getAttribute('position') as THREE.BufferAttribute
  const arr = pos.array as Float32Array
  for (let i = 0; i < pos.count; i++) arr[i * 3 + 2] = p.flexBase[i * 3 + 2] + bow * Math.sin(Math.PI * p.flexAlong[i])
  pos.needsUpdate = true
}

/** the piece: the building in lines, the wall, the rainscreen, the near column apart (it can bow or be seen through) */
export function PieceMeshes({ p, slots = false, railRef, boltRef }: { p: Piece; slots?: boolean; railRef?: Ref<THREE.Mesh>; boltRef?: Ref<THREE.Mesh> }) {
  const { m, geo } = p
  return (
    <group>
      <FatLines geometry={geo.block} material={p.lines} />
      <mesh geometry={geo.wall} material={m.wall} />
      <mesh geometry={geo.wool} material={m.insulation} />
      <mesh geometry={geo.pads} material={m.pad} />
      <mesh geometry={geo.brackets} material={m.steel} />
      {slots && <mesh geometry={geo.slots} material={p.slot} />}
      {slots && <mesh ref={boltRef} geometry={geo.bolts} material={m.darkSteel} position={[0, 0, 0.086]} />}
      <mesh geometry={geo.rails} material={m.steel} />
      <mesh ref={railRef} geometry={geo.rail} material={m.steel} />
      <mesh geometry={geo.hangers} material={m.darkSteel} />
      <mesh geometry={geo.frames} material={m.alu} />
      <mesh geometry={geo.infill} material={m.alu} />
      <mesh geometry={geo.glass} material={m.glass} renderOrder={2} />
      <mesh geometry={geo.panels} material={m.concrete} />
      <mesh geometry={geo.flex} material={p.near} renderOrder={3} />
      <lineSegments geometry={geo.flexEdges} material={p.ghost} renderOrder={4} />
    </group>
  )
}

/**
 * The faces where the box's floor and ceiling cut through the wall and the wool (solids, which would
 * look hollow from under or over the cut), kept to the box each frame (after the scene sets it).
 */
export function Caps({ p, box }: { p: Piece; box: Box }) {
  const parts = useMemo(() => {
    const out: { x: [number, number]; z: [number, number]; y: [number, number]; mat: THREE.Material }[] = []
    for (let k = 0; k < COLS; k++) {
      out.push({ x: [colX(k) - 0.02, colX(k) + G.pw + 0.02], z: [D.wall[0], D.wall[1]], y: [0, H], mat: p.m.wall })
      out.push({ x: [colX(k) - 0.015, colX(k) + G.pw + 0.015], z: [D.wool[0], D.wool[1]], y: [0, H], mat: p.m.insulation })
    }
    for (let k = 0; k < COLS - 1; k++)
      for (let s = 0; s <= STOREYS; s++) {
        const y = s * G.fh
        out.push({ x: [stripX(k) + 0.02, stripX(k) + G.ww - 0.02], z: [D.wall[0], D.wall[1] - 0.04], y: [Math.max(0, y - 0.32), Math.min(H, y + 0.5)], mat: p.m.wall })
      }
    return out
  }, [p])
  const geo = useMemo(() => ({ down: new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2), up: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2) }), [])
  useEffect(
    () => () => {
      geo.down.dispose()
      geo.up.dispose()
    },
    [geo],
  )
  const caps = useRef<(THREE.Mesh | null)[]>([])
  useFrame(() => {
    parts.forEach((c, i) => {
      for (const side of [0, 1]) {
        const m = caps.current[i * 2 + side]
        if (!m) continue
        const y = side ? box[4] - 0.0005 : box[1] + 0.0005
        const x0 = Math.max(c.x[0], box[0])
        const x1 = Math.min(c.x[1], box[3])
        const z0 = Math.max(c.z[0], box[2])
        const z1 = Math.min(c.z[1], box[5])
        m.visible = y > c.y[0] && y < c.y[1] && x1 > x0 && z1 > z0
        if (m.visible) {
          m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
          m.scale.set(x1 - x0, 1, z1 - z0)
        }
      }
    })
  })
  return (
    <group>
      {parts.flatMap((c, i) => [
        <mesh key={i * 2} ref={(el) => void (caps.current[i * 2] = el)} geometry={geo.down} material={c.mat} visible={false} />,
        <mesh key={i * 2 + 1} ref={(el) => void (caps.current[i * 2 + 1] = el)} geometry={geo.up} material={c.mat} visible={false} />,
      ])}
    </group>
  )
}

/* ---- the weather's materials --------------------------------------------------------------------- */

export function rainMaterial(opacity = 0.6) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: RAIN_VS,
    fragmentShader: LINE_FS,
    clipping: true,
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uFace: { value: FACE }, uOpacity: { value: opacity }, uAmount: { value: 1 }, uColor: { value: new THREE.Color(INK) } },
  })
  mat.toneMapped = false
  return mat
}

export function flowMaterial(color: string, speed: number, gap: number, base: number, pulse: number, fade: number) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: FLOW_VS,
    fragmentShader: FLOW_FS,
    clipping: true,
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uSpeed: { value: speed }, uGap: { value: gap }, uBase: { value: base }, uPulse: { value: pulse }, uOpacity: { value: 1 }, uFade: { value: fade } },
  })
  mat.toneMapped = false
  return mat
}
