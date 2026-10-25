import { useRef } from 'react'
import { Link } from '../lib/router'
import { APPLICATIONS, SITE } from '../content/site'
import { useScreen } from './Chapter'
import { LiquidMesh } from './LiquidMesh'

/** The footer's content. `inverse` is the yellow-on-black copy shown only inside the liquid drop. */
function FooterContent({ inverse = false }: { inverse?: boolean }) {
  const Map = inverse ? 'div' : 'nav'
  return (
    <>
      <div className="footer__top">
        <p className="footer__line">Bring us the floor, façade or wall you are planning.</p>
        <Link to="/contact" className="pill pill--ink footer__cta">
          Contact HEMISPHERE ONE
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M4 12 12 4M5.5 4H12v6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </Link>
      </div>

      <Map className="footer__map" aria-label={inverse ? undefined : 'Site map'}>
        <div>
          <h2 className="footer__head">Technology</h2>
          <ul>
            <li>
              <Link to="/#about">About RTARIUM</Link>
            </li>
            <li>
              <Link to="/#innovation">Innovation</Link>
            </li>
            <li>
              <Link to="/#tech">Tech Space</Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="footer__head">Applications</h2>
          <ul>
            {APPLICATIONS.map((a) => (
              <li key={a.id}>
                <Link to={a.path}>{a.title}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="footer__head">Company</h2>
          <ul>
            <li>
              <Link to="/contact">Contact</Link>
            </li>
            {SITE.contact.email && (
              <li>
                <a href={`mailto:${SITE.contact.email}`}>{SITE.contact.email}</a>
              </li>
            )}
          </ul>
        </div>
        <p className="footer__legal">
          Technical figures describe the tested materials and configurations. The 3D model is a visual reconstruction made to
          explain the product. Applications are subject to project-specific engineering and validation.
        </p>
      </Map>

      <div className="footer__name">
        <p className="footer__word" aria-hidden="true">
          RTARIUM
        </p>
        <p className="footer__base">
          <span>© {new Date().getFullYear()} RTARIUM by HEMISPHERE ONE</span>
          <img src={inverse ? '/brand/hemisphere-one-logo.png' : '/brand/hemisphere-one-logo-ink.png'} alt={inverse ? '' : 'HEMISPHERE ONE'} width={2185} height={720} />
        </p>
      </div>
    </>
  )
}

/**
 * The close: one full yellow screen, the next step, the site map, and the name set at full width.
 * A small drop of liquid carrying the mesh follows the cursor over it; inside the drop the footer
 * reads yellow on black (an exact copy clipped to the drop, not a blend).
 */
export function Footer({ home = false }: { home?: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const inverse = useRef<HTMLDivElement>(null)
  useScreen(ref, 'footer', 'yellow')
  return (
    <footer ref={ref} className={`footer ${home ? 'footer--screen' : ''}`} data-screen="yellow">
      <div className="footer__body">
        <FooterContent />
      </div>
      <LiquidMesh reveal={inverse} />
      <div ref={inverse} className="footer__body footer__body--inverse" aria-hidden="true" inert>
        <FooterContent inverse />
      </div>
    </footer>
  )
}
