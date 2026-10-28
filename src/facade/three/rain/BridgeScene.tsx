import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshInset } from '../MeshInset'
import { Anchor } from '../Stage3D'
import { PITCH_M, type LabelBus, type Shot } from '../kit'
import { mixShot } from '../ScrubRig'
import { smooth, type Progress } from '../../progress'
import { block, merge, planarUV } from '../unit/parts'
import { disposeRainMaterials, rainMaterials } from './parts'

/**
 * How RTARIUM bridges the gap (Rainscreen page): one RTARIUM rainscreen panel in the warm pink of the
 * reference, 12 mm thin, standing on the yellow ground over its shadow with the part of the rainscreen
 * that carries it (two rails, a hanger rail at its head, brackets). One scene plays each answer, the
 * camera moving only between them (the Unitized answers' rule), the panel always inside the room right
 * of the words:
 *
 *   0  a real concrete face   its face, cast concrete, the daylight across it
 *   1  12 mm, light to hang   its top corner, close: 12 mm, RTARIUM at mid-thickness in a cut; then a
 *                             fluted relief rises on the face (the design's own depth) and goes again
 *   2  under 30 kg/m²         one square metre marked out on its face
 *   3  anchors cast in        its back: ferrules cast in, clips on them; it is lifted and hooks on
 *   4  nothing to age or rust the same panel: its face lifts away inside a concrete border, and RTARIUM
 *                             shows all through it, in three dimensions; then the face settles back
 *   5  up to 6 m              it grows in one piece from 3 to 6 m, the rails with it; grown, RTARIUM in
 *                             its cut and its 12 mm edge are marked (the height is in the words)
 *
 * `t` is the run as answers (answer k over k..k+1), eased by the section.
 */

const PW = 1.2
const PH = 3
const TH = 0.012
const MAX_H = 6
/** the cut on the near edge, high up: the outer half of the skin taken back to the textile */
const CUT: [number, number, number, number] = [PW / 2 - 0.26, PH - 1.06, PW / 2 - 0.035, PH - 0.12]
const ZM = TH / 2
const RAILS = [-0.38, 0.38]
const CLIPS = [-0.4, 0.4]
/** the relief: flutes 30 mm wide at 75 mm centres, 8 mm proud of the skin */
const RIB = { w: 0.03, pitch: 0.075, d: 0.008 }
/** the textile answer: the face lifts away inside this border; the textile is drawn 2.5 times its pitch so it reads at this size */
const BORDER = 0.03
const SHOW = 2.5
/** the square metre marked out on the face */
const SQ = { cx: -0.02, cy: 1.35, s: 1 }
const UV = 1.05

/**
 * The panel at a height: one piece of skin, its cut at its head (the back half staying under it).
 * Built again as it grows, so the concrete's grain runs on unbroken from foot to head.
 */
function panelGeometry(h: number) {
  const x0 = -PW / 2
  const x1 = PW / 2
  const [a, b0, c, d0] = CUT
  const b = b0 + h - PH
  const d = d0 + h - PH
  const zm = ZM - 0.0008
  return planarUV(merge([block([x0, 0, 0], [x1, b, TH]), block([x0, d, 0], [x1, h, TH]), block([x0, b, 0], [a, d, TH]), block([c, b, 0], [x1, d, TH]), block([a, b, 0], [c, d, zm])]), UV)
}

/** the flutes, standing on the face (z from its face out), stopping short of the cut */
function reliefGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const [a, b] = CUT
  for (let x = -PW / 2 + 0.05; x + RIB.w < PW / 2 - 0.03; x += RIB.pitch) {
    const top = x + RIB.w > a - 0.02 ? b - 0.04 : PH - 0.05
    parts.push(block([x, 0.05, 0], [x + RIB.w, top, RIB.d]))
  }
  return planarUV(merge(parts), UV)
}

/** the height of the panel as the last answer plays (m) */
export const heightAt = (f: number) => PH + (MAX_H - PH) * smooth(0.12, 0.82, f)

export interface BridgeAxis {
  x: number
  y: number
}

