import { PITCH } from './mesh/MeshField'
import type { PoseId } from './stageStore'
import { lerp, smoothstep } from '../lib/motion'

/**
 * Camera and material states of the stage, one per thing a screen explains.
 *
 * Everything is shot around one sheet of RTARIUM (the cells from V1's Blender model, instanced),
 * lying in its own XZ plane at the origin, thickness along Y. `stand` tips the sheet up on its
 * edge, so it faces the viewer like a wall panel. The camera is described in spherical terms
 * around a target, so a glide from one pose to the next swings round the sheet instead of cutting
 * through it. `win` is how much of the sheet is built, in cells (see yarnMaterial uWin).
 *
 * Frames are chosen with the copy of each screen: the mesh sits where the copy is not, so nothing
 * has to be washed out behind the text.
 */

/** cells per side of the instanced sheet; the chapters trim it back to the TILE they explain */
export const FIELD = 40
export const TILE = 18
export const HALF = (TILE * PITCH) / 2

/** the mesh in its own colour: basalt on the yellow ground, the same basalt under warm light on black */
export type Look = 'day' | 'night'

export interface Pose {
  tgt: [number, number, number]
  /** camera elevation and azimuth (deg) and distance (m) from the target */
  elev: number
  azim: number
  dist: number
  /** phones: the camera stands further back so the model clears the copy */
  distCompact?: number
  fov: number
  /** where the target sits on screen, as fractions of the viewport (desktop, phone) */
  frame: [number, number]
  frameCompact: [number, number]
  /** fall-off into the ground colour: distance (m) where it starts and where it is complete */
  fog: [number, number]
  look: Look
  xray: number
  dim: [number, number, number]
  vis: [number, number, number]
  glow: [number, number, number]
  explode: number
  /** slow turn either side (deg); spin: continuous turntable (deg/s) */
  sway: number
  spin: number
  /** the cursor presses the sheet and it springs back */
  press: boolean
  labels: string[]
  /** where on screen pinned labels may show (fractions: x0, y0, x1, y1), clear of the copy */
  labelZone: [number, number, number, number]
  labelZoneCompact: [number, number, number, number]
  /** cells built across the warp and the weft */
  win: [number, number]
  /** 0 = the sheet lies flat, 1 = it stands on its edge facing the camera */
  stand: number
  /** how much of its shadow the sheet casts on the ground under it (0..1) */
  shadow?: number
  /** the piece held above its shadow (m) and turned off the level about its own x and z axes (deg) */
  lift?: number
  tilt?: [number, number]
  /** where the key light comes from, before it turns with the camera (default: high, for a lying sheet) */
  key?: [number, number, number]
  axes?: boolean
  shearPlane?: boolean
  dimension?: boolean
  /**
   * concrete above and below the mesh: gap from the mesh (m, 0 = cast in), opacity; `bottom` keeps
   * only the slab underneath, its top at the mesh's mid-plane (half cast: the upper face stands out)
   */
  slabs?: { gap: number; opacity: number; bottom?: boolean }
  /** mortar flows in across the sheet once the screen is reached, filling the cavity */
  pour?: boolean
  /** nothing to draw */
  empty?: boolean
  /**
   * how settled on a step a scrubbed view is (1 at a step, 0 halfway between two): what belongs to
   * one step only (axes, the plane, a dimension) shows only near it
   */
  settle?: number
}

const base: Omit<Pose, 'tgt' | 'elev' | 'azim' | 'dist' | 'fov'> = {
  frame: [0.5, 0.5],
  frameCompact: [0.5, 0.36],
  fog: [3, 6],
  look: 'day',
  xray: 0,
  dim: [1, 1, 1],
  vis: [1, 1, 1],
  glow: [0, 0, 0],
  explode: 0,
  sway: 0,
  spin: 0,
  press: false,
  labels: [],
  labelZone: [0.02, 0.1, 0.98, 0.86],
  labelZoneCompact: [0.02, 0.1, 0.98, 0.6],
  win: [TILE, TILE],
  stand: 0,
}

const h = HALF

