import * as THREE from 'three'
import { grainTexture } from '../kit'
import { block, merge, planarUV, unitMaterials, type UnitMaterials } from '../unit/parts'

/**
 * RTARIUM rainscreen cladding, for the Rainscreen page: the façade of the client's reference (a
 * tower in warm, pinkish concrete), tall thin panels in columns between ribbon windows, their open
 * joints staggered from one column to the next; and behind each column the rainscreen itself, from
 * the wall out: the wall, mineral wool, brackets through it, vertical rails on the brackets, a hanger
 * rail at each panel's head, the ventilated cavity, the 12 mm panel hooked on with clips on its back.
 *
 * Sizes are illustrative (storey 3.3 m, panels 1.2 m wide), not a product drawing. Axes: x along the
 * façade, y up, z out of the building; the face of the wall is z = 0.
 */

/** the grid: a panel column, a window strip, a storey, the open joint between panels */
export const G = { pw: 1.2, ww: 0.62, fh: 3.3, joint: 0.012 } as const
/** where each layer sits in depth (m) */
export const D = {
  wall: [-0.24, 0],
  wool: [0, 0.08],
  /** a bracket stands off the wall to here */
  arm: 0.112,
  rail: [0.09, 0.15],
  hanger: [0.15, 0.158],
  panel: [0.164, 0.176],
  /** the window, set back in the opening */
  window: [0.02, 0.1],
} as const
export const ZM = (D.panel[0] + D.panel[1]) / 2

type Rect = [number, number, number, number]

/** a column's or a strip's left edge: panel columns and window strips alternate, starting with a panel */
export const colX = (k: number) => k * (G.pw + G.ww)
export const stripX = (k: number) => colX(k) + G.pw
export const wallWidth = (cols: number) => cols * G.pw + (cols - 1) * G.ww

/** the panels of a column, bottom to top: storey-high, every other column offset by half a storey */
export function columnPanels(k: number, storeys: number): Rect[] {
  const H = storeys * G.fh
  const x0 = colX(k)
  const cuts = new Set<number>([0, H])
  const off = k % 2 ? G.fh / 2 : 0
  for (let y = off; y < H - 0.01; y += G.fh) if (y > 0.01) cuts.add(y)
  const ys = [...cuts].sort((a, b) => a - b)
  const j = G.joint / 2
  const out: Rect[] = []
  for (let i = 0; i < ys.length - 1; i++) out.push([x0 + j, ys[i] + j, x0 + G.pw - j, ys[i + 1] - j])
  return out
}

export interface PanelOpts {
  /** a rectangle where the outer half of the skin is taken away, so the textile shows at mid-thickness */
  cut?: Rect
}

/** one panel, 12 mm, as boxes round its cut (the back half stays under the cut) */
export function panelBoxes([a, b, c, d]: Rect, { cut }: PanelOpts = {}, parts: THREE.BufferGeometry[] = []) {
  const [zb, zf] = D.panel
  const zm = ZM - 0.002
  if (!cut || cut[2] <= a || cut[0] >= c || cut[3] <= b || cut[1] >= d) {
    parts.push(block([a, b, zb], [c, d, zf]))
    return parts
  }
  const [ca, cb, cc, cd] = [Math.max(a, cut[0]), Math.max(b, cut[1]), Math.min(c, cut[2]), Math.min(d, cut[3])]
  parts.push(block([ca, cb, zb], [cc, cd, zm]))
  for (const [p, q, r, s] of [
    [a, b, c, cb],
    [a, cd, c, d],
    [a, cb, ca, cd],
    [cc, cb, c, cd],
  ])
    if (r - p > 1e-4 && s - q > 1e-4) parts.push(block([p, q, zb], [r, s, zf]))
  return parts
}

/** every panel of a wall of `cols` columns; `skip` leaves some out (by column and index), `cut` opens one */
export function panelsGeometry(cols: number, storeys: number, o: PanelOpts & { skip?: (k: number, i: number) => boolean } = {}) {
  const parts: THREE.BufferGeometry[] = []
  for (let k = 0; k < cols; k++)
    columnPanels(k, storeys).forEach((r, i) => {
      if (!o.skip?.(k, i)) panelBoxes(r, o, parts)
    })
  return planarUV(merge(parts), 0.55)
}

