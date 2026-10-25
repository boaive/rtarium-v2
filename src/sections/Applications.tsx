import { useRef, type CSSProperties } from 'react'
import { APPLICATIONS } from '../content/site'
import { Link } from '../lib/router'
import { useScreen } from '../components/Chapter'

/** One warm-white screen: the three applications side by side, full height. */
export function Applications() {
  const ref = useRef<HTMLElement>(null)
  useScreen(ref, 'applications', 'light')
  return (
    <section id="applications" ref={ref} className="apps" aria-labelledby="apps-title" data-screen="light">
      <header className="apps__head">
        <h2 id="apps-title" className="apps__title">
          Built into three applications.
        </h2>
      </header>
      <ul className="apps__row">
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
