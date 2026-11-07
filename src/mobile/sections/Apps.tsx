import type { CSSProperties } from 'react'
import { APPLICATIONS } from '../../content/site'
import { Link } from '../../lib/router'
import { Eyebrow, Words } from '../ui'

/**
 * Where it goes: the three application pages, as cards that are each one large link. The photo
 * first, then the title and the client's own points under it on clear ground, so nothing has to be
 * read over a picture.
 */
export function Apps() {
  return (
    <section id="applications" className="m-sec m-apps on-light" data-m-ground="light" data-m-chapter="applications" aria-labelledby="apps-title">
      <div className="m-sec__head">
        <Eyebrow>Applications</Eyebrow>
        <Words id="apps-title" lines={['Built into three', 'applications.']} className="m-display" />
      </div>
      <ul className="m-apps__list">
        {APPLICATIONS.map((a, i) => (
          <li key={a.id} data-reveal="" style={{ '--d': i } as CSSProperties}>
            <Link to={a.path} className="m-app">
              <span className="m-app__media">
                <img src={a.image.src} alt={a.image.alt} loading="lazy" decoding="async" style={{ objectPosition: a.image.position }} />
                <span className="m-app__n num">0{i + 1}</span>
              </span>
              <span className="m-app__body">
                <span className="m-app__title">{a.title}</span>
                <span className="m-app__points">
                  {a.points.map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                </span>
              </span>
              <span className="m-app__go" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="18" height="18">
                  <path d="M4 12 12 4M5.5 4H12v6.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
                </svg>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