/** points of the sheet that labels pin to, in the sheet's own frame (they follow it when it stands) */
export const ANCHORS: Record<string, [number, number, number]> = {
  'upper-face': [h - 0.046, 0.0052, h - 0.006],
  'lower-face': [h - 0.004, -0.0052, h - 0.03],
  fibres: [h - 0.018, 0.0, h - 0.006],
  'axis-x': [0.064, 0.012, 0.02],
  'axis-y': [0.012, 0.012, -0.044],
  'axis-z': [0.012, 0.058, 0.02],
  'shear-plane': [-0.02, 0, 0.055],
  'slab-top': [-h * 0.6, 0.068, h],
  'slab-mesh': [h, 0.004, h * 0.4],
  'slab-bottom': [h * 0.4, -0.068, h],
  'slab-yarn': [-h * 0.2, 0.005, h - 0.004],
  dimension: [h + 0.006, 0, -h],
  'dim-width': [0, 0, h + 0.008],
  strain: [h, 0.004, -h * 0.3],
  // the opening's callouts on the piece (its far end, its near side, its near corner)
  'hero-structure': [-0.07, 0.0052, -0.05],
  'hero-yarn': [0.102, 0.0052, -0.044],
  'hero-thickness': [0.08, -0.0052, 0.06],
  // inside the cavity on the opening tour: a face above, a face below, the fibres between
  'tour-face-a': [0.012, 0.0052, -0.03],
  'tour-fibres': [0.012, 0, -0.03],
  'tour-face-b': [0.012, -0.0052, -0.03],
  // the cast panel at the close of "In concrete": the mortar between the yarns, a yarn of the upper
  // face, the side of the slab
  'pour-cavity': [-0.08, 0.0042, -0.066],
  'pour-mesh': [-0.087, 0.0058, 0.017],
  'pour-matrix': [-0.0945, -0.004, 0.066],
  // the depth between them, dimensioned a little further along
  'tour-gap': [0.03, 0.0052, -0.034],
  'tour-gap-b': [0.03, -0.0052, -0.034],
}

export const HERO_LABELS = ['hero-structure', 'hero-yarn', 'hero-thickness']

/** the notes on the cast panel at the close of "In concrete" */
export const POUR_LABELS = ['pour-cavity', 'pour-mesh', 'pour-matrix']

