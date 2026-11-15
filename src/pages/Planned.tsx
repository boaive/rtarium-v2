import { useEffect } from 'react'
import { APPLICATIONS, SITE } from '../content/site'
import { Link } from '../lib/router'
import { Contact } from './ContactForm'
import { setShared } from '../three/stageStore'

/**
 * Destinations the homepage links to that are outside this build. Each says plainly that its full
 * page is still to come and gives what is already confirmed, so no link from the homepage dead-ends.
 */
export function ApplicationPage({ id }: { id: string }) {
  const a = APPLICATIONS.find((x) => x.id === id)!
  useEffect(() => {
    document.title = `${a.title} · RTARIUM by HEMISPHERE ONE`
  }, [a])
  return (
    <section className="page" aria-labelledby="page-title">
      <div className="page__copy">
        <h1 id="page-title" className="page__title">
          {a.title}
        </h1>
        <p className="page__lede">{a.intro}</p>
        <ul className="page__points">
          {a.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="page__status">The full {a.title.toLowerCase()} section is in preparation: {a.pages.join(', ')}.</p>
        <div className="page__actions">
          <Link to="/#applications" className="pill pill--solid">
            Back to the homepage
          </Link>
          <Link to="/#tech" className="pill pill--line">
            Tech Space
          </Link>
        </div>
      </div>
      <figure className="page__media">
        <img src={a.image.src} alt={a.image.alt} style={{ objectPosition: a.image.position }} />
        <figcaption>{a.caption}</figcaption>
      </figure>
    </section>
  )
}

export function ContactPage() {
  useEffect(() => {
    document.title = 'Contact · RTARIUM by HEMISPHERE ONE'
  }, [])
  // the header takes the ground of whatever is under it, read on every scroll: the form's warm white (the header's words
  // stand over the form's half), the footer's yellow
  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      const page = document.querySelector<HTMLElement>('.contact')
      const footer = document.querySelector<HTMLElement>('.footer')
      let ground: 'light' | 'yellow' = 'light'
      for (const [el, g] of [[page, 'light'], [footer, 'yellow']] as const) {
        const r = el?.getBoundingClientRect()
        if (r && r.top <= 40 && r.bottom > 40) ground = g
      }
      setShared({ ground })
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    // (after the app's own reset of the header for a new page)
    on()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [])
  // (the email leads the page itself; any phone or address goes under it)
  return (
    <Contact
      labelledBy="page-title"
      points={
        SITE.contact.phone || SITE.contact.address ? (
          <ul className="contact__points">
            {SITE.contact.phone && <li>{SITE.contact.phone}</li>}
            {SITE.contact.address && <li>{SITE.contact.address}</li>}
          </ul>
        ) : null
      }
    />
  )
}

export function NotFound() {
  useEffect(() => {
    document.title = 'Page not found · RTARIUM by HEMISPHERE ONE'
  }, [])
  return (
    <section className="page" aria-labelledby="page-title">
      <div className="page__copy">
        <h1 id="page-title" className="page__title">
          This page does not exist.
        </h1>
        <p className="page__lede">The address may have changed. The homepage links to every section of the site.</p>
        <div className="page__actions">
          <Link to="/" className="pill pill--solid">
            Go to the homepage
          </Link>
        </div>
      </div>
    </section>
  )
}
