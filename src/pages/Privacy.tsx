import { useEffect } from 'react'
import { GA_ID, openConsentSettings, useConsent } from '../lib/analytics'
import { SITE } from '../content/site'

/**
 * The privacy notice. It says only what the site does today: the enquiry form, the check that a person is sending it,
 * the host, and Google Analytics (off until accepted). HEMISPHERE ONE should read it before launch and add anything its
 * own policy requires (the company's registered details, how long enquiries are kept).
 */
export function PrivacyPage() {
  const { choice } = useConsent()
  useEffect(() => {
    document.title = 'Privacy · RTARIUM by HEMISPHERE ONE'
  }, [])
  const mail = SITE.contact.email
  const cookie = `_ga_${GA_ID.replace('G-', '')}`
  return (
    <section className="legal" aria-labelledby="page-title">
      <div className="legal__inner">
        <header className="legal__section">
          <h1 id="page-title" className="legal__title">
            Privacy
          </h1>
          <p className="legal__lede">
            This site is run by {SITE.by}. This page says what it collects, why, and how to change your mind. Questions
            go to <a href={`mailto:${mail}`}>{mail}</a>.
          </p>
        </header>

        <div className="legal__section">
          <h2>If you send an enquiry</h2>
          <p>
            The form asks for your name, email, area of interest and message, and, if you choose to give them, your phone
            number and company. We use them to reply to you. The enquiry is emailed to our team, you receive a
            confirmation, and a record is kept so it is not lost.
          </p>
          <p>
            Before an enquiry is accepted, Cloudflare Turnstile checks that a person is sending it, and your network
            address is used to limit how many enquiries one address can send in a minute.
          </p>
        </div>

        <div className="legal__section">
          <h2>Hosting</h2>
          <p>
            The site is served by Cloudflare, which handles the requests your browser makes in order to deliver and protect
            the pages.
          </p>
        </div>

        <div className="legal__section">
          <h2>Analytics, only if you accept</h2>
          <p>
            If you accept, we use Google Analytics to count visits and see which pages and sections are read and for how
            long, which links and buttons are used, how people arrive, and the kind of device and browser they use, so we
            can improve the site. It sets two cookies,{' '}
            <code>_ga</code> and <code>{cookie}</code>. We do not send what you type into the enquiry form, or your name or
            email address.
          </p>
          <p>
            If you decline, or do not answer, Google Analytics is not loaded and nothing is sent to Google. You can
            change your answer at any time. Declining removes the cookies it set.
          </p>
          <p>
            Your answer is kept in your browser only{choice ? `. At the moment it is: ${choice === 'granted' ? 'accepted' : 'declined'}` : ', and none has been given yet'}.
          </p>
          <button type="button" className="pill pill--solid legal__button" onClick={openConsentSettings}>
            Change my choice
          </button>
        </div>

        <div className="legal__section">
          <h2>Your rights</h2>
          <p>
            You can ask us what we hold about you, to correct it, or to delete it, by writing to{' '}
            <a href={`mailto:${mail}`}>{mail}</a>. You may also complain to your local data protection authority.
          </p>
        </div>

        <p className="legal__updated">Last updated 16 November 2026.</p>
      </div>
    </section>
  )
}