export const POSES: Record<PoseId, Pose> = {
  // the opening: a broad piece of the sheet lying on its own in the lower right of the yellow
  // ground, its shadow under it, turned so the two faces read as two offset grids; the tour (TOUR)
  // takes it from there
  hero: {
    ...base,
    tgt: [0, 0.01, 0],
    elev: 52,
    azim: 34,
    dist: 0.64,
    distCompact: 1.22,
    fov: 30,
    frame: [0.69, 0.685],
    frameCompact: [0.5, 0.31],
    sway: 4,
    press: true,
    win: [18, 12],
    shadow: 1,
    lift: 0.03,
    tilt: [0, 11],
    key: [-0.5, 0.82, 0.42],
    labels: ['hero-structure', 'hero-yarn', 'hero-thickness'],
    labelZone: [0.4, 0.14, 0.99, 0.97],
  },
  // edge-on at a corner, upper left: copy sits bottom right
  structure: {
    ...base,
    tgt: [h - 0.034, -0.002, h - 0.03],
    elev: 13,
    azim: 42,
    dist: 0.15,
    fov: 30,
    frame: [0.4, 0.3],
    frameCompact: [0.5, 0.34],
    fog: [0.2, 0.7],
    sway: 6,
    labels: ['upper-face', 'lower-face', 'fibres'],
    labelZone: [0.02, 0.1, 0.62, 0.62],
    shadow: 1,
  },
  // the rovings as a low panorama under the copy band at the top
  material: {
    ...base,
    tgt: [0.0, 0.0, 0.02],
    elev: 20,
    azim: -24,
    dist: 0.13,
    distCompact: 0.2,
    fov: 34,
    frame: [0.5, 0.86],
    frameCompact: [0.5, 0.5],
    fog: [0.12, 0.42],
    sway: 6,
    press: true,
  },
  // About, in concrete: the mesh carried on close from the rovings, as in Structure and Material,
  // but filling the left of the screen (the copy and the footage stand in one column on the
  // right); mortar flows in across it from the far side; then the camera stands back to the whole
  // cast block (POUR_OUT)
  pour: {
    ...base,
    tgt: [0.07, -0.002, 0.055],
    elev: 24,
    azim: -32,
    dist: 0.16,
    distCompact: 0.3,
    fov: 30,
    frame: [0.26, 0.58],
    frameCompact: [0.5, 0.42],
    fog: [0.16, 0.5],
    sway: 3,
    win: [16, 16],
    shadow: 1,
    pour: true,
  },
  // Innovation: reinforced through its depth, load in X, Y and Z; copy top right
  depth: {
    ...base,
    tgt: [0.022, 0.014, -0.004],
    elev: 30,
    azim: 38,
    dist: 0.42,
    distCompact: 0.56,
    fov: 28,
    frame: [0.33, 0.54],
    win: [12, 12],
    frameCompact: [0.5, 0.3],
    fog: [0.4, 0.9],
    dim: [0.8, 0.8, 1.4],
    glow: [0, 0, 0.12],
    sway: 6,
    axes: true,
    shadow: 1,
    labels: ['axis-x', 'axis-y', 'axis-z'],
    labelZone: [0.02, 0.1, 0.6, 0.9],
  },
  // Innovation: the plane a flat mesh leaves for thin concrete to split along; copy bottom left
  shear: {
    ...base,
    tgt: [0.0, -0.002, 0.012],
    elev: 24,
    azim: 18,
    dist: 0.34,
    distCompact: 0.36,
    fov: 26,
    frame: [0.66, 0.4],
    win: [14, 14],
    frameCompact: [0.5, 0.34],
    fog: [0.3, 0.8],
    dim: [1, 1, 1.4],
    glow: [0, 0, 0.08],
    sway: 4,
    shearPlane: true,
    shadow: 1,
    labels: ['shear-plane'],
    labelZone: [0.4, 0.1, 0.98, 0.62],
  },
  // Innovation: the mineral fibre, close, under warm light, above the copy band
  mineral: {
    ...base,
    tgt: [-0.02, 0.004, 0.01],
    elev: 40,
    azim: 140,
    dist: 0.09,
    fov: 30,
    frame: [0.62, 0.3],
    frameCompact: [0.5, 0.3],
    fog: [0.08, 0.3],
    look: 'night',
    sway: 6,
  },
  // Tech Space: concrete, mesh, concrete, pulled apart, in the middle of a diagonal of copy
  stack: {
    ...base,
    tgt: [0, 0, 0],
    elev: 20,
    azim: 34,
    dist: 0.88,
    distCompact: 1.1,
    fov: 28,
    frame: [0.55, 0.48],
    frameCompact: [0.5, 0.42],
    look: 'night',
    sway: 10,
    slabs: { gap: 0.05, opacity: 1 },
    labels: ['slab-top', 'slab-mesh', 'slab-bottom', 'slab-yarn'],
  },
  // Tech Space, mesh: the sheet stands almost upright and turns, its thickness dimensioned
  spec: {
    ...base,
    tgt: [0, 0, 0],
    elev: 10,
    azim: 24,
    dist: 0.8,
    distCompact: 1.3,
    fov: 28,
    frame: [0.5, 0.5],
    frameCompact: [0.5, 0.32],
    look: 'night',
    spin: 6,
    stand: 0.82,
    dimension: true,
    labels: ['dimension'],
    labelZone: [0.3, 0.1, 0.7, 0.8],
  },
  // Tech Space, yarn: one ribbon of the mesh, close, running away on the right of the figures
  roving: {
    ...base,
    tgt: [0.0, 0.004, 0.0],
    elev: 30,
    azim: 0,
    dist: 0.1,
    distCompact: 0.16,
    fov: 30,
    frame: [0.83, 0.58],
    frameCompact: [0.5, 0.2],
    fog: [0.08, 0.24],
    look: 'night',
    sway: 4,
    win: [2, 26],
  },
  // Tech Space, concrete: the mesh cast in, seen through the concrete, on the left of the figures
  xray: {
    ...base,
    tgt: [0, 0, 0],
    elev: 24,
    azim: 36,
    dist: 0.92,
    distCompact: 1.2,
    fov: 28,
    frame: [0.25, 0.5],
    frameCompact: [0.5, 0.27],
    look: 'night',
    xray: 0.22,
    sway: 10,
    slabs: { gap: 0, opacity: 0.3 },
  },
  none: { ...base, tgt: [0, 0, 0], elev: 30, azim: 30, dist: 0.5, fov: 30, empty: true },
}

/**
 * "In concrete", once the mortar has run in: the whole cast block, about the middle and low, under
 * the copy (top left) and the footage (top right); its notes stand on the left, their words on the
 * copy's line, on short leaders to the block's near end
 */
export const POUR_OUT: Pose = {
  ...POSES.pour,
  tgt: [0.004, -0.006, 0.006],
  elev: 30,
  azim: -20,
  dist: 0.72,
  distCompact: 0.7,
  frame: [0.46, 0.665],
  frameCompact: [0.5, 0.42],
  fog: [1, 2],
  sway: 2,
  labels: POUR_LABELS,
  labelZone: [0.02, 0.4, 0.98, 0.95],
}

/* ---- the opening tour -------------------------------------------------------------------------- */

type TourKey = Pick<Pose, 'tgt' | 'elev' | 'azim' | 'dist' | 'fov' | 'frame' | 'frameCompact' | 'fog' | 'win'> & { at: number; distCompact: number }

