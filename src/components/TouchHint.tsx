import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion'

/** how long a hint stays (ms), unless a touch comes first */
const SHOWN_MS = 3400
/** the hints a visitor has seen this visit: each is shown once */
const SEEN = 'rtarium:hints'

function seen(id: string) {
  try {
    return (sessionStorage.getItem(SEEN) ?? '').split(',').includes(id)
  } catch {
    return false
  }
}
function markSeen(id: string) {
  try {
    const all = new Set((sessionStorage.getItem(SEEN) ?? '').split(',').filter(Boolean))
    all.add(id)
    sessionStorage.setItem(SEEN, [...all].join(','))
  } catch {
    /* (a browser that keeps nothing shows the hint again on a later visit to it: harmless) */
  }
}

/**
 * A word on how a phone's 3D screen is worked, shown once a visit, the first time the screen is reached (`when`): a
 * sideways swipe for more (`swipe`), or press and hold to turn the mesh (`hold`). It goes after a few seconds, or as soon
 * as the visitor touches the screen.
 */
export function TouchHint({ id, when, icon, text, className = '' }: { id: string; when: boolean; icon: 'swipe' | 'hold'; text: string; className?: string }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!when || seen(id)) return
    markSeen(id)
    setOn(true)
    const off = () => setOn(false)
    const timer = window.setTimeout(off, SHOWN_MS)
    // (a touch anywhere: the visitor is at it already)
    const touched = window.setTimeout(() => window.addEventListener('pointerdown', off, { once: true }), 400)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(touched)
      window.removeEventListener('pointerdown', off)
    }
  }, [id, when])
  return (
    <p className={`thint thint--${icon} ${on ? 'is-on' : ''} ${prefersReducedMotion() ? 'is-still' : ''} ${className}`} role="status" aria-hidden={!on}>
      {icon === 'swipe' ? (
        <svg className="thint__mark" viewBox="0 0 28 16" width="26" height="15" aria-hidden="true">
          <path d="M3 8h22M7.5 3.5 3 8l4.5 4.5M20.5 3.5 25 8l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <circle className="thint__dot" cx="14" cy="8" r="2.4" fill="currentColor" />
        </svg>
      ) : (
        <svg className="thint__mark" viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
          <circle cx="10" cy="10" r="3.2" fill="currentColor" />
          <circle className="thint__ring" cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )}
      {text}
    </p>
  )
}
