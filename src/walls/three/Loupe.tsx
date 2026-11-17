import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { LabelBus } from '../../facade/three/kit'

/**
 * A close look at a small part, in the card itself (a phone's panel steps: the tie hole, the ferrules, the GRP grid, the
 * tie-clips, too small to read whole): a ring round the part where it is on the panel, a hairline from it, and a circle
 * in a free corner of the card with the part drawn close, as the semiconductor build's lens draws the mesh. The scene is
 * drawn as ever, then once more from near the part into a picture, laid in the circle on top. Only while a small part is
 * the one picked; it fades in and out.
 */

/** the circle's size (a share of the card's shorter side), where it stands (a share of the card, from its top left) */
const SIZE = 0.21
const AT = { x: 0.8, y: 0.24 }
/** how much nearer than the card's camera the close look stands */
const NEAR = 0.035
const BG = new THREE.Color('#ecebe6')
const INK = new THREE.Color('#0b0b0b')

export function Loupe({ bus, focus, small }: { bus: LabelBus; focus: { current: string | null }; small: readonly string[] }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const kit = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(512, 512, { samples: 4 })
    const near = new THREE.PerspectiveCamera(18, 1, 0.001, 60)
    const hud = new THREE.Scene()
    const eye = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)
    const fill = new THREE.MeshBasicMaterial({ map: target.texture, transparent: true, toneMapped: false, depthTest: false })
    const ink = new THREE.MeshBasicMaterial({ color: INK, transparent: true, toneMapped: false, depthTest: false })
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 72), fill)
    const rim = new THREE.Mesh(new THREE.RingGeometry(1, 1.035, 72), ink)
    const mark = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 48), ink)
    const leader = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: INK, transparent: true, toneMapped: false, depthTest: false }))
    hud.add(leader, disc, rim, mark)
    return { target, near, hud, eye, fill, ink, disc, rim, mark, leader }
  }, [])
  useEffect(
    () => () => {
      kit.target.dispose()
      kit.fill.dispose()
      kit.ink.dispose()
      for (const m of [kit.disc, kit.rim, kit.mark]) m.geometry.dispose()
      kit.leader.geometry.dispose()
      ;(kit.leader.material as THREE.Material).dispose()
    },
    [kit],
  )

  const shown = useRef(0)
  const last = useRef<string | null>(null)
  const at = useMemo(() => new THREE.Vector3(), [])
  const on = useMemo(() => new THREE.Vector3(), [])
  const clear = useMemo(() => new THREE.Color(), [])

  // (a priority above 0: this frame draws the scene itself, then the close look over it)
  useFrame((_, delta) => {
    gl.render(scene, camera)
    const id = focus.current
    const want = id && small.includes(id) ? 1 : 0
    if (want) last.current = id
    shown.current += (want - shown.current) * Math.min(1, delta * 9)
    if (Math.abs(want - shown.current) < 0.005) shown.current = want
    else invalidate()
    const k = shown.current
    const anchor = last.current ? bus.anchors.get(last.current) : null
    if (k <= 0 || !anchor) return

    // the close look: along the card's own line of sight to the part, much nearer
    anchor.getWorldPosition(at)
    const d = camera.position.distanceTo(at)
    kit.near.position.copy(camera.position).sub(at).normalize().multiplyScalar(d * NEAR).add(at)
    kit.near.lookAt(at)
    kit.near.updateMatrixWorld()
    const was = gl.getRenderTarget()
    const alpha = gl.getClearAlpha()
    gl.getClearColor(clear)
    gl.setRenderTarget(kit.target)
    gl.setClearColor(BG, 1)
    gl.clear()
    gl.render(scene, kit.near)
    gl.setRenderTarget(was)
    gl.setClearColor(clear, alpha)

    // the circle and the ring, in the card's own pixels (y up)
    const w = size.width
    const h = size.height
    kit.eye.right = w
    kit.eye.top = h
    kit.eye.updateProjectionMatrix()
    const r = Math.min(w, h) * SIZE
    const cx = w * AT.x
    const cy = h * (1 - AT.y)
    kit.disc.position.set(cx, cy, 0)
    kit.disc.scale.setScalar(r * (0.85 + 0.15 * k))
    kit.rim.position.copy(kit.disc.position)
    kit.rim.scale.copy(kit.disc.scale)
    // the part where it stands on the card
    on.copy(at).project(camera)
    const px = (on.x * 0.5 + 0.5) * w
    const py = (on.y * 0.5 + 0.5) * h
    kit.mark.position.set(px, py, 0)
    kit.mark.scale.setScalar(Math.min(w, h) * 0.035)
    // the hairline: from the ring's edge to the circle's
    const dx = cx - px
    const dy = cy - py
    const len = Math.max(1, Math.hypot(dx, dy))
    const a = kit.mark.scale.x * 1.12
    const b = kit.disc.scale.x * 1.035
    const pos = kit.leader.geometry.getAttribute('position') as THREE.BufferAttribute
    pos.setXYZ(0, px + (dx / len) * a, py + (dy / len) * a, 0)
    pos.setXYZ(1, cx - (dx / len) * b, cy - (dy / len) * b, 0)
    pos.needsUpdate = true
    kit.fill.opacity = k
    kit.ink.opacity = k
    ;(kit.leader.material as THREE.LineBasicMaterial).opacity = k * 0.8
    const auto = gl.autoClear
    gl.autoClear = false
    gl.clearDepth()
    gl.render(kit.hud, kit.eye)
    gl.autoClear = auto
  }, 1)
  return null
}
