import * as THREE from 'three'
import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { grainTexture } from '../../facade/three/kit'
import { block, planarUV } from '../../facade/three/unit/parts'

/**
 * The wall panels as the client draws them, in metres. A panel lies along x (its length), its 600 mm
 * width up y, its thickness along z; its inner face (the one with the ferrules) looks out along +z.
 *
 *   30 mm solid:       7.5 cover | 15 RTARIUM zone | 7.5 cover. The zone stands 15 mm proud along the top and the
 *                      far end (a tongue tapered from 15 mm at its root to 6 at its tip) and 15 mm short along the
 *                      foot and the near end: the male / female joint on all four sides (the client's 30 mm drawings).
 *   100 mm SIP:        two 15 mm leaves (7 cover + 6 RTARIUM + 2 cover) on a 70 mm EPS/SPS core; the core,
 *                      stay-in-place, stands 20 mm proud along the top and the far end and 20 mm short
 *                      along the foot and the near end (the client's 20 mm recess). GI tie-clips (2 mm
 *                      plate, 86 mm over its lugs) go through the core 100 mm in from the long edges in a
 *                      100 / 800 rhythm; 3 mm GRP rods run along the meshes through the lugs.
 *
 * Ferrule inserts and tie holes stand as the 30 mm plan has them (see piece.ts: FERRULE_LINES, TIE_HOLES).
 */

export const MM = 0.001
export const W = 0.6
export const FULL = 5.8
/** the piece the panels are opened on: its first metre */
export const PIECE = 1.0

/** the client's 30 mm drawing: 7.5 cover | 15 RTARIUM | 7.5 cover; a 15 mm tongue (tapered, 15 at its root to 6 at its
 *  tip) and a 15 mm recess on the four sides */
export const S30 = { cover: 7.5 * MM, zone: 15 * MM, key: 15 * MM, tongue: 15 * MM, tip: 6 * MM }
export const S100 = { outer: 7 * MM, mesh: 6 * MM, inner: 2 * MM, leaf: 15 * MM, core: 70 * MM, recess: 20 * MM }
export const TIE = { t: 2 * MM, w: 20 * MM, body: 76 * MM, over: 86 * MM, lug: 9 * MM }
/** the GRP rods' line: through the lugs' holes, in the meshes */
export const ROD_Z = 38.75 * MM
export const ROD_R = 1.5 * MM

/** the tie-clips' grid: two rows 100 mm in from the long edges, 100 / 800 along the length */
export function gridX(len: number) {
  const out: number[] = []
  for (let k = 0; k < len; k++) for (const x of [k + 0.1, k + 0.9]) if (x < len - 0.05) out.push(x)
  return out
}
export const GRID_Y = [0.1, 0.5]

/** a box between two corners, its texture projected at one size whatever the box's shape (a tile to the metre) */
export function slab(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, k = 1) {
  return planarUV(block([x0, y0, z0], [x1, y1, z1]).toNonIndexed(), k)
}

/**
 * A geometry's triangles sorted into three groups, so it can take three materials (`[inner, edge, outer]`): the
 * faces looking out along +`axis` (the inner face, smooth from the mould) first, the edges and cuts next, and the
 * faces looking out along −`axis` (the outer face, rough) last.
 */
export function faceEdge(g: THREE.BufferGeometry, axis: 'x' | 'y' | 'z' = 'z') {
  const src = g.index ? g.toNonIndexed() : g
  const n = src.getAttribute('normal')
  const k = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  const faces: number[] = []
  const edges: number[] = []
  const backs: number[] = []
  for (let t = 0; t < n.count / 3; t++) {
    const c = n.getComponent(t * 3, k)
    ;(c > 0.5 ? faces : c < -0.5 ? backs : edges).push(t)
  }
  const order = [...faces, ...edges, ...backs]
  const out = new THREE.BufferGeometry()
  for (const name of Object.keys(src.attributes)) {
    const a = src.getAttribute(name) as THREE.BufferAttribute
    const arr = new (a.array.constructor as Float32ArrayConstructor)(a.array.length)
    order.forEach((t, i) => {
      for (let v = 0; v < 3; v++) for (let c = 0; c < a.itemSize; c++) arr[(i * 3 + v) * a.itemSize + c] = a.array[(t * 3 + v) * a.itemSize + c]
    })
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize))
  }
  out.addGroup(0, faces.length * 3, 0)
  out.addGroup(faces.length * 3, edges.length * 3, 1)
  out.addGroup((faces.length + edges.length) * 3, backs.length * 3, 2)
  out.computeBoundingBox()
  out.computeBoundingSphere()
  if (src !== g) src.dispose()
  return out
}

