import { useEffect, useMemo, useRef, useState } from 'react'
import { advance, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import '../facade/facade.css'
import { Stage3D, LabelProjector, Labels, MovingKeyLight } from '../facade/three/Stage3D'
import { createBus } from '../facade/three/kit'
import { ScrubRig } from '../facade/three/ScrubRig'
import { HangScene, hangShot } from '../facade/three/unit/HangScene'
import { AnswerScene, type AnswerAxis } from '../facade/three/unit/AnswerScene'
import { ANSWER_LABELS, ANSWERS } from '../facade/unitized/Answers'
import { smooth, type Progress } from '../facade/progress'

/**
 * Development only (`/__film?scene=hang|answers`): one of the Unitized page's scenes alone, filling the window, drawn
 * a frame at a time on a clock of its own, to be rendered as the phone's clips (Hang, Answers: Stations). The capture
 * script sets the scene where it should be and draws the next frame (`__film.frame(p, seconds)`), then screenshots the
 * window: every frame the same step of time apart, however long each takes to capture, and nothing moving on the wall
 * clock (no sway, no turn), so the clip runs smoothly and never wobbles.
 *
 * Framed for a square clip: the hanging's first steps close on the connection (the bracket and the barrier at the
 * slab's edge, in the middle), drawing back to the scene's own shots as the unit comes in; the answers a little closer
 * than a wide screen's, the 6 m panel as it is (`framing`).
 *
 * The window is see-through (the canvas is): the clips carry no ground of their own, and the page sets each on its own
 * (Hang on its grid floor, the answers on their panel).
 *
 * The clips in public/img/facade/unitized (`hang-step-N`, `answer-step-N`, and the answers' thumbnails) were made here:
 * each step eased from the last one's stop to its own over 1.4 to 2.5 s, a frame each 1/30 s, then held half a second
 * for the camera to come to rest (the façade going up by itself played at twice its speed); the frames screenshot at
 * 600 px as PNG with their transparency (scripts/dev-shoot.mjs, `transparent`) and encoded as looping animated WebP
 * with alpha at 480 px, 24 fps, the last frame held 0.7 s. Their lengths are the steps' `CLIP_MS` (Hang, Answers).
 */

declare global {
  interface Window {
    __film?: { frame: (p: number, seconds: number) => Promise<string>; ready: () => boolean }
  }
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** the hanging, at `p`: the camera's distance (a share of the shot's) and where its target stands in the frame */
function hangFraming(p: number) {
  // close on the connection through the bracket and the barrier, back to the shots' own as the unit is lowered
  const back = smooth(0.24, 0.34, p)
  return { dist: lerp(0.62, 1, back), fx: lerp(0.34, 0.5, back), fy: lerp(0.6, 0.5, back) }
}
/** the answers, at `t`: the zoom over their own camera (the 6 m panel drawn back to fit as it grows) */
const answerZoom = (t: number) => lerp(1.3, 1, smooth(3.95, 4.25, t))

/** a zoom over the camera the scene has just set (after it, before the frame is drawn) */
function Zoom({ at, progress }: { at: (p: number) => number; progress: Progress }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  useFrame(() => {
    camera.zoom = at(progress.value)
    camera.updateProjectionMatrix()
  }, -0.5)
  return null
}

export default function FilmUnitized() {
  const scene = new URLSearchParams(window.location.search).get('scene') === 'answers' ? 'answers' : 'hang'
  const progress = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const bus = useMemo(createBus, [])
  const settle = useRef(0)
  const live = useRef(false)
  const axis = useRef<AnswerAxis>({ x: 0.5, y: 0.5 })
  const [lit, setLit] = useState('')
  const shotAt = useMemo(
    () => (p: number) => {
      const s = hangShot(p, false, settle.current)
      const f = hangFraming(p)
      return { ...s, dist: s.dist * f.dist, frame: [f.fx, f.fy] as [number, number] }
    },
    [],
  )

  useEffect(() => {
    document.documentElement.classList.add('is-film')
    window.__film = {
      ready: () => !!document.querySelector('.fc-canvas canvas'),
      frame: async (p: number, seconds: number) => {
        progress.value = p
        progress.listeners.forEach((f) => f())
        if (scene === 'answers') {
          // an answer's marks once it has played out, until the words change (as the page shows them)
          const k = Math.min(ANSWERS.length - 1, Math.max(0, Math.floor(p)))
          const f = p - k
          const last = k === ANSWERS.length - 1
          setLit(f > (last ? 0.82 : 0.5) && f < 0.8 + (last ? 1 : 0) ? ANSWERS[k].id : '')
        }
        await raf()
        advance(seconds)
        await raf()
        return 'ok'
      },
    }
    return () => {
      document.documentElement.classList.remove('is-film')
      delete window.__film
    }
  }, [progress, scene])

  const shown = ANSWERS.find((a) => a.id === lit)?.labels ?? []
  return (
    <div className={scene === 'answers' ? 'on-yellow' : 'on-light'} style={{ position: 'fixed', inset: 0, background: 'transparent' }}>
      {/* (the marks come in at once: a frame is a still, and a fade would run on the wall clock; the page's scroll line is
          not part of the scene; nothing behind the scene: the clip is see-through) */}
      <style>
        {'.is-film .fc-pin { transition: none !important; } .is-film .fc-pin__tag { font-weight: 700; } .is-film .sline { display: none !important; }' +
          ' html.is-film, html.is-film body { background: transparent !important; }'}
      </style>
      <div style={{ position: 'absolute', inset: 0 }}>
        {scene === 'hang' ? (
          <Stage3D shadows keyLight={false} sharp film>
            <ScrubRig progress={progress} shotAt={shotAt} sway={0} live={live} aspect={1} />
            <MovingKeyLight focus={[12, 12, -2]} reach={24} />
            <HangScene progress={progress} bus={bus} live={live} settle={settle} />
            <LabelProjector bus={bus} />
          </Stage3D>
        ) : (
          <>
            <Stage3D shadows sharp film>
              <AnswerScene t={progress} bus={bus} compact={false} axis={axis} />
              <Zoom at={answerZoom} progress={progress} />
              <LabelProjector bus={bus} bottom={24} />
            </Stage3D>
            <Labels bus={bus} labels={ANSWER_LABELS} shown={shown} />
          </>
        )}
      </div>
    </div>
  )
}
