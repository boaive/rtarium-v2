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
//   unitized-hero   the Unitized opening, as overview-hero (--size 300x650): the unit settling and its cover drawn back
//                   off the cut (OPEN s), then its height of scroll
//   unitized-layers the six layers' card on a phone (Layers: LayersPhone, RunStations), the card's window (--size 300x236):
//                   all eight steps one after another, each played as the card's step clock plays it (stepClock.ts: eased
//                   from where the last left off over its time less its hold, then held), on one clock, so step k is its
//                   stretch of the film (StepFilm)
//   unitized-hang   slab to slab on a phone (Hang: HangLive on StepFloor), the whole screen (--size 300x650): its five
//                   steps as HangLive plays them, the last held on while the façade goes up and the crane goes
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
import type { Shot } from '../src/facade/three/kit'
import { Zoom } from '../src/facade/unitized/Zoom'
import { shots as unitShots } from '../src/facade/unitized/Hero'
import { HERO_TARGET, HeroUnit } from '../src/facade/three/unit/HeroUnit'
import { LayerRun } from '../src/facade/unitized/Layers'
import { CLIP_MS, PHASES } from '../src/facade/unitized/Hang'
import { HangScene, hangShot } from '../src/facade/three/unit/HangScene'

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

/**
 * a page's opening on a phone, its turn and sway still (the film is played by the scroll): its opening in time, then the
 * camera's move down the opening's height of scroll. `shots`: the page's own phone shots (its Hero's), `children`: its
 * model and light
 */
function ScrollHero({ shots, children }: { shots: [Shot, Shot]; children: (bus: ReturnType<typeof createBus>) => ReactNode }) {
  const bus = useMemo(createBus, [])
  const progress = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const still = useMemo(() => ({ current: false }), [])
  const [hs0, hs1] = shots
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
  // (the model's float, read off performance.now, held where the opening leaves it while the scroll's frames are drawn)
  const clockAt = useMemo(() => (s: number) => Math.min(s, OPEN), [])
  useFilm(OPEN + SCRUB_FRAMES / FPS, 0, yellow, step, clockAt)
  return (
    <Frame background="#fdd001">
      <Stage3D shadows keyLight={false} film>
        <ScrubRig progress={progress} shotAt={shotAt} sway={0} live={still} aspect={0.56} />
        {children(bus)}
      </Stage3D>
    </Frame>
  )
}

/** Façade & Cladding's opening (pages/Overview.tsx) */
function OverviewHero() {
  const shots = useMemo(() => heroShots(true), [])
  return (
    <ScrollHero shots={shots}>
      {(bus) => (
        <>
          <MovingKeyLight focus={[0, 0, 0]} reach={0.9} />
          <HeroPanel bus={bus} play />
        </>
      )}
    </ScrollHero>
  )
}

/** the Unitized opening (unitized/Hero.tsx) */
function UnitizedHero() {
  const shots = useMemo(() => unitShots(true), [])
  return (
    <ScrollHero shots={shots}>
      {(bus) => (
        <>
          <MovingKeyLight focus={HERO_TARGET} reach={4.2} offset={[6, 9, 7]} />
          <HeroUnit bus={bus} play />
        </>
      )}
    </ScrollHero>
  )
}

/**
 * Steps that play themselves, as a phone's cards play them: step k eased from where the last left off (`start` for the
 * first) to `to[k]` over `ease[k]` ms (stepClock.ts: in, then out, quadratically), then held for the rest of its `slot[k]`
 * ms, when the next comes; the last held on for `tail` ms. Each film frame is the progress at that moment of the run.
 */
interface StepPlan {
  to: number[]
  ease: number[]
  slot: number[]
  tail: number
  start?: number
}
const planLength = (p: StepPlan) => (p.slot.slice(0, -1).reduce((a, b) => a + b, 0) + p.tail) / 1000
function progressAt(p: StepPlan, seconds: number) {
  let t0 = 0
  for (let k = 0; k < p.to.length; k++) {
    const last = k === p.to.length - 1
    if (!last && seconds * 1000 >= t0 + p.slot[k]) {
      t0 += p.slot[k]
      continue
    }
    const from = k === 0 ? (p.start ?? 0) : p.to[k - 1]
    const e = Math.min(1, (seconds * 1000 - t0) / p.ease[k])
    return from + (p.to[k] - from) * (e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2)
  }
  return p.to[p.to.length - 1]
}

