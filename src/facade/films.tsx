import { useEffect, useRef, useState, type RefObject } from 'react'
import { builds, opening } from '../lib/builds'
import { damp, prefersReducedMotion } from '../lib/motion'
import { FILM_STEPS, dropFilm, filmReady, seenFilm } from '../lib/films'
import './films.css'

/**
 * The façade pages' films: where a phone has no 3D (no WebGL 2, or a scene that failed again and again: Stage3D, and
 * `?fallback` to check it), each 3D view is a film recorded from the 3D itself, moving as it does, as Home's figures are
 * (Hero.tsx HeroFilm, Chapter.tsx CardFilm, lib/films). Each stands in a view's `fallback`; a wide screen with no 3D keeps
 * its still. The films sit beside Home's, in public/video/fallback, each with its first frame as its poster (JPEG).
 *
 * Recorded from the real scenes a frame at a time (scripts/facade-film.tsx, with Home's recorder, scripts/film-record.mjs,
 * at --crf 8), then encoded for phones, 600 px wide, H.264, its colours put into BT.709 by way of RGB and the film
 * marked so: a browser reads an unmarked film as BT.709 and the recorder's is BT.601, which turned the page's yellow
 * (253 208 1) to 255 201 0 at the edge of the film; converted, it is 252 207 1.
 *
 *   VF="scale=in_color_matrix=bt601:in_range=tv,format=rgb24,scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p"
 *   TAG="-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv"
 *   a film played by the scroll (a keyframe every 4 frames, to seek in both ways, never a frame ahead of the one before):
 *     ffmpeg -i master.mp4 -vf "$VF" -c:v libx264 -preset veryslow -crf 25 -profile:v high $TAG -g 4 -bf 0 \
 *       -movflags +faststart -an public/video/fallback/<name>.mp4
 *   a loop (one whole period of its motion, so it loops without a seam):
 *     ffmpeg -i master.mp4 -vf "$VF" -c:v libx264 -preset veryslow -crf 22 -profile:v high $TAG -g 240 -bf 3 \
 *       -movflags +faststart -an public/video/fallback/<name>.mp4
 *   a film of steps (a keyframe at each step's start, to be sought there at once; one every 2 s, for catching up):
 *     ffmpeg -i master.mp4 -vf "$VF" -c:v libx264 -preset veryslow -crf 22 -profile:v high $TAG \
 *       -force_key_frames <each step's start, s, comma separated> -g 48 -bf 2 -movflags +faststart -an <name>.mp4
 *   its poster, the first frame (a film of steps: its first step's end, as the 3D stands before it plays it again):
 *     ffmpeg -i master.mp4 -frames:v 1 -vf "scale=in_color_matrix=bt601:in_range=tv,format=rgb24" -q:v 6 <name>.jpg
 *
 * The films so far (Nov 2026):
 *   facade-hero          Façade & Cladding's opening: the pour (2.5 s), then its height of scroll (49 frames), 600x1300
 *   systems-<id>         each façade system's card at the foot of the façade pages (More), one 16 s sway, 600x812
 *   unitized-hero        the Unitized opening: the unit settling, its cut opened (2.5 s), then its scroll, 600x1300
 *   unitized-layers      the six layers' card (8 steps, RunStations' times: 2.3 s each, the last 3 s), 600x472, crf 22
 *   unitized-hang        slab to slab (5 steps, Hang's CLIP_MS; the last on 9.1 s, the façade going up and the crane
 *                        going), the whole screen, 600x1300, crf 31 (a screen of fine lines: 1.1 MB, not 3.7 at 22)
 */
const DIR = '/video/fallback'
const FPS = 24

/**
 * A view played by the scroll (a page's opening), as Home's tour is (HeroFilm): its film fetched whole behind the loading
 * screen, so every frame is at hand at once. It opens as the 3D does: its first `open` seconds (the panel poured) play
 * once as it is first seen still at the top, once the loading screen has gone; then where the page is in the section's
 * own height of scroll (`useScrollProgress(section, 1, 'height')`, as the 3D's camera reads it) is eased after the finger
 * at the 3D camera's own rate (ScrubRig: 7 a second), and the film is sought to that step's frame (`frames` of them, the
 * first at `open`). Both ways, at any pace; it holds where the page holds. Under reduced motion it stands poured, at the
 * page's place, as the 3D does.
 */