/** several boxes as one, sorted into faces and edges */
export function slabs(parts: THREE.BufferGeometry[], axis: 'x' | 'y' | 'z' = 'z') {
  const m = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!
  parts.forEach((p) => p.dispose())
  const g = faceEdge(m, axis)
  m.dispose()
  return g
}

/* ---- the panels' own surface: a concrete wall's ------------------------------------------------ */

/**
 * Seamless maps of a plain concrete wall's skin (owner, 2 Nov 2026: "how a normal concrete wall's outer layer looks"):
 * a neutral grey with cloudy tone, fine sand, aggregate specks and open bug holes, and the sandier cast edge; each with
 * its relief as a normal map. One set serves both faces (the outer one a little darker and deeper), so they stay light.
 */
export const TEXTURES = ['/img/walls/tex/face.jpg', '/img/walls/tex/face-n.jpg', '/img/walls/tex/edge.jpg', '/img/walls/tex/edge-n.jpg']

export interface WallTextures {
  face: THREE.Texture
  faceN: THREE.Texture
  edge: THREE.Texture
  edgeN: THREE.Texture
}

/** the face (0.75 m to the tile) and the cast edge (a quarter metre) */
export function useWallTextures(): WallTextures {
  const [face, faceN, edge, edgeN] = useTexture(TEXTURES)
  return useMemo(() => {
    for (const t of [face, faceN, edge, edgeN]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = 4
    }
    for (const t of [face, edge]) t.colorSpace = THREE.SRGBColorSpace
    for (const t of [face, faceN]) t.repeat.set(4 / 3, 4 / 3)
    for (const t of [edge, edgeN]) t.repeat.set(4, 4)
    return { face, faceN, edge, edgeN }
  }, [face, faceN, edge, edgeN])
}

/** the GI tie-clip: a 2 mm plate, 76 × 20 mm, a lug at each end with its hole; long axis along z, flat in y-z */
export function tieGeometry() {
  const s = new THREE.Shape()
  const hb = TIE.body / 2
  const hw = TIE.w / 2
  const r = 2 * MM
  // each lug 9 mm high, its round end 5 mm out (86 over the lugs); each oval hole 7.5 mm along the plate, 5.4 across
  const lug = TIE.lug / 2
  const lc = hb + 0.5 * MM
  s.moveTo(-hb + r, -hw)
  s.lineTo(hb - r, -hw)
  s.quadraticCurveTo(hb, -hw, hb, -hw + r)
  s.lineTo(hb, -lug)
  s.lineTo(lc, -lug)
  s.absarc(lc, 0, lug, -Math.PI / 2, Math.PI / 2, false)
  s.lineTo(hb, lug)
  s.lineTo(hb, hw - r)
  s.quadraticCurveTo(hb, hw, hb - r, hw)
  s.lineTo(-hb + r, hw)
  s.quadraticCurveTo(-hb, hw, -hb, hw - r)
  s.lineTo(-hb, lug)
  s.lineTo(-lc, lug)
  s.absarc(-lc, 0, lug, Math.PI / 2, (3 * Math.PI) / 2, false)
  s.lineTo(-hb, -lug)
  s.lineTo(-hb, -hw + r)
  s.quadraticCurveTo(-hb, -hw, -hb + r, -hw)
  for (const cx of [-ROD_Z, ROD_Z]) {
    const h = new THREE.Path()
    h.absellipse(cx, 0, 3.75 * MM, 2.7 * MM, 0, Math.PI * 2, true, 0)
    s.holes.push(h)
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: TIE.t, bevelEnabled: false, curveSegments: 14 })
  // the shape was drawn in its own x (the plate's length) and y (its width): length to z, width to y, plate thickness to x
  g.translate(0, 0, -TIE.t / 2)
  g.rotateY(Math.PI / 2)
  return g
}

