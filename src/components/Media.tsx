import { useEffect, useRef, useState, type ReactNode } from 'react'
import { REVIEW_MODE } from '../content/site'
import { useReducedMotion } from '../lib/motion'

/**
 * A short, silent loop of RTARIUM footage. Loads when it comes near, plays only while on screen,
 * has a pause control, and stays on its poster under reduced motion until the visitor plays it.
 */
export function VideoLoop({ src, poster, label, className = '' }: { src: string; poster: string; label: string; className?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const reduced = useReducedMotion()
  const [near, setNear] = useState(false)
  const [paused, setPaused] = useState(reduced)
  const visible = useRef(false)

  useEffect(() => setPaused(reduced), [reduced])

  useEffect(() => {
    const el = video.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        visible.current = e.isIntersecting
        if (e.isIntersecting) setNear(true)
        if (!e.isIntersecting) el.pause()
        else if (!paused) el.play().catch(() => {})
      },
      { rootMargin: '200px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [paused])

  useEffect(() => {
    const el = video.current
    if (!el || !near) return
    if (paused) el.pause()
    else if (visible.current) el.play().catch(() => {})
  }, [paused, near])

  return (
    <div className={`loop ${className}`}>
      <video ref={video} muted loop playsInline preload="none" poster={poster} aria-label={label} src={near ? src : undefined} />
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
