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

export const granted = () => state.choice === 'granted'

/** which part of the site a path belongs to, so reports can be read by section (an address that is no page is "not-found") */
const GROUPS = new Set(['facade-cladding', 'advanced-flooring', 'wall-panels', 'contact', 'privacy'])
export function sectionOf(path: string) {
  if (path === '/') return 'home'
  const first = path.split('/')[1] ?? ''
  return GROUPS.has(first) ? first : 'not-found'
}

/** the campaign tags a shared link may carry ("?utm_source=linkedin&utm_medium=social&utm_campaign=launch"), and nothing else of the query */
const CAMPAIGN_TAGS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id']
function campaignQuery() {
  const from = new URLSearchParams(window.location.search)
  const keep = new URLSearchParams()
  for (const k of CAMPAIGN_TAGS) {
    const v = from.get(k)
    if (v) keep.set(k, v.slice(0, 100))
  }
  const q = keep.toString()
  return q ? `?${q}` : ''
}

/**
 * one page view: the path (never the hash or any query but the campaign tags, so reports can tell where a visitor came
 * from), the page's own title, and its section
 */
export function trackPage(path: string) {
  if (!granted()) return
  send('event', 'page_view', {
    page_location: `${window.location.origin}${path === '/' ? '/' : path}${campaignQuery()}`,
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

/** the enquiry form: where in it a visitor got to, and what stopped them (field names and steps only, never what was typed) */
export const trackForm = (name: 'form_start' | 'form_step' | 'form_error' | 'form_send_failed', params: Record<string, string | number> = {}) =>
  track(name, { page_path: window.location.pathname, ...params })

/** a page that does not exist was asked for (the address is the path only) */
export const trackNotFound = () => track('not_found', { page_path: window.location.pathname })

/** a script error on the page, at most three a visit, with no addresses or personal data in it */
let errors = 0
export function startErrorReport() {
  window.addEventListener('error', (e) => {
    if (!granted() || errors >= 3 || !e.message) return
    errors++
    track('exception', { description: clean(e.message, 100), fatal: false, page_path: window.location.pathname })
  })
}

/* ---- sections and clicks ---------------------------------------------------------------------- */

const clean = (s: string | null | undefined, max = 80) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** a section's name as a reader knows it: its heading, else its label (stepped chapters have no heading), else its id; the footer is "Footer" */
export function sectionName(el: Element, i = 0) {
  if (el.tagName === 'FOOTER') return 'Footer'
  const h = el.querySelector<HTMLElement>('h1, h2')
  return clean(h ? wordsOf(h) : '') || clean(el.getAttribute('aria-label')) || el.id || `Section ${i + 1}`
}

/** the words under an element as they were written (not as the page's CSS shouts them), pictures by their description */
function wordsOf(n: Node): string {
  if (n.nodeType === 3) return n.textContent ?? ''
  if (!(n instanceof Element) || n.getAttribute('aria-hidden') === 'true' || n.tagName.toLowerCase() === 'svg') return ''
  if (n.tagName === 'IMG') return ` ${n.getAttribute('alt') ?? ''} `
  return ` ${[...n.childNodes].map(wordsOf).join('')} `
}

/** "Next Next" (a label drawn twice) is "Next" */
function once(t: string) {
  const w = t.split(' ')
  const h = w.length / 2
  return w.length > 1 && Number.isInteger(h) && w.slice(0, h).join(' ') === w.slice(h).join(' ') ? w.slice(0, h).join(' ') : t
}

/**
 * What a link or button is called in reports. Its own `data-track` wins; then the name it was given for screen readers
 * ("Skip: go past the six layers", "Open Clumping in a larger view"); then its words, with the logo link reading
 * "RTARIUM by HEMISPHERE ONE" and no label counted twice.
 */
function labelOf(el: Element) {
  return clean(el.getAttribute('data-track')) || clean(el.getAttribute('aria-label')) || once(clean(wordsOf(el), 200)).slice(0, 80) || clean((el as HTMLElement).title)
}

/** the page's own sections: the outermost <section>s in <main>, and the footer */
function pageSections() {
  const main = document.querySelector('main')
  const list: Element[] = main ? [...main.querySelectorAll('section')].filter((s) => !s.parentElement?.closest('main section') && !s.matches('[role="tabpanel"], .wp-sheet__block')) : []
  const footer = document.querySelector('footer.footer')
  if (footer) list.push(footer)
  return list
}

/** where on the page a click happened: the header, the footer, or the section it is in */
function whereOf(el: Element) {
  // a dialog sits over the page, outside its sections (and its own heading is a <header>): it is named by its title
  const dlg = el.closest('dialog')
  if (dlg) return { click_location: 'dialog', section_name: clean(dlg.querySelector('h1, h2, h3')?.textContent) || clean(dlg.getAttribute('aria-label')) || 'Dialog' }
  if (el.closest('footer')) return { click_location: 'footer', section_name: 'Footer' }
  if (el.closest('header, .nav')) return { click_location: 'header', section_name: 'Header' }
  const all = pageSections()
  const s = el.closest('main section')
  const top = s && all.find((x) => x.contains(s))
  return { click_location: 'page', section_name: top ? sectionName(top, all.indexOf(top)) : '' }
}

/**
 * Time on each section: the section that holds the middle of the screen is the one being read. When another takes
 * its place (or the page changes, or the tab is hidden), one `section_view` goes out with the seconds it was read;
 * under a second is a pass, not a read, and is not sent.
 */
export function startSectionTimer(path: string) {
  if (!granted() || typeof IntersectionObserver === 'undefined') return () => {}
  const names = new Map<Element, string>()
  let current: Element | null = null
  let since = 0

  const flush = () => {
    if (current && since) {
      const seconds = Math.round((performance.now() - since) / 1000)
      if (seconds >= 1)
        track('section_view', { section_name: names.get(current) ?? '', page_path: path, content_group: sectionOf(path), section_seconds: seconds })
    }
    since = 0
  }
  const enter = (el: Element | null) => {
    if (el === current) return
    flush()
    current = el
    since = el && document.visibilityState === 'visible' ? performance.now() : 0
  }

  // a line across the middle of the screen: a section is "in" while it crosses it
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) enter(e.target)
        else if (e.target === current) enter(null)
      }
    },
    { rootMargin: '-50% 0px -50% 0px', threshold: 0 },
  )
  const scan = () =>
    pageSections().forEach((el, i) => {
      if (names.has(el)) return
      names.set(el, sectionName(el, i))
      io.observe(el)
    })

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
    else if (current) since = performance.now()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', flush)
  // the page's sections are there at once; a page loaded in its own chunk brings them a moment later
  scan()
  const later = window.setTimeout(scan, 3000)

  return () => {
    window.clearTimeout(later)
    flush()
    io.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', flush)
  }
}

