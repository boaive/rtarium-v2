import { useSyncExternalStore } from 'react'

/**
 * Google Analytics 4, behind the visitor's consent.
 *
 * - Google's script is not loaded, and nothing is sent, until the visitor accepts. A refusal (or no answer) leaves the
 *   page exactly as it was.
 * - It runs only on the real site. On localhost or a preview address the same calls are logged to the console instead
 *   (`[analytics]`), so a test never reaches the real property.
 * - Page views are sent by hand, once per route (the site is one page that changes its address without reloading), so
 *   switch off "Page changes based on browser history events" under Enhanced measurement in the data stream, or each
 *   move would count twice.
 * - No personal data goes into an event: no form content, no email address, only what happened and where.
 */

/** the data stream's Measurement ID (public: it is in every page that uses it) */
export const GA_ID = 'G-RXZTHDP3YP'
/** the only addresses that report to the property */
const LIVE_HOSTS = ['rtarium.com', 'www.rtarium.com']
const LIVE = typeof window !== 'undefined' && LIVE_HOSTS.includes(window.location.hostname)
const KEY = 'rtarium:consent'

export type Choice = 'granted' | 'denied' | null
type State = { choice: Choice; open: boolean }

const w = window as unknown as Record<string, unknown> & { dataLayer?: unknown[] }

function read(): Choice {
  try {
    const v = window.localStorage.getItem(KEY)
    return v === 'granted' || v === 'denied' ? v : null
  } catch {
    return null
  }
}

let state: State = { choice: read(), open: false }
const listeners = new Set<() => void>()
const set = (next: Partial<State>) => {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export const subscribeConsent = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const getConsent = () => state
/** the banner shows until the visitor has answered, and again whenever "Cookie settings" is chosen */
export function useConsent() {
  return useSyncExternalStore(subscribeConsent, getConsent, getConsent)
}

/* ---- the Google tag ---------------------------------------------------------------------------- */

let loaded = false

// gtag.js reads the `arguments` object itself, so the call has to be pushed as one (not as an array)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function send(..._call: unknown[]) {
  // eslint-disable-next-line prefer-rest-params
  const call = arguments
  ;(w.dataLayer ??= []).push(call)
  if (!LIVE) console.debug('[analytics]', ...Array.from(call))
}

function load() {
  if (loaded) return
  loaded = true
  w.dataLayer = w.dataLayer || []
  send('js', new Date())
  // page views are sent by hand (trackPage), so the tag's own first one is off
  send('config', GA_ID, { send_page_view: false })
  if (!LIVE) return
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(s)
}

/** Google's cookies for this property, removed when a visitor who had accepted changes their mind */
function clearCookies() {
  const names = ['_ga', `_ga_${GA_ID.replace('G-', '')}`]
  const parts = window.location.hostname.split('.')
  const domains = ['', window.location.hostname]
  for (let i = 1; i < parts.length - 1; i++) domains.push('.' + parts.slice(i).join('.'))
  for (const n of names)
    for (const d of domains) document.cookie = `${n}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`
}

export function acceptAnalytics() {
  try {
    window.localStorage.setItem(KEY, 'granted')
  } catch {}
  w[`ga-disable-${GA_ID}`] = false
  set({ choice: 'granted', open: false })
  load()
}

export function declineAnalytics() {
  try {
    window.localStorage.setItem(KEY, 'denied')
  } catch {}
  // Google's own switch: from here the tag sends nothing, even if it is already on the page
  w[`ga-disable-${GA_ID}`] = true
  clearCookies()
  set({ choice: 'denied', open: false })
}

export const openConsentSettings = () => set({ open: true })
export const closeConsentSettings = () => set({ open: false })

/* ---- what is measured ------------------------------------------------------------------------- */

const granted = () => state.choice === 'granted'

/** which part of the site a path belongs to, so reports can be read by section */
export function sectionOf(path: string) {
  if (path === '/') return 'home'
  return path.split('/')[1] || 'home'
}

/** one page view: the path (never the query or hash), the page's own title, and its section */
export function trackPage(path: string) {
  if (!granted()) return
  send('event', 'page_view', {
    page_location: `${window.location.origin}${path === '/' ? '/' : path}`,
    page_path: path,
    page_title: document.title,
    content_group: sectionOf(path),
  })
}

/** an event with no personal data in it */
export function track(name: string, params: Record<string, string | number | boolean> = {}) {
  if (!granted()) return
  send('event', name, params)
}

/** an enquiry reached the team: Google's own "lead" event, marked as a key event in the property */
export const trackEnquiry = (interest?: string) => track('generate_lead', { method: 'enquiry_form', ...(interest ? { interest } : {}) })

/** every email link, wherever it is, counts as a click on the email */
function onClick(e: MouseEvent) {
  const a = (e.target as Element | null)?.closest?.('a[href^="mailto:"]')
  if (!a) return
  track('click_email', { page_path: window.location.pathname, link_location: a.closest('footer') ? 'footer' : 'page' })
}

/** called once, when the site starts: a visitor who already accepted is measured from the first page */
export function startAnalytics() {
  document.addEventListener('click', onClick, { capture: true })
  if (state.choice === 'granted') load()
  else if (state.choice === 'denied') w[`ga-disable-${GA_ID}`] = true
}
