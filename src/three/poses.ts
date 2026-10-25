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
  /** where the key light comes from, before it turns with the camera (default: high, for a lying sheet) */
  key?: [number, number, number]
  axes?: boolean
  shearPlane?: boolean
  dimension?: boolean
  /** concrete above and below the mesh: gap from the mesh (m, 0 = cast in), opacity */
  slabs?: { gap: number; opacity: number }
  /** nothing to draw */
  empty?: boolean
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
  // the opening's callouts on the strip
  'hero-structure': [0.03, 0.005, -0.1],
  'hero-yarn': [-0.066, 0.005, 0.07],
  'hero-thickness': [0.072, 0, 0.04],
  // inside the cavity on the opening tour: a face above, a face below, the fibres between
  'tour-face-a': [0.01, 0.0052, -0.03],
  'tour-fibres': [-0.008, 0, -0.05],
  'tour-face-b': [0.012, -0.0052, -0.026],
}

export const HERO_LABELS = ['hero-structure', 'hero-yarn', 'hero-thickness']

export const POSES: Record<PoseId, Pose> = {
  // the opening: a long strip lying on the yellow ground, receding to the upper right, its shadow
  // under it; the tour (TOUR) takes it from there
  hero: {
    ...base,
    tgt: [0, 0, 0],
    elev: 36,
    azim: 35,
    dist: 0.66,
    distCompact: 1.05,
    fov: 30,
    frame: [0.67, 0.54],
    frameCompact: [0.5, 0.33],
    sway: 5,
    press: true,
    win: [12, 34],
    shadow: 1,
    key: [-0.62, 0.58, 0.52],
    labels: ['hero-structure', 'hero-yarn', 'hero-thickness'],
    labelZone: [0.36, 0.08, 0.99, 0.96],
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
  // Innovation: reinforced through its depth, load in X, Y and Z; copy top right
  depth: {
    ...base,
    tgt: [0.022, 0.014, -0.004],
    elev: 30,
    azim: 38,
    dist: 0.27,
    distCompact: 0.48,
    fov: 28,
    frame: [0.34, 0.6],
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
    dist: 0.25,
    distCompact: 0.3,
    fov: 26,
    frame: [0.68, 0.34],
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
    frame: [0.79, 0.6],
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

/* ---- the opening tour -------------------------------------------------------------------------- */

type TourKey = Pick<Pose, 'tgt' | 'elev' | 'azim' | 'dist' | 'fov' | 'frame' | 'frameCompact' | 'fog' | 'win'> & { distCompact: number }

/**
 * The opening, as the visitor scrolls: 0 the strip lies beside the headline; 1 the mesh has been
 * built out past the edges of the screen; 2 the camera has gone down between the two faces; 3 it
 * travels on along the cavity while the next chapter arrives.
 */
const h0 = POSES.hero
const TOUR: TourKey[] = [
  { tgt: h0.tgt, elev: h0.elev, azim: h0.azim, dist: h0.dist, distCompact: h0.distCompact ?? h0.dist, fov: h0.fov, frame: h0.frame, frameCompact: h0.frameCompact, fog: h0.fog, win: h0.win },
  { tgt: [0, 0, 0], elev: 50, azim: 18, dist: 0.3, distCompact: 0.42, fov: 34, frame: [0.5, 0.5], frameCompact: [0.5, 0.45], fog: [1, 2], win: [FIELD, FIELD] },
  { tgt: [0, 0, -0.07], elev: 0, azim: 0, dist: 0.11, distCompact: 0.11, fov: 66, frame: [0.5, 0.5], frameCompact: [0.5, 0.5], fog: [0.12, 0.45], win: [FIELD, FIELD] },
  { tgt: [0, 0, -0.17], elev: 0, azim: 0, dist: 0.11, distCompact: 0.11, fov: 66, frame: [0.5, 0.5], frameCompact: [0.5, 0.5], fog: [0.12, 0.45], win: [FIELD, FIELD] },
]

export const TOUR_LABELS = ['tour-face-a', 'tour-fibres', 'tour-face-b']

/** The hero pose at tour position `p` (0..3), eased between its keys. Writes into `out`. */
export function tourPose(p: number, out: Pose): Pose {
  const i = Math.min(TOUR.length - 2, Math.max(0, Math.floor(p)))
  const t = smoothstep(0, 1, p - i)
  const a = TOUR[i]
  const b = TOUR[i + 1]
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
  const tb = i === 0 ? smoothstep(0, 0.75, p) : 1
  out.win = [lerp(a.win[0], b.win[0], i === 0 ? tb : t), lerp(a.win[1], b.win[1], i === 0 ? tb : t)]
  // the sway, the press, the shadow and the callouts belong to the strip beside the headline
  out.sway = POSES.hero.sway * (1 - smoothstep(0, 0.5, p))
  out.press = p < 0.6
  out.shadow = 1 - smoothstep(0.45, 0.95, p)
  out.labels = p < 0.18 ? HERO_LABELS : p > 1.75 && p < 2.6 ? TOUR_LABELS : []
  out.labelZone = p < 0.5 ? POSES.hero.labelZone : [0.04, 0.12, 0.96, 0.84]
  return out
}