/** an M8 ferrule as seen in the face: a zinc rim, flush, round its dark threaded bore */
export function ferruleRim() {
  const g = new THREE.CylinderGeometry(6 * MM, 6 * MM, 0.6 * MM, 28)
  g.rotateX(Math.PI / 2)
  return g
}
export function ferruleBore() {
  const g = new THREE.CircleGeometry(4 * MM, 24)
  return g
}
/** the insert itself, cast into the panel: a 10 mm sleeve, `len` long, behind its rim */
export function ferruleBody(len: number) {
  const g = new THREE.CylinderGeometry(5 * MM, 5 * MM, len, 22, 1)
  g.rotateX(Math.PI / 2)
  g.translate(0, 0, -len / 2)
  return g
}

export interface WallKit {
  /** the cast concrete: a warm grey, smooth from the mould (the inner face) */
  concrete: THREE.MeshStandardMaterial
  /** the cast edges and cuts: rougher, a little darker, with open pores */
  edge: THREE.MeshStandardMaterial
  /** the outer face: sandy and rough, its pores open */
  outer: THREE.MeshStandardMaterial
  /** the concrete round the meshes, which turns to a ghost when a panel is opened */
  zone: THREE.MeshStandardMaterial
  /** the rest of the panel beyond the piece, which fades when the piece is opened */
  rest: THREE.MeshStandardMaterial
  restCore: THREE.MeshStandardMaterial
  /** the EPS/SPS core: white beads */
  core: THREE.MeshStandardMaterial
  /** galvanised steel (the tie-clips), zinc-plated steel (the ferrules) */
  galv: THREE.MeshStandardMaterial
  zinc: THREE.MeshStandardMaterial
  bore: THREE.MeshBasicMaterial
  /** the GRP rods */
  grp: THREE.MeshStandardMaterial
  catcher: THREE.ShadowMaterial
}

/** the lightened copies of the photographs' maps (made once each, shared, never disposed with a kit) */
const pales = new WeakMap<object, THREE.CanvasTexture>()
const kept = new WeakSet<THREE.Texture>()
/**
 * A concrete map taken up towards white, keeping `keep` of its darkness (its pores, specks and cloud stay, fainter): a
 * light-coloured concrete multiplies the map, and the photographs' grey would turn any light tint dull.
 */
function pale(t: THREE.Texture, keep: number) {
  const img = t.image as CanvasImageSource & { width: number; height: number }
  let out = pales.get(img)
  if (!out) {
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height)
    for (let i = 0; i < d.data.length; i += 4) for (let k = 0; k < 3; k++) d.data[i + k] = 255 - (255 - d.data[i + k]) * keep
    g.putImageData(d, 0, 0)
    out = new THREE.CanvasTexture(c)
    out.colorSpace = THREE.SRGBColorSpace
    out.wrapS = out.wrapT = THREE.RepeatWrapping
    out.anisotropy = t.anisotropy
    out.repeat.copy(t.repeat)
    pales.set(img, out)
    kept.add(out)
  }
  return out
}

/**
 * The panels' materials. Given the concrete maps (`useWallTextures`), the faces wear a concrete wall's skin and the
 * edges the cast edge; without them (a scene that never comes close) a fine grain.
 *
 * `finish`: the panel as the page shows it on yellow, in a LIGHT PINK concrete (owner, 3 Nov 2026: graphite was "too
 * dark with yellow"), its maps' pores and specks kept; or the photographs' NATURAL grey, where the panel stands on black
 * (the story's boxes).
 */
