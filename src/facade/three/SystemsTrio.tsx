import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { approach, createBus } from './kit'
import { MovingKeyLight } from './Stage3D'
import { CastShadows } from './SoftShadow'
import { UnitizedModel } from './UnitizedModel'
import { RainscreenModel } from './RainscreenModel'
import { StudFrameModel } from './StudFrameModel'
import { prefersReducedMotion } from '../../lib/motion'

/**
 * The three façade systems side by side, each above its column: one camera, three models brought
 * to one size and stood on one floor, each turned to the angle that shows how it is built. They
 * rise one after another as the section arrives; the one pointed at turns towards the visitor.
 * While the section is on screen (`live`) each turns a little back and forth, in time.
 */

/** the lowest point of what is drawn under `root`, in world space */
function lowest(root: THREE.Object3D) {
  const box = new THREE.Box3()
  let min = Infinity
  root.updateWorldMatrix(true, true)
  root.traverseVisible((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (!mats.some((m) => m.visible)) return
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      const im = mesh as THREE.InstancedMesh
      im.computeBoundingBox()
      box.copy(im.boundingBox!)
    } else {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      box.copy(mesh.geometry.boundingBox!)
    }
    box.applyMatrix4(mesh.matrixWorld)
    min = Math.min(min, box.min.y)
  })
  return min
}

interface Slot {
  /** the model's own centre (its preview target), brought to the slot's origin */
  centre: [number, number, number]
  /** its lowest point below that centre, so it stands on the floor */
  base: number
  /** how wide it reads at its turn (m), so all three come out one size */
  width: number
  /** its turn about the vertical */
  turn: number
  /** how far back on the floor it stands (m, before scaling), so a deep model clears the words under it */
  back?: number
  model: ReactNode
}

const FOV = 24
const DIST = 6
const TARGET_Y = 0.55

export function SystemsTrio({ play, hover, live }: { play: boolean; hover: number | null; live?: { current: boolean } }) {
  const bus = useMemo(createBus, [])
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])

  const slots: Slot[] = useMemo(
    () => [
      { centre: [1.5, 1.9, 0], base: 2.25, width: 6.4, turn: -0.62, model: <UnitizedModel view="preview" bus={bus} active /> },
      { centre: [4.2, 1.75, 0.2], base: 2.05, width: 6.9, turn: -0.95, back: 3.2, model: <RainscreenModel view="preview" bus={bus} active /> },
      // turned as far as the rainscreen, so it is seen from the same diagonal as the other two
      { centre: [0, 0.29, 0.18], base: 0.75, width: 2.25, turn: -0.98, back: 2.2, model: <StudFrameModel view="preview" bus={bus} active /> },
    ],
    [bus],
  )

  // the slots sit under the three columns: a third of the view's width each
  const aspect = size.width / Math.max(1, size.height)
  const viewW = 2 * DIST * Math.tan((FOV / 2) * (Math.PI / 180)) * aspect
  const colW = viewW / 3
  // on a narrow canvas (a phone's band) the models take more of their column, or they read as specks
  const fill = aspect < 2 ? 0.9 : 0.66
  const scales = slots.map((s) => (colW * fill) / s.width)

  useEffect(() => {
    camera.fov = FOV
    camera.position.set(0, TARGET_Y + DIST * Math.sin(0.16), DIST * Math.cos(0.16))
    camera.lookAt(0, TARGET_Y, 0)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size, invalidate])

  const groups = useRef<(THREE.Group | null)[]>([])
  const inner = useRef<(THREE.Group | null)[]>([])
  /** frames drawn since the models were shown; they are measured once they have settled into their preview */
  const drawn = useRef(0)
  const t = useRef<Record<string, number>>({ r0: 0, r1: 0, r2: 0, h0: 0, h1: 0, h2: 0 })
  const since = useRef(0)
  useEffect(() => {
    if (play && !since.current) since.current = performance.now()
    invalidate()
  }, [play, invalidate])
  useEffect(() => invalidate(), [hover, invalidate])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const s = t.current
    const now = performance.now()
    let moving = false
    // each model stood on the floor by its lowest drawn point, not by a figure set by hand
    if (since.current && drawn.current < 3 && ++drawn.current === 3) {
      slots.forEach((_, i) => {
        const g = groups.current[i]
        const m = inner.current[i]
        if (!g || !m) return
        const y = lowest(m)
        if (!Number.isFinite(y)) return
        m.position.y -= (y - g.getWorldPosition(new THREE.Vector3()).y) / g.scale.y
      })
    }
    if (drawn.current > 0 && drawn.current < 3) moving = true
    const sway = !reduced && (live?.current ?? false)
    slots.forEach((_, i) => {
      // each rises in its turn once the section is there
      const due = since.current && (reduced || now - since.current > 250 + i * 220)
      if (since.current && !due) moving = true
      if (approach(s, `r${i}`, due ? 1 : 0, reduced ? 1e3 : 3.2, dt, 1e-3)) moving = true
      if (approach(s, `h${i}`, hover === i ? 1 : 0, reduced ? 1e3 : 5, dt, 1e-3)) moving = true
      const g = groups.current[i]
      if (!g) return
      const r = 1 - Math.pow(1 - s[`r${i}`], 3)
      g.position.y = (1 - r) * -0.7
      g.visible = r > 0.002
      g.rotation.y = slots[i].turn + s[`h${i}`] * 0.32 + (sway ? 0.07 * Math.sin((now / 1000) * ((Math.PI * 2) / 16) + i * 1.9) : 0)
      g.scale.setScalar(scales[i] * (0.94 + 0.06 * r) * (1 + 0.04 * s[`h${i}`]))
    })
    if (moving || (sway && since.current)) invalidate()
  }, -2)

  return (
    <>
      {/* light from high overhead, so each model's shadow stays in its own column */}
      <MovingKeyLight focus={[0, TARGET_Y, 0]} reach={viewW / 1.6} offset={[-2.5, 12, 5]} />
      {slots.map((s, i) => (
        // a model set back on the floor is moved out by as much as the perspective pulls it in, so it stays over its column
        <group key={i} position={[(i - 1) * colW * (1 + ((s.back ?? 0) * scales[i]) / (DIST * Math.cos(0.16))), 0, -(s.back ?? 0) * scales[i]]}>
          <group ref={(g) => void (groups.current[i] = g)} visible={false}>
            {/* the model's centre to the slot, its base on the floor */}
            <group ref={(m) => void (inner.current[i] = m)} position={[-s.centre[0], -s.centre[1] + s.base, -s.centre[2]]}>
              <CastShadows>{s.model}</CastShadows>
            </group>
          </group>
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[viewW * 1.4, 8]} />
        <shadowMaterial color="#2a241a" opacity={0.16} transparent depthWrite={false} />
      </mesh>
    </>
  )
}
