import { useEffect, useRef, useState, type ReactNode } from 'react'
import { REVIEW_MODE } from '../content/site'
import { useIsCompact, useReducedMotion } from '../lib/motion'
import { FILM_STEPS, dropFilm, filmReady, seenFilm } from '../lib/films'

/**
 * A short, silent loop of RTARIUM footage. Loads when it comes near, plays only while on screen,
 * has a pause control, and stays on its poster under reduced motion until the visitor plays it.
 */
export function VideoLoop({ src, small, poster, label, className = '' }: { src: string; small?: string; poster: string; label: string; className?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const reduced = useReducedMotion()
  // (a phone takes the small cut, where there is one)
  const compact = useIsCompact()
  const [near, setNear] = useState(false)
  const [paused, setPaused] = useState(reduced)
  const seen = useRef(0)

  useEffect(() => setPaused(reduced), [reduced])

  // loaded as it comes near; it plays while it is the film most in view on the page (one at a time: lib/films), unless
  // the visitor has paused it
  useEffect(() => {
    const el = video.current
    if (!el) return
    el.muted = true
    const ahead = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '200px 0px' })
    ahead.observe(el)
    const watch = new IntersectionObserver(
      ([e]) => {
        seen.current = e.intersectionRatio
        seenFilm(el, seen.current, paused)
      },
      { threshold: FILM_STEPS },
    )
    watch.observe(el)
    seenFilm(el, seen.current, paused)
    if (paused) el.pause()
    el.addEventListener('loadeddata', filmReady)
    return () => {
      ahead.disconnect()
      watch.disconnect()
      el.removeEventListener('loadeddata', filmReady)
      dropFilm(el)
    }
  }, [paused])

  return (
    <div className={`loop ${className}`}>
      <video ref={video} muted loop playsInline preload="none" poster={poster} aria-label={label} src={near ? (compact && small ? small : src) : undefined} />
      <button type="button" className="loop__toggle" onClick={() => setPaused((p) => !p)} aria-pressed={!paused}>
        <span className={`loop__icon ${paused ? 'is-paused' : ''}`} aria-hidden="true" />
        {paused ? 'Play footage' : 'Pause footage'}
      </button>
    </div>
  )
}

/** An open question about a figure, shown only when the page is opened with `?review`. */
export function ReviewNote({ children }: { children: ReactNode }) {
  if (!REVIEW_MODE) return null
  return <span className="review">{children}</span>
}