/** the wall behind the panel columns and the spandrels of the window strips; the windows stand in its openings */
export function wallGeometry(cols: number, storeys: number) {
  const H = storeys * G.fh
  const [z0, z1] = D.wall
  const parts: THREE.BufferGeometry[] = []
  for (let k = 0; k < cols; k++) parts.push(block([colX(k) - 0.02, 0, z0], [colX(k) + G.pw + 0.02, H, z1]))
  // at each floor a spandrel across the strip, from the slab to the sill
  for (let k = 0; k < cols - 1; k++)
    for (let s = 0; s <= storeys; s++) {
      const y = s * G.fh
      parts.push(block([stripX(k) + 0.02, Math.max(0, y - 0.32), z0], [stripX(k) + G.ww - 0.02, Math.min(H, y + 0.5), z1 - 0.04]))
    }
  return planarUV(merge(parts), 0.9)
}

/** mineral wool on the wall behind each panel column, in boards with fine joints */
export function woolGeometry(cols: number, storeys: number) {
  const H = storeys * G.fh
  const [z0, z1] = D.wool
  const gap = 0.008
  const parts: THREE.BufferGeometry[] = []
  for (let k = 0; k < cols; k++) {
    const a = colX(k) - 0.015
    const c = colX(k) + G.pw + 0.015
    const nx = 2
    const ny = Math.round(H / 1.2)
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++)
        parts.push(block([a + ((c - a) * i) / nx + gap / 2, (H * j) / ny + gap / 2, z0], [a + ((c - a) * (i + 1)) / nx - gap / 2, (H * (j + 1)) / ny - gap / 2, z1]))
  }
  return planarUV(merge(parts), 2.2)
}

/** the two rails of a column, a little in from its edges */
export const railXs = (k: number) => [colX(k) + 0.2, colX(k) + G.pw - 0.2]
/** brackets up a rail, every 1.1 m */
export const bracketYs = (storeys: number) => {
  const out: number[] = []
  for (let y = 0.45; y < storeys * G.fh - 0.2; y += 1.1) out.push(y)
  return out
}

/**
 * An L bracket at each point: a plate on the wall (a dark thermal pad under it) and its arm out
 * through the wool, against the rail's web on the side towards the column's edge, where they are
 * bolted together through a slotted hole.
 */
export const armSide = (k: number, x: number) => (x > colX(k) + G.pw / 2 ? 1 : -1)
export function bracketGeometry(cols: number, storeys: number) {
  const steel: THREE.BufferGeometry[] = []
  const pads: THREE.BufferGeometry[] = []
  for (let k = 0; k < cols; k++)
    for (const x of railXs(k)) {
      const s = armSide(k, x)
      const xa = x + s * 0.0046
      const xp = x + s * 0.02
      for (const y of bracketYs(storeys)) {
        pads.push(block([xp - 0.03, y - 0.075, 0], [xp + 0.03, y + 0.075, 0.006]))
        steel.push(block([xp - 0.028, y - 0.07, 0.006], [xp + 0.028, y + 0.07, 0.012]))
        steel.push(block([xa - 0.003, y - 0.07, 0.012], [xa + 0.003, y + 0.07, D.arm]))
        for (const dy of [-0.04, 0.04]) steel.push(new THREE.CylinderGeometry(0.007, 0.007, 0.02, 8).rotateX(Math.PI / 2).translate(xp + s * 0.012, y + dy, 0.016))
      }
    }
  return { steel: merge(steel), pads: merge(pads) }
}

