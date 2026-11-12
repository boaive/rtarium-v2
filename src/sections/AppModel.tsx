import { useMemo, useRef } from 'react'
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
  facade: { target: [0.02, -0.02, 0], dist: 1.72 * 1.7 * FIT * 1.12, azim: 42, elev: 14, frame: [0.56, 0.5] },
  flooring: { target: [0.02, -0.02, 0], dist: 2.6 * 1.7 * FIT * 0.85, azim: 36, elev: 26, frame: [0.5, 0.5] },
  walls: { target: HERO_TARGET, dist: 10.4 * FIT, azim: 44, elev: 28, frame: [0.5, 0.5] },
}
const noPhase = () => {}

export default function AppModel({ id, play, live, still }: { id: string; play: boolean; live: { current: boolean }; still: string }) {
  const bus = useMemo(createBus, [])
  const progress = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const zoom = useRef(0)
  const shot = SHOTS[id] ?? SHOTS.facade
  return (
    <Stage3D shadows keyLight={false} fallback={<img className="apps__still" src={still} alt="" />}>
      <ScrubRig progress={progress} shotAt={() => shot} live={live} turn={HERO_TURN} />
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