function shots(compact: boolean, ax: BridgeAxis): Shot[] {
  const fr: [number, number] = compact ? [0.5, 0.4] : [ax.x, ax.y]
  const k = compact ? 1.45 : 1
  return [
    { target: [0, PH / 2, 0], dist: 13 * k, azim: 28, elev: 5, frame: fr },
    { target: [PW / 2 - 0.2, PH - 0.36, 0.01], dist: 1.9 * k, azim: 54, elev: 30, frame: fr },
    { target: [0, PH / 2 - 0.1, 0], dist: 11.5 * k, azim: 18, elev: 6, frame: fr },
    { target: [0, PH - 0.5, -0.04], dist: 3.8 * k, azim: 212, elev: 15, frame: fr },
    // the whole panel again, framed as its face was: its face lifts away to RTARIUM
    { target: [0, PH / 2, 0], dist: 13 * k, azim: 28, elev: 5, frame: fr },
  ]
}

function tallShot(h: number, compact: boolean, ax: BridgeAxis, aspect: number): Shot {
  // fit the panel's height into the room between the title and the bar (it fills at most 60 % of the
  // screen's height), and its width on a narrow canvas; never closer than the face shot
  const fov = (26 * Math.PI) / 180
  const need = h / (0.6 * 2 * Math.tan(fov / 2))
  const wide = (PW * 3.4) / (2 * Math.tan(fov / 2) * Math.max(0.4, aspect))
  const dist = Math.max(13, need * 1.05, wide) * (compact ? 1.3 : 1)
  return { target: [0, h / 2, 0], dist, azim: 28, elev: 5, frame: compact ? [0.5, 0.4] : [ax.x, 0.52] }
}

