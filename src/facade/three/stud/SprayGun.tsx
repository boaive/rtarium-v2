import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { prefersReducedMotion } from '../../../lib/motion'
import { WIRE } from '../../../three/wire'

/**
 * The hopper gun of the spray-up, drawn as a wireframe over the mould: a hopper, its barrel and grip, and a fan
 * of spray with rings falling through it. The casting moves it (`gun`, written each frame): `x` along the
 * mould, `on` how far it is drawn in, `spraying` how far the spray is running. `height` is its nozzle above
 * the mould's rim. An illustration of the step, not a model of a particular gun.
 */

export interface GunState {
  x: number
  on: number
  spraying: number
}

const TILT = 0.2
const SPOKES = 12
const FAN = 0.2
const RINGS = 3

/** the hopper's rings: height over the nozzle, radius */
const HOPPER: [number, number][] = [
  [0.68, 0.25],
  [0.46, 0.23],
  [0.16, 0.065],
  [0.08, 0.035],
]

function circle(y: number, r: number, out: number[]) {
  for (let i = 0; i < SPOKES * 2; i++) {
    const a = (i / (SPOKES * 2)) * Math.PI * 2
    const b = ((i + 1) / (SPOKES * 2)) * Math.PI * 2
    out.push(Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(b) * r, y, Math.sin(b) * r)
  }
}

function boxEdges(size: [number, number, number], at: [number, number, number], turn: number, out: number[]) {
  const box = new THREE.BoxGeometry(...size)
  const g = new THREE.EdgesGeometry(box)
  g.rotateZ(turn)
  g.translate(...at)
  out.push(...(g.attributes.position.array as Float32Array))
  box.dispose()
  g.dispose()
}

function gunGeometry() {
  const pts: number[] = []
  HOPPER.forEach(([y, r]) => circle(y, r, pts))
  for (let k = 0; k < SPOKES; k++) {
    const a = (k / SPOKES) * Math.PI * 2
    for (let i = 0; i < HOPPER.length - 1; i++) {
      const [y0, r0] = HOPPER[i]
      const [y1, r1] = HOPPER[i + 1]
      pts.push(Math.cos(a) * r0, y0, Math.sin(a) * r0, Math.cos(a) * r1, y1, Math.sin(a) * r1)
    }
  }
  // the barrel across the foot of the hopper, the nozzle under it, the grip behind
  boxEdges([0.36, 0.08, 0.08], [0.1, 0.04, 0], 0, pts)
  boxEdges([0.05, 0.08, 0.05], [0, -0.03, 0], 0, pts)
  boxEdges([0.07, 0.24, 0.07], [0.27, -0.08, 0], -0.28, pts)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return g
}

function fanGeometry(height: number) {
  const pts: number[] = []
  for (let k = 0; k < SPOKES; k++) {
    const a = (k / SPOKES) * Math.PI * 2
    pts.push(0, 0, 0, Math.cos(a) * FAN, -height, Math.sin(a) * FAN)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return g
}

function ringGeometry() {
  const pts: number[] = []
  circle(0, 1, pts)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return g
}

export function SprayGun({ gun, y, height }: { gun: { current: GunState }; y: number; height: number }) {
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const geo = useMemo(() => ({ gun: gunGeometry(), fan: fanGeometry(height), ring: ringGeometry() }), [height])
  const mat = useMemo(
    () => ({
      gun: new THREE.LineBasicMaterial({ color: '#080808', transparent: true, opacity: 0 }),
      spray: new THREE.LineBasicMaterial({ color: '#080808', transparent: true, opacity: 0 }),
    }),
    [],
  )
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      Object.values(mat).forEach((m) => m.dispose())
    },
    [geo, mat],
  )

  const root = useRef<THREE.Group>(null)
  const fan = useRef<THREE.Group>(null)
  const rings = useRef<(THREE.LineSegments | null)[]>([])

  useFrame(() => {
    const g = gun.current
    const r = root.current
    if (!r) return
    r.visible = g.on > 0.002
    if (!r.visible) return
    r.position.x = g.x
    // it comes down onto the work as it is drawn in
    r.position.y = y + height + 0.25 * (1 - g.on)
    mat.gun.opacity = WIRE.opacity * g.on
    mat.spray.opacity = WIRE.opacity * g.spraying
    if (fan.current) fan.current.visible = g.spraying > 0.01
    const t = reduced ? 0 : performance.now() / 1000
    rings.current.forEach((ring, i) => {
      if (!ring) return
      const f = (t * 1.1 + i / RINGS) % 1
      ring.position.y = -height * f
      ring.scale.set(Math.max(0.001, FAN * f), 1, Math.max(0.001, FAN * f))
    })
  }, -1)

  return (
    <group ref={root} visible={false}>
      <group rotation={[0, 0, TILT]}>
        <lineSegments geometry={geo.gun} material={mat.gun} />
      </group>
      <group ref={fan} visible={false}>
        <lineSegments geometry={geo.fan} material={mat.spray} />
        {Array.from({ length: RINGS }, (_, i) => (
          <lineSegments key={i} ref={(el) => void (rings.current[i] = el)} geometry={geo.ring} material={mat.spray} />
        ))}
      </group>
    </group>
  )
}
