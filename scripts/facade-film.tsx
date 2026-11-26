// Development only (never in a build): the façade pages' scenes alone, each drawn a frame at a time on a clock of its own,
// to be recorded as the films a phone plays where it has no 3D (the fallback: src/facade/films.tsx), as Home's are
// (src/dev/FilmCard.tsx). Served by the dev server at /scripts/facade-film.html?scene=<scene>; recorded with Home's own
// recorder, which sets the window to the scene's size and reads each frame off the canvas, its ground painted under it:
//
//   GPU=1 node scripts/film-record.mjs "http://localhost:5180/scripts/facade-film.html?scene=<scene>" <master.mp4> \
//     --size <WxH> --dpr 2 --fps 24 --crf 8
//
// then encoded for phones (600 px wide, H.264, its first frame the poster): the commands are in src/facade/films.tsx.
//
// Scenes:
//   overview-hero   the Façade & Cladding opening, a phone's screen (--size 300x650): the panel settling and the
//                   concrete poured across the textile (OPEN s, as it plays as the page opens), then the camera's move
//                   down the opening's height of scroll, one shot a frame (SCRUB_FRAMES, each settled), the panel still
//   systems-<id>    a system's model in its card (More: MoreCards), the card's window (--size 300x406): risen and turned
//                   towards the visitor as the card in front is, then one whole sway (16 s) so the film loops seamlessly
//
// Everything that moves is on the film's clock: R3F's `advance(seconds)` for the scene and performance.now (the models'
// sway, the panel's float) while it records.
import { useEffect, useMemo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { advance } from '@react-three/fiber'
import '../src/styles/tokens.css'
import '../src/facade/facade.css'
import { Stage3D, MovingKeyLight } from '../src/facade/three/Stage3D'
import { createBus } from '../src/facade/three/kit'
import { ScrubRig, mixShot } from '../src/facade/three/ScrubRig'
import { HeroPanel } from '../src/facade/three/HeroPanel'
import { SystemsTrio } from '../src/facade/three/SystemsTrio'
import { SYSTEMS } from '../src/facade/content'
import { heroShots } from '../src/facade/pages/Overview'
import type { Progress } from '../src/facade/progress'

declare global {
  interface Window {
    __cardFilm?: { frame: (seconds: number, take?: boolean) => Promise<string>; ready: () => boolean; length: number; warm: number }
  }
}

const FPS = 24
/** the opening's pour, played as it is in time (s): settled 0.9 s, poured 1.7 s from just past half of that, then still */
export const OPEN = 2.5
/** the scroll's frames: 0 to the whole opening's height, 48 a screen (as Home's tour film), the last at 1 exactly */
export const SCRUB_FRAMES = 49
/** the systems' models sway once in this long (SystemsTrio: 16 s) */
const SWAY = 16

const scene = new URLSearchParams(window.location.search).get('scene') ?? 'overview-hero'

/** the yellow the page's openings stand on (tokens.css --yellow) */
function yellow(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = '#fdd001'
  g.fillRect(0, 0, w, h)
}

/** a phone card's window (more-cards.css `.ways__model`: radial-gradient(ellipse 90% 70% at 50% 28%, #fff 0%, #f2f1ee 72%)) */
function cardWindow(g: CanvasRenderingContext2D, w: number, h: number) {
  g.save()
  g.fillStyle = '#f2f1ee'
  g.fillRect(0, 0, w, h)
  g.translate(w * 0.5, h * 0.28)
  g.scale(w * 0.9, h * 0.7)
  const r = g.createRadialGradient(0, 0, 0, 0, 0, 1)
  r.addColorStop(0, '#ffffff')
  r.addColorStop(0.72, '#f2f1ee')
  r.addColorStop(1, '#f2f1ee')
  g.fillStyle = r
  g.fillRect(-1, -1, 2, 2)
  g.restore()
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

type Ground = (g: CanvasRenderingContext2D, w: number, h: number) => void

/**
 * every film's page: the clock, the frame, and the ground painted under the canvas as it is read. `clockAt`: where the
 * clocks read off performance.now stand at a moment of the film (s)
 */
function useFilm(length: number, warm: number, ground: Ground, step: (seconds: number) => void, clockAt: (seconds: number) => number) {
  useEffect(() => {
    const real = performance.now.bind(performance)
    let out: HTMLCanvasElement | undefined
    // (a far-off start for the clocks read off performance.now, as on a visit)
    let virt: number | null = null
    performance.now = () => virt ?? real()
    window.__cardFilm = {
      length,
      warm,
      ready: () => !!document.querySelector('.film-stage canvas'),
      frame: async (seconds: number, take = false) => {
        virt = 1e6 + clockAt(seconds) * 1000
        await raf()
        step(seconds)
        if (!take) return 'ok'
        const gl = document.querySelector<HTMLCanvasElement>('.film-stage canvas')
        if (!gl) return ''
        const c = (out ??= document.createElement('canvas'))
        c.width = gl.width
        c.height = gl.height
        const g = c.getContext('2d')!
        ground(g, c.width, c.height)
        g.drawImage(gl, 0, 0)
        return c.toDataURL('image/png')
      },
    }
    return () => {
      performance.now = real
      delete window.__cardFilm
    }
  }, [length, warm, ground, step, clockAt])
}

function Frame({ background, children }: { background: string; children: ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background }}>
      <style>{'.film-stage .fc-canvas, .film-stage canvas { position: absolute !important; inset: 0; width: 100% !important; height: 100% !important; }'}</style>
      <div className="film-stage" style={{ position: 'absolute', inset: 0 }}>
        {children}
      </div>
    </div>
  )
}

