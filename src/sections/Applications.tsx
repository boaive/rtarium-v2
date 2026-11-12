import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from 'react'
import { APPLICATIONS } from '../content/site'
import { Link } from '../lib/router'
import { useScreen } from '../components/Chapter'
import { useIsCompact } from '../lib/motion'
import { useMarkIn } from '../lib/reveal'
import { PhonePick } from '../facade/PhonePick'

const AppModel = lazy(() => import('./AppModel'))

/**
 * A phone's applications, set as the façade pages' "Three ways onto a building": the heading over a hairline, one
 * application's 3D model at a time, large (its photograph until the model has come), and under it the same picker (its number and name; which of three, back and
 * on; its line and the way in). A sideways swipe across the picture or the words moves one along.
 */
function PhoneApplications() {
  const ref = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  // the models come once the section is near (their own chunk), play while it is on the screen, and draw only then
  const [near, setNear] = useState(false)
  const [play, setPlay] = useState(false)
  const live = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ahead = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '100% 0px' })
    const seen = new IntersectionObserver(([e]) => {
      live.current = e.isIntersecting
      if (e.isIntersecting) setPlay(true)
    })
    ahead.observe(el)
    seen.observe(el)
    return () => {
      ahead.disconnect()
      seen.disconnect()
    }
  }, [])
  useScreen(ref, 'applications', 'light')
  const a = APPLICATIONS[at]
  return (
    <section id="applications" ref={ref} className="apps apps--pick" aria-labelledby="apps-title" data-screen="light" data-flow="">
      <header className="apps__head">
        <h2 id="apps-title" className="apps__title">
          Built into three applications.
        </h2>
      </header>
      <div ref={stage} className="apps__stage">
        <div className="apps__model" role="img" aria-label={a.image.alt}>
          {near && (
            <Suspense fallback={<img className="apps__still" src={a.image.src} alt="" style={{ objectPosition: a.image.position }} />}>
              <AppModel id={a.id} play={play} live={live} still={a.image.src} />
            </Suspense>
          )}
        </div>
        <PhonePick items={APPLICATIONS.map((x, i) => ({ n: i + 1, title: x.title, line: x.points.join(' · '), path: x.path }))} at={at} onPick={setAt} swipeRef={stage} />
      </div>
    </section>
  )
}

/** One warm-white screen: the three applications side by side, full height. */
export function Applications() {
  const compact = useIsCompact()
  return compact ? <PhoneApplications /> : <WideApplications />
}

function WideApplications() {
  const ref = useRef<HTMLElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const compact = useIsCompact()
  useScreen(ref, 'applications', 'light')
  // on a phone the three are cards in one continuous run; each rises in as it comes up from the foot of the screen (mobile.css)
  useMarkIn(list, '.app', compact)
  return (
    <section
      id="applications"
      ref={ref}
      className="apps"
      aria-labelledby="apps-title"
      data-screen="light"
      // a phone reads the cards at its own pace: the page is not brought to a screen inside them (lib/scroll.ts)
      data-flow={compact ? '' : undefined}
      data-reveal={compact ? '' : undefined}
    >
      <header className="apps__head">
        <h2 id="apps-title" className="apps__title">
          Built into three applications.
        </h2>
      </header>
      <ul ref={list} className="apps__row">
        {APPLICATIONS.map((a, i) => (
          <li key={a.id} className="app" style={{ '--i': i } as CSSProperties}>
            <Link to={a.path} className="app__link">
              <img className="app__img" src={a.image.src} alt={a.image.alt} loading="lazy" style={{ objectPosition: a.image.position }} />
              <span className="app__shade" aria-hidden="true" />
              <span className="app__index num">0{i + 1}</span>
              <span className="app__body">
                <span className="app__title">{a.title}</span>
                <span className="app__points">
                  {a.points.map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                </span>
                <span className="app__more">
                  Explore
                  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                    <path d="M4 12 12 4M5.5 4H12v6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