export function ScrubFilm({ name, section, open, frames }: { name: string; section: RefObject<HTMLElement | null>; open: number; frames: number }) {
  const video = useRef<HTMLVideoElement>(null)
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    let url = ''
    let live = true
    const held = opening()
    if (held) builds.waiting++
    const letGo = () => {
      if (held) builds.waiting = Math.max(0, builds.waiting - 1)
    }
    fetch(`${DIR}/${name}.mp4`)
      .then((r) => r.blob())
      .then((b) => {
        if (!live) return
        url = URL.createObjectURL(b)
        setSrc(url)
      })
      .catch(() => live && setSrc(`${DIR}/${name}.mp4`))
      .finally(letGo)
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [name])

  useEffect(() => {
    const el = section.current
    const v = video.current
    if (!el || !v || !src) return
    v.muted = true
    const first = Math.round(open * FPS)
    /** where the page is in the section's height of scroll, 0..1 */
    const read = () => {
      const r = el.getBoundingClientRect()
      return Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)))
    }
    // (the frame for a place in the scroll: a step of the film's, landed inside it, never on its edge)
    const timeAt = (a: number) => (first + Math.round(a * (frames - 1)) + 0.3) / FPS
    // the opening: waiting for its moment, playing, or done (then the scroll has it)
    let mode: 'wait' | 'open' | 'scrub' = prefersReducedMotion() || read() > 0.002 ? 'scrub' : 'wait'
    let raf = 0
    let last = performance.now()
    let at = -1
    const scrub = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const target = read()
      at = at < 0 || prefersReducedMotion() ? target : damp(at, target, 7, dt)
      if (Math.abs(at - target) < 1e-4) at = target
      const t = timeAt(at)
      const on = el.getBoundingClientRect().bottom > 1
      if (on && v.readyState >= 1 && !v.seeking && Math.abs(v.currentTime - t) > 0.5 / FPS) v.currentTime = t
      if (at !== target || v.seeking) raf = requestAnimationFrame(scrub)
    }
    const playing = () => {
      raf = 0
      if (mode !== 'open') return
      if (v.currentTime >= open - 0.5 / FPS || read() > 0.002) return toScrub()
      raf = requestAnimationFrame(playing)
    }
    const toScrub = () => {
      mode = 'scrub'
      if (!v.paused) v.pause()
      cancelAnimationFrame(raf)
      raf = 0
      kick()
    }
    // (the opening plays once the loading screen has gone and the film can play, the page still at the top)
    const start = () => {
      if (mode !== 'wait' || opening() || v.readyState < 2) return
      if (read() > 0.002) return toScrub()
      mode = 'open'
      v.currentTime = 0
      void v.play().then(() => void (raf ||= requestAnimationFrame(playing)), toScrub)
    }
    const kick = () => {
      if (mode === 'wait') return start()
      if (mode !== 'scrub') return
      if (!raf) {
        last = performance.now()
        raf = requestAnimationFrame(scrub)
      }
    }
    // (decoded once, so the first seek paints: some browsers show nothing of a film never played)
    const prime = () => {
      if (mode === 'scrub') void v.play().then(() => v.pause(), () => {}).finally(kick)
      else start()
    }
    v.addEventListener('loadeddata', prime, { once: true })
    const gone = new MutationObserver(start)
    gone.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    v.addEventListener('loadedmetadata', kick)
    v.addEventListener('seeked', kick)
    window.addEventListener('scroll', kick, { passive: true })
    window.addEventListener('resize', kick)
    if (v.readyState >= 2) prime()
    return () => {
      cancelAnimationFrame(raf)
      gone.disconnect()
      v.removeEventListener('loadeddata', prime)
      v.removeEventListener('loadedmetadata', kick)
      v.removeEventListener('seeked', kick)
      window.removeEventListener('scroll', kick)
      window.removeEventListener('resize', kick)
    }
  }, [section, src, open, frames])

  return <video ref={video} className="fc-film" src={src} poster={`${DIR}/${name}.jpg`} muted playsInline preload="auto" aria-hidden="true" disablePictureInPicture disableRemotePlayback />
}

/**
 * A view that turns on a loop (a card in a phone's row of cards, More: MoreCards), as Home's cards are (CardFilm): its
 * film fetched as the section comes near, streamed as it plays; only the card in front plays, and only while it is the
 * film most in view and the page is still (lib/films: it holds while the page moves, as the 3D's sway does); the rest
 * hold their frame. Under reduced motion none plays (the 3D holds still too): each shows its poster.
 */
