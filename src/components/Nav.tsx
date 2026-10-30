import { useEffect, useRef, useState, type FocusEvent } from 'react'
import { Link, useRoute } from '../lib/router'
import { APPLICATIONS } from '../content/site'
import { SYSTEMS } from '../facade/content'
import { FLOORING_APPS } from '../flooring/content'
import { useStageValue } from '../three/stageStore'
import { holdScroll } from '../lib/scroll'

/**
 * The two logos in full colour on a black capsule. Both carry yellow (the RTARIUM emblem, half of the
 * HEMISPHERE ONE disc), so on the yellow ground they would lose it: the capsule keeps them whole on
 * every ground.
 */
export function BrandMark() {
  return (
    <span className="brand">
      <img className="brand__rt" src="/brand/rtarium-logo.png" alt="RTARIUM" width={900} height={136} />
      <span className="brand__by">
        by <img src="/brand/hemisphere-one-logo.png" alt="HEMISPHERE ONE" width={900} height={171} />
      </span>
    </span>
  )
}

interface NavItem {
  to: string
  label: string
  /** the homepage chapter it names, marked while that chapter is on screen */
  chapter?: string
}
interface NavEntry extends NavItem {
  id: string
  /** what drops from it: Home's chapters, or the section's pages */
  items?: NavItem[]
}

const app = (id: string) => APPLICATIONS.find((a) => a.id === id)!

/** the site map: Home and its chapters, then the three applications in the client's order */
const ENTRIES: NavEntry[] = [
  {
    id: 'home',
    to: '/',
    label: 'Home',
    items: [
      { to: '/#about', label: 'About', chapter: 'about' },
      { to: '/#innovation', label: 'Innovation', chapter: 'innovation' },
      { to: '/#tech', label: 'Tech Space', chapter: 'tech' },
      { to: '/#applications', label: 'Applications', chapter: 'applications' },
    ],
  },
  { id: 'facade', to: app('facade').path, label: app('facade').title, items: SYSTEMS.map((s) => ({ to: s.path, label: s.title })) },
  { id: 'flooring', to: app('flooring').path, label: app('flooring').title, items: FLOORING_APPS.map((a) => ({ to: a.path, label: a.title })) },
  { id: 'walls', to: app('walls').path, label: app('walls').title },
]

/** pages that set the header's ground themselves, screen by screen (the rest sit on warm white) */
const OWN_GROUND = new Set(['/', '/facade-cladding', '/facade-cladding/unitized-thin-concrete-facade', '/facade-cladding/rainscreen-cladding', '/facade-cladding/stud-frame-cladding'])

export function Nav() {
  const { path } = useRoute()
  const home = path === '/'
  const ground = useStageValue('ground')
  const chapter = useStageValue('chapter')
  const [open, setOpen] = useState(false)
  /** the entry whose pages are dropped down: by pointing at it, or by moving focus into it */
  const [drop, setDrop] = useState<string | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>('a')?.focus()
    // while the menu is open it is the whole page: the rest is inert, and Tab runs round the
    // button and the menu's links
    const away = [document.getElementById('main'), document.querySelector('footer')].filter((el): el is HTMLElement => Boolean(el))
    away.forEach((el) => (el.inert = true))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
        return
      }
      if (e.key !== 'Tab') return
      const ring = [button.current, ...(panel.current?.querySelectorAll<HTMLElement>('a') ?? [])].filter((el): el is HTMLElement => Boolean(el))
      const i = ring.indexOf(document.activeElement as HTMLElement)
      const next = e.shiftKey ? (i <= 0 ? ring.length - 1 : i - 1) : i < 0 || i === ring.length - 1 ? 0 : i + 1
      e.preventDefault()
      ring[next]?.focus()
    }
    document.documentElement.classList.add('menu-open')
    holdScroll(true)
    window.addEventListener('keydown', onKey)
    return () => {
      away.forEach((el) => (el.inert = false))
      holdScroll(false)
      document.documentElement.classList.remove('menu-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  useEffect(() => {
    setOpen(false)
    setDrop(null)
  }, [path])

  const theme = open ? 'black' : OWN_GROUND.has(path) ? ground : 'light'
  const inSection = (to: string) => (to === '/' ? home : path === to || path.startsWith(`${to}/`))

  return (
    <header className={`nav on-${theme}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="nav__bar">
        <Link to="/" className="nav__home" aria-label="RTARIUM by HEMISPHERE ONE, home">
          <BrandMark />
        </Link>
        <nav className="nav__main" aria-label="Main">
          <ul>
            {ENTRIES.map((e) => {
              if (!e.items) {
                return (
                  <li key={e.id}>
                    <Link to={e.to} className="nav__link" aria-current={inSection(e.to) ? 'page' : undefined}>
                      {e.label}
                    </Link>
                  </li>
                )
              }
              const shown = drop === e.id
              return (
                <li
                  key={e.id}
                  className={`nav__group ${shown ? 'is-open' : ''}`}
                  onPointerEnter={(ev) => ev.pointerType === 'mouse' && setDrop(e.id)}
                  onPointerLeave={(ev) => ev.pointerType === 'mouse' && setDrop((d) => (d === e.id ? null : d))}
                  onFocus={() => setDrop(e.id)}
                  onBlur={(ev: FocusEvent<HTMLLIElement>) => {
                    if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setDrop((d) => (d === e.id ? null : d))
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key !== 'Escape' || !shown) return
                    setDrop(null)
                    ev.currentTarget.querySelector<HTMLElement>('.nav__link')?.focus()
                  }}
                >
                  <Link
                    to={e.to}
                    className="nav__link"
                    aria-current={inSection(e.to) ? 'page' : undefined}
                    aria-expanded={shown}
                    aria-controls={`nav-${e.id}-pages`}
                  >
                    {e.label}
                  </Link>
                  <ul id={`nav-${e.id}-pages`} className="nav__sub">
                    {e.items.map((l) => (
                      <li key={l.to}>
                        <Link
                          to={l.to}
                          className="nav__sublink"
                          tabIndex={shown ? undefined : -1}
                          aria-current={(l.chapter ? home && chapter === l.chapter : path === l.to) ? 'page' : undefined}
                          onClick={() => setDrop(null)}
                        >
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
          <Link to="/contact" className="pill pill--solid nav__contact">
            Contact
          </Link>
        </nav>
        <button ref={button} type="button" className="nav__menu" aria-expanded={open} aria-controls="menu-panel" onClick={() => setOpen((v) => !v)}>
          <span className="nav__menu-icon" aria-hidden="true">
            <i />
            <i />
          </span>
          {open ? 'Close' : 'Menu'}
        </button>
      </div>

      <div id="menu-panel" ref={panel} className="menu" hidden={!open}>
        <ul className="menu__list">
          {ENTRIES.map((e) => (
            <li key={e.id}>
              <Link to={e.to} onClick={() => setOpen(false)}>
                {e.label}
              </Link>
              {e.items && (
                <ul className="menu__chapters">
                  {e.items.map((l) => (
                    <li key={l.to}>
                      <Link to={l.to} onClick={() => setOpen(false)}>
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <ul className="menu__list menu__list--small">
          <li>
            <Link to="/contact" onClick={() => setOpen(false)}>
              Contact
            </Link>
          </li>
        </ul>
      </div>
    </header>
  )
}