/** vertical T rails, a length per storey with a gap at each floor; a hanger rail across each panel's head */
export function railGeometry(cols: number, storeys: number, skip?: number) {
  const rails: THREE.BufferGeometry[] = []
  const hangers: THREE.BufferGeometry[] = []
  const [r0, r1] = D.rail
  for (let k = 0; k < cols; k++) {
    for (const x of railXs(k).filter((x) => skip === undefined || Math.abs(x - skip) > 1e-6))
      for (let s = 0; s < storeys; s++) {
        const y0 = s * G.fh + 0.02
        const y1 = (s + 1) * G.fh - 0.02
        rails.push(block([x - 0.0016, y0, r0], [x + 0.0016, y1, r1 - 0.004]))
        rails.push(block([x - 0.04, y0, r1 - 0.004], [x + 0.04, y1, r1]))
      }
    for (const [a, , c, d] of columnPanels(k, storeys)) {
      hangers.push(block([a + 0.06, d - 0.2, D.hanger[0]], [c - 0.06, d - 0.15, D.hanger[1]]))
      // the clips on the panel's back that hook over it
      for (const x of [a + 0.16, c - 0.16]) hangers.push(block([x - 0.04, d - 0.17, D.hanger[1]], [x + 0.04, d - 0.12, D.panel[0]]))
    }
  }
  return { rails: merge(rails), hangers: merge(hangers) }
}

/** the ribbon windows: a frame up each strip, a transom at every floor, the cavity closed at the reveal */
export function windowGeometry(cols: number, storeys: number) {
  const H = storeys * G.fh
  const [z0, z1] = D.window
  const F = 0.05
  const frames: THREE.BufferGeometry[] = []
  const glass: THREE.BufferGeometry[] = []
  const infill: THREE.BufferGeometry[] = []
  for (let k = 0; k < cols - 1; k++) {
    const a = stripX(k)
    const c = a + G.ww
    // the reveal: a dark flashing lining the opening, from the window out to the face of the panels
    frames.push(block([a - 0.004, 0, z0], [a + 0.004, H, D.panel[1] - 0.004]))
    frames.push(block([c - 0.004, 0, z0], [c + 0.004, H, D.panel[1] - 0.004]))
    frames.push(block([a, 0, z0], [a + F, H, z1]))
    frames.push(block([c - F, 0, z0], [c, H, z1]))
    for (let s = 0; s <= storeys; s++) {
      const y = s * G.fh
      for (const yy of [y - 0.32, y + 0.5]) if (yy > 0.02 && yy < H - 0.02) frames.push(block([a + F, yy - F / 2, z0], [c - F, yy + F / 2, z1]))
      // a dark spandrel panel across the floor, and the vision glass between floors
      infill.push(block([a + F, Math.max(0, y - 0.32), (z0 + z1) / 2 - 0.012], [c - F, Math.min(H, y + 0.5), (z0 + z1) / 2 + 0.008]))
      const ga = y + 0.5 + F / 2
      const gb = (s + 1) * G.fh - 0.32 - F / 2
      if (s < storeys && gb > ga) glass.push(block([a + F, ga, (z0 + z1) / 2 - 0.01], [c - F, gb, (z0 + z1) / 2 + 0.01]))
    }
  }
  return { frames: merge(frames), glass: merge(glass), infill: merge(infill) }
}

/**
 * The materials: the unit page's own (cast concrete with its grain and relief, coated glazing with a
 * sky in it, satin anthracite frames, galvanized steel), the concrete tinted to the reference's
 * warm pink, so the façade looks like the client's tower; a dark pad for the brackets' thermal breaks.
 */
export interface RainMaterials extends UnitMaterials {
  pad: THREE.MeshStandardMaterial
  /** the wall's own concrete, plain grey */
  wall: THREE.MeshStandardMaterial
}

export const PINK = '#fdd9ce'

export function rainMaterials(): RainMaterials {
  const m = unitMaterials()
  m.concrete.color.set(PINK)
  m.concrete.roughness = 0.92
  // the wall: the concrete's own grain, plain and a little greyer than the panels
  const wall = m.concrete.clone()
  wall.color.set('#d8d6d2')
  const pad = new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.8, transparent: true })
  // stone wool, a warm grey: on the yellow ground a yellow wool would vanish
  m.insulation.map?.dispose()
  m.insulation.map = grainTexture('#c2bdb1', 9000, [120, 200], 3)
  m.insulation.color.set('#ffffff')
  return { ...m, wall, pad }
}

export function disposeRainMaterials(m: RainMaterials) {
  const seen = new Set<THREE.Texture>()
  for (const v of Object.values(m) as THREE.MeshStandardMaterial[]) {
    for (const t of [v.map, v.bumpMap, v.envMap]) {
      if (t && !seen.has(t)) {
        seen.add(t)
        t.dispose()
      }
    }
    v.dispose()
  }
}
