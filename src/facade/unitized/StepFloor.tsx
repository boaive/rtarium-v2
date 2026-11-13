import { useRef, type CSSProperties, type RefObject, type TouchEvent } from 'react'
import { useClips, type Station } from './Stations'
import './step-floor.css'

/**
 * A section on a phone set as veedo.space sets "One system. Six footprints.": two small lines over its heading, the step's
 * line under it, and the step played over a floor drawn in perspective (the clip is see-through: the floor runs on behind
 * the model). Along the foot, a dash a step, the one in play filling as its clip runs (a tap goes to a step), and across
 * from them which step it is, large, with its name under it. It plays itself, step after step and round again, while it
 * is on the screen (`useClips`); a sideways swipe over the model goes back or on, and the button in the floor's corner
 * pauses it. One screen, scrolled past as any: a swipe up or down only ever moves the page.
 */
export function StepFloor({
  sectionRef,
  id,
  title,
  kicker,
  sub,
  items,
}: {
  sectionRef: RefObject<HTMLElement | null>
  id: string
  /** the section's heading */
  title: string
  /** the line over it, its two halves either side of a rule */
  kicker: [string, string]
  /** and the line under that */
  sub: string
  items: Station[]
}) {
  const n = items.length
  const { k, turn, playing, setPlaying, running, go, layer } = useClips(sectionRef, items)
  const item = items[k]
  const num = (i: number) => String(i + 1).padStart(2, '0')

  // a sideways swipe over the model: back or on a step (a swipe up or down is the page's)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    touch.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null
  }
  const onTouchEnd = (e: TouchEvent) => {
    const from = touch.current
    const t = e.changedTouches[0]
    touch.current = null
    if (!from || !t) return
    const dx = t.clientX - from.x
    const dy = t.clientY - from.y
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) go(k + (dx < 0 ? 1 : -1))
  }

  return (
    <section ref={sectionRef} id={id} className="fsf on-light" aria-labelledby={`${id}-title`} aria-roledescription="carousel">
      <div className="fsf__floor" aria-hidden="true" />
      <div className="fsf__pin">
        <p className="fsf__kicker">
          <span>{kicker[0]}</span>
          <i aria-hidden="true" />
          <span>{kicker[1]}</span>
        </p>
        <p className="fsf__sub">{sub}</p>
        <h2 id={`${id}-title`} className="fsf__title fu-h">
          {title}
        </h2>
        <p key={`l${k}`} className="fsf__line" aria-live={running ? 'off' : 'polite'}>
          {item.line}
        </p>
        <div className="fsf__stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => (touch.current = null)}>
          <img ref={layer(0)} className="fsf__clip" alt="" decoding="async" />
          <img ref={layer(1)} className="fsf__clip" alt="" decoding="async" />
          <button type="button" className="fsf__play" aria-label={playing ? 'Pause' : 'Play'} aria-pressed={!playing} onClick={() => setPlaying((p) => !p)}>
            {playing ? (
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d="M5 3v10M11 3v10" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d="M5 3l8 5-8 5z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
        <div className="fsf__foot">
          <ol className={`fsf__dashes ${running ? '' : 'is-paused'}`} aria-label="The steps">
            {items.map((it, i) => (
              <li key={it.name}>
                <button
                  type="button"
                  className={`fsf__dash ${i === k ? 'is-now' : ''}`}
                  aria-label={`Step ${i + 1}: ${it.name}`}
                  aria-current={i === k ? 'step' : undefined}
                  onClick={() => go(i)}
                >
                  {/* (the one in play fills as its clip runs, from the start each time it comes round) */}
                  {i === k && <span key={turn} className="fsf__fill" style={{ '--ms': `${it.ms}ms` } as CSSProperties} />}
                </button>
              </li>
            ))}
          </ol>
          <p className="fsf__big">
            <b key={`b${k}`} className="num">
              {num(k)}
            </b>
            <span className="fsf__of num">/ {num(n - 1)}</span>
          </p>
          <p key={`n${k}`} className="fsf__name">
            {item.name}
          </p>
        </div>
      </div>
    </section>
  )
}
