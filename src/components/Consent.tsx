import { useEffect, useRef } from 'react'
import { Link } from '../lib/router'
import { acceptAnalytics, closeConsentSettings, declineAnalytics, useConsent } from '../lib/analytics'

/**
 * The analytics notice: one small plate at the foot of the screen until the visitor has answered, and again whenever
 * "Cookie settings" in the footer is chosen. Accept and Decline are the same size and weight, and neither is pre-chosen;
 * until Accept, nothing is measured and Google is not contacted.
 */
export function Consent() {
  const { choice, open } = useConsent()
  const show = choice === null || open
  const ref = useRef<HTMLElement>(null)

  // a notice the visitor opened themselves (Cookie settings) takes the keyboard; one that simply appears does not
  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLElement>('button')?.focus()
  }, [open])

  // Escape closes a notice that was opened from the footer (it keeps the choice already made)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeConsentSettings()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!show) return null
  return (
    <section ref={ref} className="consent" aria-labelledby="consent-title">
      <h2 id="consent-title" className="consent__title">
        Measuring this site
      </h2>
      <p className="consent__text">
        With your agreement we use Google Analytics to count visits and see which pages are read. It sets cookies. Nothing is
        sent to Google unless you accept.{' '}
        <Link to="/privacy">Privacy</Link>
      </p>
      <div className="consent__actions">
        <button type="button" className="consent__btn" onClick={declineAnalytics}>
          Decline
        </button>
        <button type="button" className="consent__btn" onClick={acceptAnalytics}>
          Accept
        </button>
      </div>
    </section>
  )
}