export function wallKit(tex?: WallTextures, finish: 'pink' | 'natural' = 'pink'): WallKit {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ transparent: true, ...p })
  const g = finish === 'pink'
  /** the pink: the maps taken up towards white and tinted, a little of the tint given off so it stays light in shade (the
   *  edges a shade deeper, so the panel's outline reads) */
  const tone = g ? { face: '#ffe3de', edge: '#f8d0ca', outer: '#fddcd7', zone: '#ffe6e2' } : { face: '#ffffff', edge: '#ffffff', outer: '#ecebe7', zone: '#f2efe9' }
  const faceMap = tex && g ? pale(tex.face, 0.38) : tex?.face
  const edgeMap = tex && g ? pale(tex.edge, 0.45) : tex?.edge
  const glow = (m: THREE.Texture | undefined, c: string) => (g ? { emissive: c, emissiveMap: m ?? null, emissiveIntensity: 0.3 } : {})
  const grain = () => (g ? grainTexture('#f9e1dd', 6400, [214, 242], 1) : grainTexture('#dcd6cb', 6400, [160, 224], 1))
  const face = (p: THREE.MeshStandardMaterialParameters) =>
    tex
      ? std({ color: tone.face, map: faceMap, normalMap: tex.faceN, normalScale: new THREE.Vector2(1, 1), roughness: 0.9, ...glow(faceMap, '#fbd3cd'), ...p })
      : std({ color: '#ffffff', map: grain(), roughness: 0.86, ...p })
  return {
    concrete: face({}),
    edge: tex
      ? std({ color: tone.edge, map: edgeMap, normalMap: tex.edgeN, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95, ...glow(edgeMap, '#f0c3bc') })
      : std({ color: g ? '#f8dfdb' : '#d2cbbf', map: grain(), roughness: 0.92 }),
    outer: tex
      ? std({ color: tone.outer, map: faceMap, normalMap: tex.faceN, normalScale: new THREE.Vector2(1.35, 1.35), roughness: 0.95, ...glow(faceMap, '#f8cdc7') })
      : std({ color: g ? '#f8dfdb' : '#cfc8bb', map: grain(), roughness: 0.95 }),
    zone: face({ color: tex ? tone.zone : g ? '#fbe6e2' : '#d3ccc0' }),
    rest: face({}),
    restCore: std({ color: '#f1efe8', map: grainTexture('#f1efe8', 9000, [196, 238], 3), roughness: 1 }),
    core: std({ color: '#f1efe8', map: grainTexture('#f1efe8', 9000, [196, 238], 3), roughness: 1 }),
    galv: std({ color: '#b4b9bd', metalness: 0.7, roughness: 0.34 }),
    zinc: std({ color: '#c3c6c4', metalness: 0.75, roughness: 0.3 }),
    bore: new THREE.MeshBasicMaterial({ color: '#121212', transparent: true, toneMapped: false }),
    // 3 mm GRP rod: pale, as in the owner's photograph of the mesh
    grp: std({ color: '#e6d6a4', roughness: 0.45, emissive: '#2a2416' }),
    catcher: new THREE.ShadowMaterial({ color: '#4a3000', transparent: true, opacity: 0.22, depthWrite: false }),
  }
}

/**
 * Disposes the kit's materials and the grain textures it made (the photographs' textures are shared, and kept). A
 * scene may hand over its own kit with more in it (sets of materials for one mesh): those are walked too, and
 * anything that is not a material is left alone, so a cleanup never throws (a throw there takes the whole stage down).
 */
export function disposeWallKit(m: WallKit | Record<string, unknown>) {
  const seen = new Set<THREE.Texture>()
  const done = new Set<THREE.Material>()
  const shared = new Set(TEXTURES)
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk)
    if (!(x instanceof THREE.Material) || done.has(x)) return
    done.add(x)
    const map = (x as THREE.MeshStandardMaterial).map
    const url = (map?.image as HTMLImageElement | undefined)?.src ?? ''
    if (map && !seen.has(map) && !kept.has(map) && ![...shared].some((u) => url.endsWith(u))) {
      seen.add(map)
      map.dispose()
    }
    x.dispose()
  }
  Object.values(m).forEach(walk)
}

/** a material's opacity; fully hidden it stops drawing, see-through it stops writing depth */
export function fade(m: THREE.Material, o: number) {
  m.opacity = o
  m.visible = o > 0.004
  m.depthWrite = o > 0.97
}