/** a step film's page: the scene drawn with the run's progress set for each frame, its ground under it */
function StepRun({ plan, ground, background, children }: { plan: StepPlan; ground: Ground; background: string; children: (t: Progress, live: { current: boolean }) => ReactNode }) {
  const t = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const live = useMemo(() => ({ current: true }), [])
  const step = useMemo(
    () => (seconds: number) => {
      t.value = progressAt(plan, seconds)
      t.listeners.forEach((f) => f())
      advance(seconds)
    },
    [plan, t],
  )
  const clockAt = useMemo(() => (s: number) => s, [])
  // (a whole number of frames)
  useFilm(Math.round(planLength(plan) * FPS) / FPS, 0, ground, step, clockAt)
  return (
    <Frame background={background}>
      <Stage3D shadows keyLight={false} film>
        {children(t, live)}
      </Stage3D>
    </Frame>
  )
}

/** the six layers' card (unitized/stations.css `.fst--solution .fst__card`) */
const LAYERS_CARD = 'radial-gradient(75% 70% at 52% 46%, rgb(247, 246, 242) 0%, rgb(233, 231, 224) 55%, rgb(214, 211, 202) 100%)'
function layersCard(g: CanvasRenderingContext2D, w: number, h: number) {
  g.save()
  g.fillStyle = 'rgb(214, 211, 202)'
  g.fillRect(0, 0, w, h)
  g.translate(w * 0.52, h * 0.46)
  g.scale(w * 0.75, h * 0.7)
  const r = g.createRadialGradient(0, 0, 0, 0, 0, 1)
  r.addColorStop(0, 'rgb(247, 246, 242)')
  r.addColorStop(0.55, 'rgb(233, 231, 224)')
  r.addColorStop(1, 'rgb(214, 211, 202)')
  g.fillStyle = r
  g.fillRect(-2, -2, 4, 4)
  g.restore()
}
/** RunStations' times for the six layers' eight steps (stretch 1 each): 1800 ms a move, held 500 ms, the last 1200 ms */
const LAYER_STEPS = 8
const LAYERS_PLAN: StepPlan = {
  to: Array.from({ length: LAYER_STEPS }, (_, k) => k + (k === LAYER_STEPS - 1 ? 0.9 : 0.76)),
  ease: Array.from({ length: LAYER_STEPS }, () => 1800),
  slot: Array.from({ length: LAYER_STEPS }, (_, k) => 1800 + (k === LAYER_STEPS - 1 ? 1200 : 500)),
  tail: 3000,
}
function UnitizedLayers() {
  const bus = useMemo(createBus, [])
  return (
    <StepRun plan={LAYERS_PLAN} ground={layersCard} background={LAYERS_CARD}>
      {(t, live) => (
        <>
          <LayerRun t={t} bus={bus} live={live} />
          <Zoom by={1.6} />
        </>
      )}
    </StepRun>
  )
}

/** slab to slab's ground on a phone (step-floor.css `.fsf`, on the Unitized page: #f2f0e9) */
const HANG_GROUND = '#f2f0e9'
function hangGround(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = HANG_GROUND
  g.fillRect(0, 0, w, h)
}
/**
 * HangLive's steps: each eased over 0.85 of its clip's time to its phase's end; the last held on 4.3 s past its ease,
 * while the rest of the façade goes up (36 units, 2.25 s), the crane goes (0.9 s after 0.2 s) and the camera settles
 */
const HANG_PLAN: StepPlan = {
  to: PHASES.map((ph) => ph.to),
  ease: CLIP_MS.map((m) => m * 0.85),
  slot: CLIP_MS,
  tail: CLIP_MS[CLIP_MS.length - 1] * 0.85 + 4300,
}
function UnitizedHang() {
  const bus = useMemo(createBus, [])
  const settle = useMemo(() => ({ current: 0 }), [])
  const shotAt = useMemo(() => (p: number) => hangShot(p, true, settle.current), [settle])
  return (
    <StepRun plan={HANG_PLAN} ground={hangGround} background={HANG_GROUND}>
      {(t, live) => (
        <>
          <ScrubRig progress={t} shotAt={shotAt} sway={1} live={live} aspect={1.6} />
          <MovingKeyLight focus={[12, 12, -2]} reach={24} />
          <HangScene progress={t} bus={bus} live={live} settle={settle} />
        </>
      )}
    </StepRun>
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
  if (scene === 'unitized-hero') return <UnitizedHero />
  if (scene === 'unitized-layers') return <UnitizedLayers />
  if (scene === 'unitized-hang') return <UnitizedHang />
  return <OverviewHero />
}

createRoot(document.getElementById('root')!).render(<Film />)