export function BridgeScene({ t, bus, compact, axis }: { t: Progress; bus: LabelBus; compact: boolean; axis: { current: BridgeAxis } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)

  const m = useMemo(() => {
    const r = rainMaterials()
    // a finer grain and a little more relief than on the building, seen this close
    r.concrete.bumpScale = 0.6
    r.concrete.roughness = 0.88
    return r
  }, [])
  const catcher = useMemo(() => new THREE.ShadowMaterial({ color: '#4a3000', transparent: true, opacity: 0.22, depthWrite: false }), [])
  const draw = useMemo(
    () => ({
      mark: new THREE.MeshBasicMaterial({ color: '#080808', toneMapped: false, transparent: true, opacity: 0 }),
    }),
    [],
  )
  const geo = useMemo(() => {
    const x0 = -PW / 2
    const x1 = PW / 2
    // the ferrules cast into its back, and a clip bolted to each, hooking over the hanger rail
    const ferrules = merge(CLIPS.map((x) => new THREE.CylinderGeometry(0.014, 0.014, 0.008, 16).rotateX(Math.PI / 2).translate(x, PH - 0.16, 0.002)))
    const clips = merge(
      CLIPS.flatMap((x) => [
        block([x - 0.05, PH - 0.2, -0.006], [x + 0.05, PH - 0.11, 0]),
        block([x - 0.05, PH - 0.11, -0.022], [x + 0.05, PH - 0.098, -0.006]),
        block([x - 0.05, PH - 0.13, -0.024], [x + 0.05, PH - 0.098, -0.022]),
        new THREE.CylinderGeometry(0.007, 0.007, 0.012, 10).rotateX(Math.PI / 2).translate(x, PH - 0.16, -0.009),
      ]),
    )
    // the rails it hangs on: a hanger rail across its head, two vertical T rails, brackets off them
    const hanger = block([x0 + 0.06, PH - 0.15, -0.03], [x1 - 0.06, PH - 0.115, -0.022])
    const rails = merge(RAILS.flatMap((x) => [block([x - 0.04, -0.05, -0.034], [x + 0.04, 1, -0.03]), block([x - 0.0018, -0.05, -0.09], [x + 0.0018, 1, -0.034])]))
    const brackets = merge(
      RAILS.flatMap((x) =>
        [0.5, 1.5, 2.5].flatMap((y) => {
          const s = x > 0 ? 1 : -1
          return [block([x + s * 0.0018, y - 0.07, -0.16], [x + s * 0.0078, y + 0.07, -0.05]), block([x + s * 0.02 - 0.03, y - 0.07, -0.166], [x + s * 0.02 + 0.03, y + 0.07, -0.16])]
        }),
      ),
    )
    // one square metre, its outline a hair proud of the face
    const L = 0.01
    const { cx, cy, s } = SQ
    const sq = merge([
      block([cx - s / 2, cy - s / 2, TH], [cx + s / 2, cy - s / 2 + L, TH + 0.001]),
      block([cx - s / 2, cy + s / 2 - L, TH], [cx + s / 2, cy + s / 2, TH + 0.001]),
      block([cx - s / 2, cy - s / 2, TH], [cx - s / 2 + L, cy + s / 2, TH + 0.001]),
      block([cx + s / 2 - L, cy - s / 2, TH], [cx + s / 2, cy + s / 2, TH + 0.001]),
    ])
    const zm = ZM - 0.0008
    const [ia, ib, ic, id] = [-PW / 2 + BORDER, BORDER, PW / 2 - BORDER, PH - BORDER]
    const framed = planarUV(
      merge([
        block([x0, 0, 0], [x1, PH, zm]),
        block([x0, 0, zm], [x1, ib, TH]),
        block([x0, id, zm], [x1, PH, TH]),
        block([x0, ib, zm], [ia, id, TH]),
        block([ic, ib, zm], [x1, id, TH]),
      ]),
      UV,
    )
    // the cover: the outer half inside the border, round the small cut at the head (so at rest it is the panel as before)
    const [a, b, c, d] = CUT
    const cover = planarUV(
      merge([block([ia, ib, zm], [ic, b, TH]), block([ia, d, zm], [ic, id, TH]), block([ia, b, zm], [a, d, TH]), block([c, b, zm], [ic, d, TH])]),
      UV,
    )
    return { ferrules, clips, hanger, rails, brackets, relief: reliefGeometry(), sq, framed, cover }
  }, [])
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      Object.values(draw).forEach((x) => x.dispose())
      catcher.dispose()
      disposeRainMaterials(m)
    },
    [geo, draw, catcher, m],
  )

  const lift = useRef<THREE.Group>(null)
  const framed = useRef<THREE.Group>(null)
  const cover = useRef<THREE.Mesh>(null)
  const textile = useRef<THREE.Group>(null)
  const small = useRef<THREE.Group>(null)
  const coverMat = useMemo(() => {
    const c = m.concrete.clone()
    c.userData = { ...m.concrete.userData }
    return c
  }, [m])
  useEffect(() => () => coverMat.dispose(), [coverMat])
  const skin = useRef<THREE.Mesh>(null)
  const built = useRef(PH)
  const skinGeo = useMemo(() => panelGeometry(PH), [])
  useEffect(() => () => skin.current?.geometry.dispose(), [])
  const relief = useRef<THREE.Mesh>(null)
  const rails = useRef<THREE.Mesh>(null)
  const top = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)

  useEffect(() => {
    const on = () => invalidate()
    t.listeners.add(on)
    return () => void t.listeners.delete(on)
  }, [t, invalidate])

  useFrame(() => {
    const v = Math.min(5.9999, Math.max(0, t.value))
    const k = Math.floor(v)
    const f = v - k
    const list = shots(compact, axis.current)
    const aspect = size.width / Math.max(1, size.height)
    let shot: Shot
    if (k < 4) shot = mixShot(list[k], list[k + 1], smooth(0.8, 1, f))
    else if (k === 4) shot = mixShot(list[4], tallShot(PH, compact, axis.current, aspect), smooth(0.8, 1, f))
    else shot = tallShot(heightAt(f), compact, axis.current, aspect)
    // RTARIUM: as the edge answer and the textile answer play, the view leans in a little, and lets it go
    if (k === 1 || k === 4) {
      const lean = smooth(0.2, 0.4, f) * (1 - smooth(0.6, 0.78, f))
      shot = { ...shot, dist: shot.dist * (1 - 0.1 * lean) }
    }
    const A = (shot.azim * Math.PI) / 180
    const E = (shot.elev * Math.PI) / 180
    const [tx, ty, tz] = shot.target
    camera.fov = 26
    camera.near = 0.01
    camera.far = 200
    camera.position.set(tx + shot.dist * Math.cos(E) * Math.sin(A), ty + shot.dist * Math.sin(E), tz + shot.dist * Math.cos(E) * Math.cos(A))
    camera.lookAt(tx, ty, tz)
    const fr = shot.frame ?? [0.5, 0.5]
    camera.setViewOffset(size.width, size.height, -(fr[0] - 0.5) * size.width, -(fr[1] - 0.5) * size.height, size.width, size.height)
    camera.updateProjectionMatrix()

    // 1. the design's depth: the flutes rise out of the face, and go back before the next answer
    const r = smooth(1.42, 1.62, v) * (1 - smooth(1.82, 1.94, v))
    if (relief.current) {
      relief.current.visible = r > 0.002
      relief.current.scale.z = Math.max(0.001, r)
    }
    // 2. a square metre, marked out
    const sq = smooth(2.12, 2.3, v) * (1 - smooth(2.84, 2.96, v))
    draw.mark.opacity = sq
    draw.mark.visible = sq > 0.003
    // 3. anchors cast in: lifted a little off its rail, then hooked down onto it
    const at3 = v - 3
    const up = smooth(0.05, 0.25, at3) * (1 - smooth(0.4, 0.62, at3))
    if (lift.current) lift.current.position.y = up * 0.05
    // 4. nothing to age: inside its border the face lifts away, and RTARIUM shows all through the panel
    const inFour = v > 3.82 && v < 5
    const sw = smooth(4.1, 4.32, v) * (1 - smooth(4.74, 4.92, v))
    if (skin.current) skin.current.visible = !inFour
    if (framed.current) framed.current.visible = inFour
    if (cover.current) {
      cover.current.position.z = sw * 0.32
      cover.current.visible = sw < 0.995
    }
    coverMat.opacity = 1 - smooth(0.35, 1, sw)
    coverMat.depthWrite = coverMat.opacity > 0.97
    if (textile.current) textile.current.visible = sw > 0.2
    if (small.current) small.current.visible = sw <= 0.2
    // 5. up to 6 m: grown in one piece, the rails with it
    const h = k >= 5 ? heightAt(f) : PH
    const extra = h - PH
    if (skin.current && Math.abs(h - built.current) > 0.002) {
      const old = skin.current.geometry
      skin.current.geometry = panelGeometry(h)
      if (old !== skinGeo) old.dispose()
      built.current = h
    }
    if (top.current) top.current.position.y = extra
    if (head.current) head.current.position.y = extra
    if (rails.current) rails.current.scale.y = PH + 0.15 + extra
  }, -1)

  const [a, b, c, d] = CUT
  return (
    <group>
      <group ref={lift}>
        {/* one piece of skin, built to its height; what is at its head rises with it */}
        <mesh ref={skin} geometry={skinGeo} material={m.concrete} castShadow receiveShadow />
        <group ref={framed} visible={false}>
          <mesh geometry={geo.framed} material={m.concrete} castShadow receiveShadow />
          <mesh ref={cover} geometry={geo.cover} material={coverMat} castShadow />
          <group ref={textile} position={[0, PH / 2, ZM + 0.0004]} scale={[SHOW, SHOW, 1]} visible={false}>
            <Suspense fallback={null}>
              <MeshInset nx={Math.floor((PW - 2 * BORDER) / (PITCH_M * SHOW))} ny={Math.floor((PH - 2 * BORDER) / (PITCH_M * SHOW))} lod={4} />
            </Suspense>
          </group>
        </group>
        <mesh ref={relief} geometry={geo.relief} material={m.concrete} position={[0, 0, TH]} visible={false} castShadow receiveShadow />
        <mesh geometry={geo.sq} material={draw.mark} />
        <group ref={top}>
          <group ref={small} position={[(a + c) / 2, (b + d) / 2, ZM + 0.0004]}>
            <Suspense fallback={null}>
              <MeshInset nx={Math.floor((c - a) / PITCH_M)} ny={Math.floor((d - b) / PITCH_M)} lod={1.4} />
            </Suspense>
          </group>
          <mesh geometry={geo.ferrules} material={m.darkSteel} />
          <mesh geometry={geo.clips} material={m.steel} castShadow />
          <Anchor bus={bus} id="b-edge" position={[PW / 2 - 0.3, PH, TH / 2]} />
          <Anchor bus={bus} id="b-relief" position={[a - 0.2, b - 0.2, TH + RIB.d]} />
          <Anchor bus={bus} id="b-anchor" position={[CLIPS[1], PH - 0.16, -0.012]} />
          <Anchor bus={bus} id="b-textile" position={[(a + c) / 2 + 0.04, (b + d) / 2 + 0.2, ZM]} />

        </group>
        <Anchor bus={bus} id="b-face" position={[-0.2, 1.1, TH]} />
        <Anchor bus={bus} id="b-sq" position={[SQ.cx + SQ.s / 2, SQ.cy + SQ.s / 2, TH]} />
        <Anchor bus={bus} id="b-side" position={[PW / 2, 2.2, TH / 2]} />
      </group>
      <group ref={head}>
        <mesh geometry={geo.hanger} material={m.darkSteel} />
      </group>
      <mesh ref={rails} geometry={geo.rails} material={m.steel} castShadow />
      <mesh geometry={geo.brackets} material={m.steel} castShadow />
      <mesh position={[0, -0.001, 0.6]} rotation={[-Math.PI / 2, 0, 0]} material={catcher} receiveShadow>
        <planeGeometry args={[30, 30]} />
      </mesh>
    </group>
  )
}
