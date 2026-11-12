import { useEffect, type RefObject } from 'react'
import { Link } from '../lib/router'
import { Arrow } from './Shell'

/**
 * On a phone, the close's choice of systems (or applications) without its cards: the models stay in the middle of the
 * screen with the chosen one lit (the trio's `hover`), the numbers under them to pick from, and under those the one
 * chosen: its name, its line and the way in. A sideways swipe across the models or the words picks the next or the one
 * before.
 */
export interface PickItem {
  /** its number among all of them (from 1), as the wide screen's columns number them */
  n: number
  title: string
  line: string
  path: string
}

export function PhonePick({ items, at, onPick, swipeRef }: { items: PickItem[]; at: number; onPick: (i: number) => void; swipeRef: RefObject<HTMLElement | null> }) {
  const go = (i: number) => onPick(Math.min(items.length - 1, Math.max(0, i)))

  // a sideways swipe moves one along; an upright one scrolls the page on
  useEffect(() => {
    const el = swipeRef.current
    if (!el) return
    const g = { id: -1, x: 0, y: 0 }
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || (e.target as HTMLElement | null)?.closest?.('a, button')) return
      g.id = e.pointerId
      g.x = e.clientX
      g.y = e.clientY
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== g.id) return
      g.id = -1
      const dx = e.clientX - g.x
      const dy = e.clientY - g.y
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.3) go(at + (dx < 0 ? 1 : -1))
    }
    const cancel = (e: PointerEvent) => {
      if (e.pointerId === g.id) g.id = -1
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  })

  const it = items[at]
  const n = items.length
  return (
    <div className="pick">
      {/* under the model, as vee-build's: what it is on the left, which of how many and back and on on the right */}
      <div className="pick__bar">
        <p key={it.path} className="pick__label">
          <span className="pick__tag num">— 0{it.n}</span>
          <span className="pick__name">{it.title}</span>
        </p>
        <div className="pick__ctrl">
          <span className="pick__count num" aria-live="polite">
            <b>0{at + 1}</b> / 0{n}
          </span>
          <button type="button" className="pick__arrow" onClick={() => go(at - 1)} disabled={at === 0} aria-label={at > 0 ? `Previous: ${items[at - 1].title}` : 'Previous'}>
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
          <button type="button" className="pick__arrow" onClick={() => go(at + 1)} disabled={at === n - 1} aria-label={at < n - 1 ? `Next: ${items[at + 1].title}` : 'Next'}>
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>
      </div>
      <div key={it.path} className="pick__body">
        <p className="pick__line">{it.line}</p>
        <Link to={it.path} className="pick__go">
          Explore
          <span aria-hidden="true">
            <Arrow />
          </span>
        </Link>
      </div>
    </div>
  )
}