/** the close of the tour: a tile of the mesh half cast in concrete, on the warm-white ground */
const CAST = {
  tgt: [0, -0.006, 0] as [number, number, number],
  elev: 27,
  azim: 33,
  dist: 0.5,
  distCompact: 0.86,
  fov: 30,
  frame: [0.67, 0.53] as [number, number],
  frameCompact: [0.5, 0.32] as [number, number],
  win: [15, 15] as [number, number],
}
/** a fog that has swallowed everything: the screen is all ground colour (white, by then) */
const WHITE_FOG: [number, number] = [0, 0.002]

/**
 * The opening, as the visitor scrolls: 0 the piece lies beside the headline; 1 the mesh has been
 * built out past the edges of the screen; 2 the camera has gone down between the two faces; then
 * on along the cavity into white light (the ground washes to warm white), and out of the white a
 * tile of the mesh, which concrete rises around (3).
 */
function tourKeys(): TourKey[] {
  const h0 = POSES.hero
  const s = POSES.structure
  return [
    { at: 0, tgt: h0.tgt, elev: h0.elev, azim: h0.azim, dist: h0.dist, distCompact: h0.distCompact ?? h0.dist, fov: h0.fov, frame: h0.frame, frameCompact: h0.frameCompact, fog: h0.fog, win: h0.win },
    { at: 1, tgt: [0, 0, 0], elev: 50, azim: 18, dist: 0.3, distCompact: 0.42, fov: 34, frame: [0.5, 0.5], frameCompact: [0.5, 0.45], fog: [1, 2], win: [FIELD, FIELD] },
    { at: 2, tgt: [0, 0, -0.07], elev: 0, azim: 0, dist: 0.11, distCompact: 0.11, fov: 66, frame: [0.5, 0.5], frameCompact: [0.5, 0.5], fog: [0.12, 0.45], win: [FIELD, FIELD] },
    { at: 2.5, tgt: [0, 0, -0.2], elev: 0, azim: 0, dist: 0.11, distCompact: 0.11, fov: 70, frame: [0.5, 0.5], frameCompact: [0.5, 0.5], fog: WHITE_FOG, win: [FIELD, FIELD] },
    { at: 2.66, ...CAST, fog: WHITE_FOG },
    { at: 3, ...CAST, fog: [3, 6] },
    // leaving the cast, the camera goes in close to the mesh and comes out as About's first view
    { at: 3.5, tgt: s.tgt, elev: 34, azim: 30, dist: 0.075, distCompact: 0.1, fov: 30, frame: [0.5, 0.5], frameCompact: [0.5, 0.4], fog: [0.3, 0.9], win: [TILE, TILE] },
    { at: 4, tgt: s.tgt, elev: s.elev, azim: s.azim, dist: s.dist, distCompact: s.distCompact ?? s.dist, fov: s.fov, frame: s.frame, frameCompact: s.frameCompact, fog: s.fog, win: s.win },
  ]
}

export const TOUR_LABELS = ['tour-face-a', 'tour-fibres', 'tour-face-b', 'tour-gap']
/** how far into white light the tour has gone (0..1): the ground washes to warm white with it, and back to yellow on the way into About */
export const tourWash = (p: number) => smoothstep(2.08, 2.5, p) * (1 - smoothstep(3.12, 3.55, p))

