import { useEffect, useMemo } from 'react'
import { advance } from '@react-three/fiber'
import AppModel from '../sections/AppModel'
import { HERO_TURN } from '../facade/three/ScrubRig'

/**
 * Development only (`/__film-card?id=facade|flooring|walls`): a phone's Home card model (AppModel, as the card draws it)
 * alone in its card's window, the window's ground behind it, drawn a frame at a time on a clock of its own, to be
 * recorded as the card's film (scripts/film-record.mjs, public/video/cards). The window fills the page: the recording
 * sets the page to the window's size.
 *
 * The opening plays first, out of the film (as it does on a phone, behind the loading screen); the film is the turn after
 * it, one whole loop, so the video loops without a seam: the turn's one period (HERO_TURN), and for the wall panel its
 * own loop (16.6 s) twice with the turn slowed to that length.
 *
 * Everything that moves is on the film's clock: R3F's `advance(seconds)` for the scene, `window.__turnAt` for the turn,
 * and performance.now (the panels' slight bob) while it records.
 */

declare global {
  interface Window {
    __cardFilm?: { frame: (seconds: number, take?: boolean) => Promise<string>; ready: () => boolean; length: number; warm: number }
    __turnAt?: number
  }
}

/** each film's length (s): a whole number of every loop in it */
const LENGTH: Record<string, number> = { facade: HERO_TURN.period, flooring: HERO_TURN.period, walls: 16.6 * 2 }
/** how long the opening runs before the film starts (s): it has played out and the camera has settled */
const WARM = 9

/** the card window's ground (more-cards.css `.ways__model`: radial-gradient(90% 70% at 50% 28%, #fff 0%, #f2f1ee 72%)) */
function ground(g: CanvasRenderingContext2D, w: number, h: number) {
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

export default function FilmCard() {
  const id = new URLSearchParams(window.location.search).get('id') ?? 'facade'
  const live = useMemo(() => ({ current: true }), [])
  const length = LENGTH[id] ?? LENGTH.facade

  useEffect(() => {
    const real = performance.now.bind(performance)
    let virt: number | null = null
    let out: HTMLCanvasElement | undefined
    performance.now = () => virt ?? real()
    window.__turnAt = 0
    window.__cardFilm = {
      length,
      warm: WARM,
      ready: () => !!document.querySelector('.fc-canvas canvas'),
      /** the frame `seconds` from the opening's start */
      /** (`take`: the frame as a PNG data URL, the window's ground under the scene, read in the same task it is drawn in) */
      frame: async (seconds: number, take = false) => {
        // (a far-off start for the bob's clock, so it is no different from a visit's)
        virt = 1e6 + seconds * 1000
        const s = Math.max(0, seconds - WARM)
        window.__turnAt = (s * HERO_TURN.period) / length
        await raf()
        advance(seconds)
        if (!take) return 'ok'
        const gl = document.querySelector<HTMLCanvasElement>('.film-card canvas')
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
      delete window.__turnAt
    }
  }, [length])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        // (the card's window, more-cards.css `.ways__model` on the applications' palette)
        background: 'radial-gradient(90% 70% at 50% 28%, #ffffff 0%, #f2f1ee 72%)',
      }}
    >
      <style>{'.film-card .fc-canvas, .film-card canvas { position: absolute !important; inset: 0; width: 100% !important; height: 100% !important; }'}</style>
      <div className="film-card" style={{ position: 'absolute', inset: 0 }}>
        <AppModel id={id} play live={live} still="" film />
      </div>
    </div>
  )
}
