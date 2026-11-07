import type { Thickness } from '../../content/technical'

/**
 * What the mobile film (the pinned 3D chapter at the top of the phone homepage) and its WebGL
 * scene share. The page writes it (where each step leaves clear ground for the mesh, the visitor's
 * choices and drags); the scene reads it every frame.
 */
export interface Zone {
  /** the part of the screen (px from its top left) the mesh may use while this step is at rest */
  top: number
  bottom: number
  left: number
  right: number
}

export interface FilmState {
  section: HTMLElement | null
  /** height of one step (px) */
  stepH: number
  zones: Zone[]
  /** "Flat mesh" chosen on the Depth step */
  flat: boolean
  /** drag turn (rad): where the finger has taken it, and whether a finger is down */
  yaw: number
  dragging: boolean
  /** labels pinned to points of the mesh, by anchor */
  labels: Map<string, HTMLElement>
}

export const createFilm = (): FilmState => ({
  section: null,
  stepH: 0,
  zones: [],
  flat: false,
  yaw: 0,
  dragging: false,
  labels: new Map(),
})

export type { Thickness }

/** The steps of the film, in order: the opening, the two faces, the third direction, the open core. */
export const FILM_STEPS = 4
