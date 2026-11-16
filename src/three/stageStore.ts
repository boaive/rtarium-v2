import { useSyncExternalStore } from 'react'
import type { Thickness } from '../content/technical'

/**
 * Shared state between the page (DOM) and the one WebGL stage behind it.
 *
 * The homepage has a single fixed, transparent canvas between the coloured ground and the copy.
 * Each full-screen step names the pose it wants; the stage frames whichever region holds the
 * middle of the screen and glides to its pose in time. Mutable values read every frame live in
 * `stage`; the few that React renders from live in a small store.
 */

export type PoseId =
  | 'hero'
  | 'structure'
  | 'material'
  | 'pour'
  | 'depth'
  | 'shear'
  | 'mineral'
  | 'stack'
  | 'spec'
  | 'roving'
  | 'xray'
  | 'none'

/** a mesh turned by hand: how far (rad), and whether a finger or the mouse holds it now */
export interface Turn {
  yaw: number
  pitch: number
  dragging: boolean
  /** a finger on a phone's card (-1..1 across it, y down): it presses the sheet there, which springs back once it lifts */
  touch?: { x: number; y: number; down: boolean }
}

export interface Region {
  el: HTMLElement
  pose: () => PoseId
  /**
   * A chapter scrubbed sideways: the mesh `t` of the way from step pose `a` to step pose `b`, over
   * grounds `ga` and `gb` (the edge between them at `1 - t` of the width). `pose()` then names the nearer one.
   */
  blend?: () => Blend
  /**
   * The view is drawn inside the element's own box (a framed figure in the page) rather than across the screen:
   * the mesh centred in it, as wide in it as it is on the screen
   */
  box?: boolean
  /** a phone's card turned by hand (press and hold): its own, apart from the opening's (`stage.orbit`) */
  turn?: Turn
}

export interface Blend {
  a: PoseId
  b: PoseId
  t: number
  ga: Ground
  gb: Ground
}

/** a Tech Space figure under the cursor: the mesh shows what that figure means */
export type Inspect = 'thickness' | 'width' | 'length' | 'tensile' | 'modulus' | 'elongation'

export const stage = {
  regions: new Set<Region>(),
  /** 0 = RTARIUM, 1 = a flat (single-face) mesh, for the shear-plane comparison */
  flat: 0,
  /** drag rotation, written by the pointer handlers */
  orbit: { yaw: 0, pitch: 0, dragging: false },
  /** when a finger last took a mesh in hand (press and hold), or the tour last handed over to About (ms): a phone's swipe
   * pager leaves that touch alone */
  heldAt: -1e9,
  /** cursor, -1..1 over the window, and when it last moved (ms) */
  pointer: { x: 0, y: 0, at: -1e9 },
  /** DOM labels pinned to points of the model, keyed by anchor id */
  labels: new Map<string, HTMLElement>(),
  /** how far the opening tour has gone: 0 at the top, 1 mesh built, 2 inside the cavity, 3 the cast, 4 handed to About (damped) */
  tour: 0,
  /** how far the tour has gone into white light (0..1); the ground and the fog wash to warm white */
  wash: 0,
  /** on a phone, how far the camera has flown on along the cavity (m, from where it came down between the faces; damped) */
  tourDive: 0,
  /** the Tech Space figure under the cursor or focused, if any */
  inspect: null as Inspect | null,
}

/* ---- the few values React renders from ------------------------------------------------------ */

export type Ground = 'yellow' | 'black' | 'light'

interface Shared {
  thickness: Thickness
  ready: boolean
  /** WebGL unavailable or the scene failed: the page shows still images instead */
  failed: boolean
  /** the chapter and step holding the middle of the screen */
  chapter: string
  step: number
  ground: Ground
}

let shared: Shared = { thickness: 10, ready: false, failed: false, chapter: 'hero', step: 0, ground: 'yellow' }
const listeners = new Set<() => void>()

export function setShared(patch: Partial<Shared>) {
  let changed = false
  for (const k in patch) {
    const key = k as keyof Shared
    if (shared[key] !== patch[key]) changed = true
  }
  if (!changed) return
  shared = { ...shared, ...patch }
  listeners.forEach((l) => l())
}

export function getShared() {
  return shared
}

export function useStageValue<K extends keyof Shared>(key: K): Shared[K] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => shared[key],
  )
}