/** The hero pose at tour position `p` (0..4), eased between its keys. Writes into `out`. */
export function tourPose(p: number, out: Pose): Pose {
  const keys = tourKeys()
  let i = 0
  while (i < keys.length - 2 && p > keys[i + 1].at) i++
  const a = keys[i]
  const b = keys[i + 1]
  const t = smoothstep(0, 1, (p - a.at) / (b.at - a.at))
  const mix2 = (x: [number, number], y: [number, number]): [number, number] => [lerp(x[0], y[0], t), lerp(x[1], y[1], t)]
  out.tgt = [lerp(a.tgt[0], b.tgt[0], t), lerp(a.tgt[1], b.tgt[1], t), lerp(a.tgt[2], b.tgt[2], t)]
  out.elev = lerp(a.elev, b.elev, t)
  out.azim = lerp(a.azim, b.azim, t)
  out.dist = lerp(a.dist, b.dist, t)
  out.distCompact = lerp(a.distCompact, b.distCompact, t)
  out.fov = lerp(a.fov, b.fov, t)
  out.frame = mix2(a.frame, b.frame)
  out.frameCompact = mix2(a.frameCompact, b.frameCompact)
  out.fog = mix2(a.fog, b.fog)
  // the build runs ahead of the camera: the sheet is complete before the camera reaches it
  const tb = i === 0 ? smoothstep(0, 0.75, p) : t
  out.win = [lerp(a.win[0], b.win[0], tb), lerp(a.win[1], b.win[1], tb)]
  // the sway, the press, the shadow and the callouts belong to the piece beside the headline;
  // the cast at the close has its own shadow and a slow sway
  const cast = smoothstep(2.6, 2.7, p)
  out.sway = p > 3.5 ? lerp(0, POSES.structure.sway, smoothstep(3.5, 4, p)) : POSES.hero.sway * Math.max(1 - smoothstep(0, 0.5, p), cast * (1 - smoothstep(3, 3.3, p)))
  // the cursor presses the piece, and the built mesh: a hollow where it rests, springing back as it moves on
  out.press = p < 0.6 || (p > 0.65 && p < 1.4)
  out.shadow = Math.max(1 - smoothstep(0.45, 0.95, p), smoothstep(2.7, 2.95, p))
  out.key = p < 1.5 ? POSES.hero.key : undefined
  // the piece hovers over its shadow beside the headline and settles flat as the mesh is built
  const level = 1 - smoothstep(0, 0.7, p)
  out.lift = (POSES.hero.lift ?? 0) * level
  out.tilt = [(POSES.hero.tilt?.[0] ?? 0) * level, (POSES.hero.tilt?.[1] ?? 0) * level]
  out.slabs = p > 2.62 && p < 3.22 ? { gap: 0, opacity: 1, bottom: true } : undefined
  out.labels = p < 0.18 ? HERO_LABELS : p > 1.8 && p < 2.2 ? TOUR_LABELS : p > 3.9 ? POSES.structure.labels : []
  out.labelZone = p < 0.5 ? POSES.hero.labelZone : p > 3.5 ? POSES.structure.labelZone : [0.02, 0.12, 0.98, 0.86]
  return out
}

/* ---- a chapter scrubbed sideways: the mesh between two of its steps ----------------------------- */

const lerpAngle = (a: number, b: number, t: number) => a + (((((b - a) % 360) + 540) % 360) - 180) * t

/**
 * The pose `t` of the way from `a` to `b`. Camera, framing, build and look values travel
 * continuously; what can only be on or off (axes, plane, dimension, press) belongs to the nearer
 * step, and the labels show only once the mesh has all but arrived. Writes into `out`.
 */
export function blendPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  const n = t < 0.5 ? a : b
  // the scratch pose is shared by every chapter: clear it, so no switch (concrete, mortar, axes,
  // the plane) lingers from a step or a chapter left behind
  for (const k of Object.keys(out)) delete (out as unknown as Record<string, unknown>)[k]
  Object.assign(out, n)
  const L = (x: number, y: number) => lerp(x, y, t)
  const L2 = (x: [number, number], y: [number, number]): [number, number] => [L(x[0], y[0]), L(x[1], y[1])]
  const L3 = (x: [number, number, number], y: [number, number, number]): [number, number, number] => [L(x[0], y[0]), L(x[1], y[1]), L(x[2], y[2])]
  out.tgt = L3(a.tgt, b.tgt)
  out.elev = L(a.elev, b.elev)
  out.azim = lerpAngle(a.azim, b.azim, t)
  out.dist = L(a.dist, b.dist)
  out.distCompact = L(a.distCompact ?? a.dist, b.distCompact ?? b.dist)
  out.fov = L(a.fov, b.fov)
  out.frame = L2(a.frame, b.frame)
  out.frameCompact = L2(a.frameCompact, b.frameCompact)
  out.fog = L2(a.fog, b.fog)
  out.dim = L3(a.dim, b.dim)
  out.vis = L3(a.vis, b.vis)
  out.glow = L3(a.glow, b.glow)
  out.explode = L(a.explode, b.explode)
  out.sway = L(a.sway, b.sway)
  out.win = L2(a.win, b.win)
  out.stand = L(a.stand, b.stand)
  out.xray = L(a.xray, b.xray)
  out.shadow = L(a.shadow ?? 0, b.shadow ?? 0)
  out.lift = L(a.lift ?? 0, b.lift ?? 0)
  out.tilt = [L(a.tilt?.[0] ?? 0, b.tilt?.[0] ?? 0), L(a.tilt?.[1] ?? 0, b.tilt?.[1] ?? 0)]
  out.labels = t < 0.12 ? a.labels : t > 0.88 ? b.labels : []
  out.settle = 1 - smoothstep(0.05, 0.3, Math.min(t, 1 - t))
  return out
}
