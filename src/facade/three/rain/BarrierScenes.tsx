import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { prefersReducedMotion } from '../../../lib/motion'
import { smooth, type Progress } from '../../progress'
import { Anchor } from '../Stage3D'
import type { LabelBus, Shot } from '../kit'
import { Wake } from './lines'
import { D, G } from './parts'
import { ALL, ARM_X, Caps, FACE, H, INK, PieceMeshes, W, ZM_CAV, airLines, flowMaterial, placeCamera, rainGeometry, rainMaterial, setBow, setBox, setGhost, shotAlong, usePiece, windLines, type Box, type Piece } from './weather'

/**
 * The barrier's three pages, each its own scene of the same piece of the block (see `weather`). Each
 * opens on the piece already turned to show its near end, the weather on it moving in its own time;
 * then, while the page holds, the scroll makes one decisive move to where the point is made, and
 * stays there:
 *
 *   water      in close behind the cladding at the cut: the odd drop runs down the back of the panel,
 *              the wool and the wall stay dry
 *   thermal    down to the foot of the façade, looking up the cavity: air comes in and rises behind the
 *              panels (the near column seen through), in front of the unbroken wool
 *   structure  in to the cut end, seen from the side: with each gust the panel flexes a little, clear of
 *              its rails, and the rail rides in its slotted brackets; the wall never moves
 *
 * Each scene keeps to the middle of its black box (`AREA`, the rest of the black left empty) without a
 * frame: the canvas fills the box, and as the view goes in the piece is cut down to what the close view
 * frames, the cut growing with the camera's distance, so it always ends inside the middle.
 *
 * `t` (0..1) is how far the page's hold has been scrolled, eased by the section.
 */

/** the part of the black box the scene keeps to, as a share of its height (and the same part of its width) */
const AREA = { wide: 0.68, narrow: 0.88 }
const LENS = Math.tan((13 * Math.PI) / 180)

/** where every page opens: the whole piece, a little from the near end, in the middle of its box */
const OPEN: Shot = { target: [W / 2 + 0.7, H / 2 + 0.2, -1.6], dist: 32, azim: 36, elev: 9 }
/** on a narrow screen every view stands a little further off */
const FAR = 1.4
/** the move: held still a moment, then in, then held there */
const along = (close: Shot): [number, Shot][] => [
  [0, OPEN],
  [0.12, OPEN],
  [0.78, close],
  [1, close],
]

interface SceneProps {
  t: Progress
  bus: LabelBus
  live: { current: boolean }
  compact: boolean
}

/**
 * What all three do every frame: the camera from the run, its lens widened so the picture in the
 * middle of the box is the one framed; the piece cut to a box about the camera's target (the close
 * view's cut, `cut` in world coordinates, grown with the camera's distance, so it keeps to the same
 * part of the screen all the way in), opened out to the whole piece only at the open view. Returns the
 * box, for the cut faces.
 */
function useScene(t: Progress, keys: [number, Shot][], cut: Box, p: Piece, compact: boolean, live: { current: boolean }, onFrame: (v: number, now: number) => void) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const t0 = useRef(performance.now())
  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])
  useEffect(() => {
    const on = () => invalidate()
    t.listeners.add(on)
    return () => void t.listeners.delete(on)
  }, [t, invalidate])
  const box = useMemo<Box>(() => [0, 0, 0, 0, 0, 0], [])
  useFrame(() => {
    const v = Math.min(1, Math.max(0, t.value))
    const now = reduced ? 2.4 : (performance.now() - t0.current) / 1000
    const k = compact ? FAR : 1
    const shot = shotAlong(keys, v)
    placeCamera(camera, size, shot, k)
    camera.fov = (2 * Math.atan(LENS / (compact ? AREA.narrow : AREA.wide)) * 180) / Math.PI
    camera.updateProjectionMatrix()
    const close = keys[keys.length - 1][1]
    const grow = (shot.dist / close.dist) * k
    const open = Math.pow(1 - smooth(keys[1][0], keys[2][0], v), 8)
    for (let i = 0; i < 6; i++) {
      const a = i % 3
      const at = shot.target[a] + (cut[i] - close.target[a]) * grow
      const b = i < 3 ? Math.max(ALL[i], at) : Math.min(ALL[i], at)
      box[i] = b + (ALL[i] - b) * open
    }
    setBox(p.clip, box)
    onFrame(v, now)
    if (live.current && !reduced) invalidate()
  }, -1)
  return box
}

const show = (bus: LabelBus, id: string, on: boolean) => (on ? bus.shown.add(id) : bus.shown.delete(id))

/* ---- water damage ------------------------------------------------------------------------------- */

/** the corner, a storey high: two panels and a window back from the cut, a little of the building behind, the rain in front */
const WATER_CUT: Box = [W - 1.9, 2.1, -1.5, W + 0.1, 4.3, FACE + 0.4]

export function WaterScene({ t, bus, live, compact }: SceneProps) {
  const p = usePiece()
  const rain = useMemo(() => {
    const mat = rainMaterial(0.62)
    mat.clippingPlanes = p.clip
    return { g: rainGeometry(1300), mat }
  }, [p])
  useEffect(
    () => () => {
      rain.g.dispose()
      rain.mat.dispose()
    },
    [rain],
  )
  // in to the corner, behind the cladding: the rain running off the face, the cut through the
  // rainscreen beside it (the panel, the cavity draining the odd drop, the wool, the dry wall)
  const keys = useMemo(() => along({ target: [W - 0.3, 3.15, -0.05], dist: 5.4, azim: 52, elev: 12 }), [])
  const box = useScene(t, keys, WATER_CUT, p, compact, live, (v, now) => {
    rain.mat.uniforms.uTime.value = now
    p.lines.opacity = 0.24 - 0.12 * smooth(0.3, 0.7, v)
    show(bus, 'w-face', v > 0.8)
    show(bus, 'w-drain', v > 0.84)
    show(bus, 'w-dry', v > 0.88)
  })
  return (
    <group>
      <Wake live={live} />
      <PieceMeshes p={p} />
      <Caps p={p} box={box} />
      <lineSegments geometry={rain.g} material={rain.mat} renderOrder={6} frustumCulled={false} />
      <Anchor bus={bus} id="w-face" position={[W - 0.55, 3.55, FACE]} />
      <Anchor bus={bus} id="w-drain" position={[W - 0.01, 2.75, ZM_CAV]} />
      <Anchor bus={bus} id="w-dry" position={[W + 0.02, 3.35, -0.12]} />
    </group>
  )
}

