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
 *   its poster, the first frame: ffmpeg -i master.mp4 -frames:v 1 -vf "scale=in_color_matrix=bt601:in_range=tv,format=rgb24" -q:v 6 <name>.jpg
 *
 * The films so far (Nov 2026):
 *   facade-hero          Façade & Cladding's opening: the pour (2.5 s), then its height of scroll (49 frames), 600x1300
 *   systems-<id>         each façade system's card at the foot of the façade pages (More), one 16 s sway, 600x812
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