/** Façade & Cladding's opening on a phone (pages/Overview.tsx), its turn and sway still: the film is played by the scroll */
function OverviewHero() {
  const bus = useMemo(createBus, [])
  const progress = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const still = useMemo(() => ({ current: false }), [])
  const [hs0, hs1] = useMemo(() => heroShots(true), [])
  const shotAt = useMemo(() => (p: number) => mixShot(hs0, hs1, p), [hs0, hs1])
  // (the scene's own clock: it only ever runs on, the scroll's frames each settled with steps of their own)
  const clock = useMemo(() => ({ t: 0 }), [])
  const step = useMemo(
    () => (seconds: number) => {
      if (seconds <= OPEN + 1e-6) {
        progress.value = 0
        clock.t = seconds
        advance(seconds)
        return
      }
      // the camera's shot at this frame of the scroll, eased (ScrubRig, 7 a second) until it has come to rest there
      progress.value = Math.min(1, Math.round((seconds - OPEN) * FPS) / (SCRUB_FRAMES - 1))
      for (let k = 0; k < 36; k++) advance((clock.t += 0.05))
    },
    [progress, clock],
  )
  // (the panel's float, read off performance.now, held where the opening leaves it while the scroll's frames are drawn)
  const clockAt = useMemo(() => (s: number) => Math.min(s, OPEN), [])
  useFilm(OPEN + SCRUB_FRAMES / FPS, 0, yellow, step, clockAt)
  return (
    <Frame background="#fdd001">
      <Stage3D shadows keyLight={false} film>
        <ScrubRig progress={progress} shotAt={shotAt} sway={0} live={still} aspect={0.56} />
        <MovingKeyLight focus={[0, 0, 0]} reach={0.9} />
        <HeroPanel bus={bus} play />
      </Stage3D>
    </Frame>
  )
}

/** one system's model in its phone card, as the card in front shows it (More: MoreCards) */
function SystemCard({ id }: { id: string }) {
  const n = Math.max(0, SYSTEMS.findIndex((s) => s.id === id))
  const live = useMemo(() => ({ current: true }), [])
  const step = useMemo(() => (seconds: number) => advance(seconds), [])
  const clockAt = useMemo(() => (s: number) => s, [])
  useFilm(SWAY, 4, cardWindow, step, clockAt)
  return (
    <Frame background="radial-gradient(ellipse 90% 70% at 50% 28%, #ffffff 0%, #f2f1ee 72%)">
      <Stage3D shadows keyLight={false} film>
        <SystemsTrio play hover={0} live={live} pick={[n]} fill={0.86} headroom={0.02} />
      </Stage3D>
    </Frame>
  )
}

function Film() {
  if (scene.startsWith('systems-')) return <SystemCard id={scene.slice('systems-'.length)} />
  return <OverviewHero />
}

createRoot(document.getElementById('root')!).render(<Film />)
