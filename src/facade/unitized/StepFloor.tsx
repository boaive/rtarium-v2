import { type CSSProperties, type ReactNode, type RefObject } from 'react'
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
  scene,
  once = false,
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
  /** the live scene in place of the clips, given the step in play and each time it comes round (Hang: its 3D) */
  scene?: (k: number, turn: number) => ReactNode
  /** played through once, held on the last step, a replay offered by the dashes */
  once?: boolean
}) {
  const n = items.length
  const { k, turn, playing, setPlaying, running, ended, go, layer } = useClips(sectionRef, items, once)
  const item = items[k]
  const num = (i: number) => String(i + 1).padStart(2, '0')

  // (no sideways swipe over the model: a finger there only ever moves the page; the dashes and the skip pick a step)

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
        <div className="fsf__stage">
          {scene ? (
            scene(k, turn)
          ) : (
            <>
              <img ref={layer(0)} className="fsf__clip" alt="" decoding="async" />
              <img ref={layer(1)} className="fsf__clip" alt="" decoding="async" />
            </>
          )}
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
          <ol className={`fsf__dashes ${running ? '' : 'is-paused'} ${ended ? 'is-ended' : ''}`} aria-label="The steps">
            {items.map((it, i) => (
              <li key={it.name} style={{ '--i': i } as CSSProperties}>
                <button
                  type="button"
                  className={`fsf__dash ${i === k ? 'is-now' : ''}`}
                  aria-label={`Step ${i + 1}: ${it.name}`}
                  aria-current={i === k ? 'step' : undefined}
                  // (played through once: the step picked is shown and held on, never run on to the end again)
                  onClick={() => go(i, once && ended)}
                >
                  {/* (the one in play fills as its clip runs, from the start each time it comes round) */}
                  {i === k && <span key={turn} className="fsf__fill" style={{ '--ms': `${it.ms}ms` } as CSSProperties} />}
                </button>
              </li>
            ))}
          </ol>
          {/* before it has played through, the way straight to its last step (which then offers every step to be picked) */}
          {once && !ended && k < n - 1 && (
            <button type="button" className="fsf__again fsf__skip" onClick={() => go(n - 1)}>
              Skip to the end
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path d="M2.5 8h10M8.5 3.5 13 8l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            </button>
          )}
          {/* played through: as the wide screen's bar says it, over the dashes, which ripple to show they can be picked */}
          {ended && (
            <p className="fsf__again" role="status">
              Tap to view a step
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path d="M8 2.5v10M3.5 8.5 8 13l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            </p>
          )}
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
