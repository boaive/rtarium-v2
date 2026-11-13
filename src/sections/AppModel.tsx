import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Stage3D, MovingKeyLight } from '../facade/three/Stage3D'
import { createBus, type Shot } from '../facade/three/kit'
import { HERO_TURN, ScrubRig } from '../facade/three/ScrubRig'
import type { Progress } from '../facade/progress'
import { HeroPanel as FacadePanel } from '../facade/three/HeroPanel'
import { FloorHero } from '../flooring/three/FloorHero'
import { HERO_TARGET, HeroPanel as WallPanel } from '../walls/three/HeroPanel'

/**
 * A phone's Home: the chosen application's model, the one its own page opens on (the façade's panel cast over its mesh,
 * the flooring's floor laid, the wall panel dividing round its core), in one canvas that stays put while the model in it
 * changes, the camera gliding from one to the next and turning slowly either side as every page's opening does
 * (HERO_TURN). Its own chunk: Home loads it only once the applications come near.
 */

/** (the pages' shots fill a whole phone screen; this canvas is about half as tall, so the camera comes nearer) */
const FIT = 0.62
/** each page's opening shot on a phone (its first, before the scroll moves it), brought in for this shorter canvas */
const SHOTS: Record<string, Shot> = {
  // (each whole in the middle of its card's window, its shadow included: none cut by the window's edge)
  facade: { target: [0.02, -0.02, 0], dist: 1.72 * 1.7 * FIT * 1.3, azim: 42, elev: 16, frame: [0.47, 0.52] },
  flooring: { target: [0.02, -0.02, 0], dist: 2.6 * 1.7 * FIT * 0.78, azim: 36, elev: 28, frame: [0.5, 0.54] },
  walls: { target: HERO_TARGET, dist: 10.4 * FIT * 1.38, azim: 44, elev: 24, frame: [0.5, 0.54] },
}
const noPhase = () => {}

/** how long after the model is in that its picture is taken (ms): its opening has played out and its camera settled */
const SHOT_AFTER = 3000

/**
 * the model's picture, taken once its opening has played: drawn once more and read off the canvas as an image, which the
 * card shows in its place (the scene is then let go, its canvas, shadow map and all, so nothing 3D is kept alive under a
 * phone's scroll)
 */
function Snapshot({ onShot }: { onShot: (url: string) => void }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const id = window.setTimeout(() => {
      gl.render(scene, camera)
      gl.domElement.toBlob((b) => b && onShot(URL.createObjectURL(b)), 'image/png')
    }, SHOT_AFTER)
    return () => window.clearTimeout(id)
  }, [gl, scene, camera, onShot])
  return null
}

export default function AppModel({ id, play, live, still, onShot }: { id: string; play: boolean; live: { current: boolean }; still: string; onShot?: (url: string) => void }) {
  const bus = useMemo(createBus, [])
  const progress = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const zoom = useRef(0)
  const shot = SHOTS[id] ?? SHOTS.facade
  return (
    <Stage3D shadows keyLight={false} fallback={<img className="apps__still" src={still} alt="" />}>
      <ScrubRig progress={progress} shotAt={() => shot} live={live} turn={HERO_TURN} />
      {/* (the card's window is a yellow studio: a warm light from behind rims each model's edges off the ground, a cool
          one low in front lifts its near faces) */}
      <directionalLight position={[3.5, 2.6, -6]} intensity={1.4} color="#fff1d2" />
      <directionalLight position={[-5, 0.8, 4]} intensity={0.45} color="#cfe0ff" />
      {onShot && <Snapshot onShot={onShot} />}
      {id === 'walls' ? (
        <>
          <MovingKeyLight focus={HERO_TARGET} reach={3.2} offset={[-4, 9, 6]} />
          <WallPanel key="walls" bus={bus} live={live} onPhase={noPhase} zoom={zoom} />
        </>
      ) : id === 'flooring' ? (
        <>
          <MovingKeyLight focus={[0, 0, 0]} reach={0.9} />
          <FloorHero key="flooring" bus={bus} play={play} />
        </>
      ) : (
        <>
          <MovingKeyLight focus={[0, 0, 0]} reach={0.9} />
          <FacadePanel key="facade" bus={bus} play={play} />
        </>
      )}
    </Stage3D>
  )
}