export function LoopFilm({ name, front }: { name: string; front: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [near, setNear] = useState(false)
  const seen = useRef(0)
  const held = !front || prefersReducedMotion()
  const isHeld = useRef(held)
  isHeld.current = held

  useEffect(() => {
    const v = video.current
    if (!v) return
    v.muted = true
    const ahead = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '150% 0px' })
    const io = new IntersectionObserver(([e]) => seenFilm(v, (seen.current = e.intersectionRatio), isHeld.current, true), { threshold: FILM_STEPS })
    ahead.observe(v)
    io.observe(v)
    // (a film that comes in while it is the one in view starts as soon as it can)
    v.addEventListener('loadeddata', filmReady)
    return () => {
      ahead.disconnect()
      io.disconnect()
      v.removeEventListener('loadeddata', filmReady)
      dropFilm(v)
    }
  }, [])
  // (the card in front changed: it plays, the one before it holds)
  useEffect(() => {
    const v = video.current
    if (v) seenFilm(v, seen.current, held, true)
  }, [held])

  return (
    <video
      ref={video}
      className="fc-film"
      src={near ? `${DIR}/${name}.mp4` : undefined}
      poster={`${DIR}/${name}.jpg`}
      muted
      loop
      playsInline
      preload={near ? (front ? 'auto' : 'metadata') : 'none'}
      aria-hidden="true"
      disablePictureInPicture
      disableRemotePlayback
    />
  )
}

/** when the page last moved: a step's film holds while it does, as the 3D card is not drawn again until the page is still
 * (Stage3D `Carried`), and takes up where the step's own clock has got to once it is (as ScrubRig holds its turn) */
let movedAt = -1e9
const HOLD_MS = 160
if (typeof window !== 'undefined') window.addEventListener('scroll', () => void (movedAt = performance.now()), { passive: true })

/**
 * A view whose steps play themselves (a phone's step cards: Stations, StepFloor), its film the whole run recorded on one
 * clock, every step's ease and hold as the cards' own step clock plays it (stepClock.ts, Hang's HangLive), so step `k`
 * is its stretch of the film: from the sum of the steps' times before it (`ms`, the cards' own) to the next step's start,
 * the last on to the film's end. Each time the cards come to a step (`k`, `turn`) its stretch plays: on from where the
 * film is if that is already in it (the step after the one just played, or the same step come round again, which, as the
 * 3D's, has nothing left to play), from its start otherwise (a step picked, the first again). It holds while the page
 * moves and while it is off the screen, as the 3D card is not drawn then, and catches up with the step's clock once it is
 * still and seen again. Fetched as the section comes near, streamed. Under reduced motion each step shows its end.
 */
export function StepFilm({ name, k, turn, ms }: { name: string; k: number; turn: number; ms: number[] }) {
  const video = useRef<HTMLVideoElement>(null)
  const [near, setNear] = useState(false)
  const seen = useRef(false)
  useEffect(() => {
    const v = video.current
    if (!v) return
    v.muted = true
    const ahead = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '150% 0px' })
    const io = new IntersectionObserver(([e]) => void (seen.current = e.isIntersecting))
    ahead.observe(v)
    io.observe(v)
    return () => {
      ahead.disconnect()
      io.disconnect()
    }
  }, [])

  useEffect(() => {
    const v = video.current
    if (!v || !near) return
    // (each step's start in the film, s: the steps' times before it)
    const starts = ms.map((_, i) => ms.slice(0, i).reduce((a, b) => a + b, 0) / 1000)
    let raf = 0
    let from = -1
    let t0 = 0
    const frame = 1 / FPS
    const run = () => {
      raf = 0
      if (v.readyState < 1) return void v.addEventListener('loadedmetadata', run, { once: true })
      const end = k < ms.length - 1 ? starts[k + 1] : v.duration
      // (its last frame, landed inside it)
      const last = end - 0.7 * frame
      if (from < 0) {
        const at = v.currentTime
        from = k === 0 || at < starts[k] - frame || at > end ? starts[k] : at
        t0 = performance.now()
      }
      if (prefersReducedMotion()) {
        if (!v.paused) v.pause()
        if (Math.abs(v.currentTime - last) > frame) v.currentTime = last
        return
      }
      const want = Math.min(last, from + (performance.now() - t0) / 1000)
      const still = performance.now() - movedAt > HOLD_MS && seen.current
      if (!still) {
        if (!v.paused) v.pause()
      } else if (want >= last) {
        if (!v.paused) v.pause()
        if (Math.abs(v.currentTime - last) > frame && !v.seeking) v.currentTime = last
        return
      } else {
        // (taken up where the step's clock is: sought only when it has fallen well behind, never chasing a frame)
        if (!v.seeking && Math.abs(v.currentTime - want) > (v.paused ? 1.5 * frame : 0.25)) v.currentTime = want
        if (v.paused) void v.play().catch(() => {})
      }
      raf = requestAnimationFrame(run)
    }
    run()
    return () => {
      cancelAnimationFrame(raf)
      v.removeEventListener('loadedmetadata', run)
      v.pause()
    }
  }, [k, turn, near, ms])

  return (
    <video
      ref={video}
      className="fc-film"
      src={near ? `${DIR}/${name}.mp4` : undefined}
      poster={`${DIR}/${name}.jpg`}
      muted
      playsInline
      preload={near ? 'auto' : 'none'}
      aria-hidden="true"
      disablePictureInPicture
      disableRemotePlayback
    />
  )
}