/** a link's address as reports read it: a path on this site, the whole address elsewhere */
function linkOf(a: HTMLAnchorElement) {
  try {
    const u = new URL(a.href, window.location.href)
    return u.origin === window.location.origin ? u.pathname + u.hash : u.origin + u.pathname
  } catch {
    return ''
  }
}

/**
 * Every click on a link or button: what it said, where it led, and where it was (header, footer, or which section).
 * Email links are `click_email`; the analytics notice's own buttons are not counted.
 */
function onClick(e: MouseEvent) {
  const el = (e.target as Element | null)?.closest?.('a, button') as HTMLAnchorElement | HTMLButtonElement | null
  if (!el || el.closest('.consent')) return
  const where = whereOf(el)
  if (el instanceof HTMLAnchorElement && el.href.startsWith('mailto:')) {
    track('click_email', { page_path: window.location.pathname, link_location: where.click_location })
    return
  }
  const text = labelOf(el) || '(no label)'
  track('button_click', {
    button_text: text,
    ...(el instanceof HTMLAnchorElement ? { link_url: linkOf(el), ...(el.hasAttribute('download') ? { download: true } : {}) } : {}),
    page_path: window.location.pathname,
    ...where,
  })
}

/** called once, when the site starts: a visitor who already accepted is measured from the first page */
export function startAnalytics() {
  document.addEventListener('click', onClick, { capture: true })
  startErrorReport()
  if (state.choice === 'granted') load()
  else if (state.choice === 'denied') w[`ga-disable-${GA_ID}`] = true
}