/* ---- thermal bridging ---------------------------------------------------------------------------- */

/** the near columns from the middle of the first storey to the middle of the second, cut level: seen from under it, the section shows */
const THERMAL_CUT: Box = [W - 2, 2, -1, W + 0.3, 5, FACE + 0.4]

export function ThermalScene({ t, bus, live, compact }: SceneProps) {
  const p = usePiece()
  const air = useMemo(() => {
    const mat = flowMaterial('#fdd001', 0.55, 1.6, 0.12, 0.95, 0.8)
    mat.clippingPlanes = p.clip
    return { g: airLines(), mat }
  }, [p])
  useEffect(
    () => () => {
      air.g.dispose()
      air.mat.dispose()
    },
    [air],
  )
  // down to the foot of the façade, looking up the cavity of the near column
  const keys = useMemo(() => along({ target: [W - 0.6, 3.6, 0.1], dist: 7.2, azim: 24, elev: -34 }), [])
  const box = useScene(t, keys, THERMAL_CUT, p, compact, live, (v, now) => {
    air.mat.uniforms.uTime.value = now
    air.mat.uniforms.uOpacity.value = 0.35 + 0.65 * smooth(0.2, 0.6, v)
    setGhost(p, smooth(0.15, 0.55, v))
    p.lines.opacity = 0.24 - 0.1 * smooth(0.3, 0.7, v)
    show(bus, 'w-cavity', v > 0.8)
    show(bus, 'w-wool', v > 0.84)
  })
  return (
    <group>
      <Wake live={live} />
      <PieceMeshes p={p} />
      <Caps p={p} box={box} />
      <lineSegments geometry={air.g} material={air.mat} renderOrder={5} frustumCulled={false} />
      <Anchor bus={bus} id="w-cavity" position={[W - 0.45, 2.2, ZM_CAV]} />
      <Anchor bus={bus} id="w-wool" position={[W - 0.95, 3.4, D.wool[1]]} />
    </group>
  )
}

/* ---- the structure ------------------------------------------------------------------------------- */

/** the panel the view goes to (the near column's, a storey up) and the bracket beside it */
const FLEX_Y = 1.65 + G.fh / 2
const BRACKET_Y = 3.75
/** the section at the cut end between them: the wind against the panel, the panel, the rail, the wool, the wall */
const STRUCTURE_CUT: Box = [W - 1.2, 3.16, -0.3, W + 0.06, 3.89, 0.52]

export function StructureScene({ t, bus, live, compact }: SceneProps) {
  const p = usePiece()
  const wind = useMemo(() => {
    const mat = flowMaterial(INK, 2.4, 4.5, 0.08, 0.7, 0.6)
    mat.clippingPlanes = p.clip
    return { g: windLines(), mat }
  }, [p])
  useEffect(
    () => () => {
      wind.g.dispose()
      wind.mat.dispose()
    },
    [wind],
  )
  const rail = useRef<THREE.Mesh>(null)
  const bolts = useRef<THREE.Mesh>(null)
  const bowed = useRef(-1)
  // in to the cut end, seen from the side: the panel's edge, its rail, the slotted bracket
  const keys = useMemo(() => along({ target: [W, (FLEX_Y + BRACKET_Y) / 2, 0.11], dist: 1.9, azim: 84, elev: 4 }), [])
  const box = useScene(t, keys, STRUCTURE_CUT, p, compact, live, (v, now) => {
    wind.mat.uniforms.uTime.value = now
    // the gusts: the panel only ever flexes out, a little, so it never meets its rails
    const gust = 0.5 + 0.5 * (0.62 * Math.sin((now * Math.PI * 2) / 2.8) + 0.38 * Math.sin((now * Math.PI * 2) / 1.35 + 1.2))
    const bow = 0.004 + 0.016 * gust
    if (Math.abs(bow - bowed.current) > 2e-5) {
      bowed.current = bow
      setBow(p, bow)
    }
    // the rail and its bolts ride a few millimetres in the slots (drawn larger than life)
    const slide = (gust - 0.5) * 0.012
    if (rail.current) rail.current.position.z = slide * 0.6
    if (bolts.current) bolts.current.position.z = 0.086 + slide
    p.lines.opacity = 0.24 - 0.14 * smooth(0.3, 0.7, v)
    show(bus, 'w-flex', v > 0.8)
    show(bus, 'w-slide', v > 0.84)
  })
  return (
    <group>
      <Wake live={live} />
      <PieceMeshes p={p} slots railRef={rail} boltRef={bolts} />
      <Caps p={p} box={box} />
      <lineSegments geometry={wind.g} material={wind.mat} renderOrder={5} frustumCulled={false} />
      <Anchor bus={bus} id="w-flex" position={[W, FLEX_Y, FACE + 0.012]} />
      <Anchor bus={bus} id="w-slide" position={[ARM_X + 0.004, BRACKET_Y, 0.086]} />
    </group>
  )
}
