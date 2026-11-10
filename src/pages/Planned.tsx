import { useEffect } from 'react'
import { APPLICATIONS, SITE, contactConfigured } from '../content/site'
import { Link } from '../lib/router'
import { Contact } from './ContactForm'

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
  return (
    <Contact
      labelledBy="page-title"
      intro={
        <>
          <h1 id="page-title" className="contact__title">
            Contact
          </h1>
          <p className="contact__lede">Tell us about the project, the building, its floor or its walls, and we will come back to you.</p>
          {contactConfigured() ? (
            <ul className="page__points contact__points">
              {SITE.contact.email && (
                <li>
                  <a href={`mailto:${SITE.contact.email}`}>{SITE.contact.email}</a>
                </li>
              )}
              {SITE.contact.phone && <li>{SITE.contact.phone}</li>}
              {SITE.contact.address && <li>{SITE.contact.address}</li>}
            </ul>
          ) : null}
        </>
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
