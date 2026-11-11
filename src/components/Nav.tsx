import { useEffect, useRef, useState, type CSSProperties, type FocusEvent } from 'react'
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
      {/* on a phone, reading down, the capsule draws in to the emblem alone: the clip closes over the name */}
      <span className="brand__clip">
        <img className="brand__rt" src="/brand/rtarium-logo.png" alt="RTARIUM" width={900} height={136} />
      </span>
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
const OWN_GROUND = new Set(['/', '/advanced-flooring', '/advanced-flooring/data-ai-centres', '/advanced-flooring/automated-warehouse', '/advanced-flooring/semiconductor-plant', '/facade-cladding', '/facade-cladding/unitized-thin-concrete-facade', '/facade-cladding/rainscreen-cladding', '/facade-cladding/stud-frame-cladding', '/wall-panels', '/contact'])

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
  const header = useRef<HTMLElement>(null)
  /** in the menu, the section whose pages are folded out under it */
  const [acc, setAcc] = useState<string | null>(null)
  /** reading down, the header draws in to its smallest; reading back up (or at the top) it opens out again */
  const [tucked, setTucked] = useState(false)

  useEffect(() => {
    let raf = 0
    let lastY = window.scrollY
    const read = () => {
      raf = 0
      const y = window.scrollY
      const max = document.documentElement.scrollHeight - window.innerHeight
      header.current?.style.setProperty('--read', max > 0 ? Math.min(1, Math.max(0, y / max)).toFixed(4) : '0')
      const d = y - lastY
      if (y < 60) {
        setTucked(false)
        lastY = y
      } else if (Math.abs(d) > 12) {
        setTucked(d > 0)
        lastY = y
      }
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [path])

  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>('a')?.focus({ preventScroll: true })
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
      const ring = [button.current, ...(panel.current?.querySelectorAll<HTMLElement>('a:not([tabindex="-1"]), button') ?? [])].filter((el): el is HTMLElement => Boolean(el))
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
  const toggle = () => {
    // opening, the section the reader is in has its pages folded out
    if (!open) setAcc(ENTRIES.find((e) => e.items && inSection(e.to))?.id ?? null)
    setOpen((v) => !v)
  }
  const close = () => setOpen(false)

  return (
    <header ref={header} className={`nav on-${theme} ${open ? 'is-open' : ''} ${tucked && !open ? 'is-tucked' : ''}`}>
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
        <button ref={button} type="button" className="nav__menu" aria-expanded={open} aria-controls="menu-panel" aria-label={open ? 'Close menu' : 'Open menu'} onClick={toggle}>
          {/* the label rolls over to the next word, as a split-flap would */}
          <span className="nav__menu-text" aria-hidden="true">
            <span className="nav__menu-roll">
              <span>Menu</span>
              <span>Close</span>
            </span>
          </span>
          <span className="nav__menu-cell" aria-hidden="true">
            {/* how far down the page the reader is, run round the cell once the header has drawn in */}
            <svg className="nav__ring" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="21" pathLength={1} />
            </svg>
            <span className="nav__menu-icon">
              <i />
              <i />
            </span>
          </span>
        </button>
      </div>

      {/* the page behind the open sheet, dimmed: a tap on it closes the menu */}
      <div className="menu-scrim" aria-hidden="true" onClick={close} />

      {/*
        The menu, as Enerblock's: a warm-white sheet inset from the screen's edges over the dimmed page. The sections in
        plain rows parted by rules, each rising out of its own mask after the one before; a thin plus folds a section's
        pages out under it; Contact the last row.
      */}
      <div id="menu-panel" ref={panel} className={`menu ${open ? 'is-open' : ''}`} inert={!open} aria-hidden={!open}>
        <div className="menu__inner" data-lenis-prevent>
          <ol className="menu__list">
            {ENTRIES.map((e, i) => {
              const here = inSection(e.to)
              const shown = acc === e.id
              return (
                <li key={e.id} className={`menu__item ${here ? 'is-here' : ''} ${shown ? 'is-shown' : ''}`} style={{ '--i': i } as CSSProperties}>
                  <div className="menu__row">
                    <Link to={e.to} className="menu__link" onClick={close} aria-current={here ? 'page' : undefined}>
                      <span className="menu__mask">
                        <span className="menu__label">{e.label}</span>
                      </span>
                    </Link>
                    {e.items && (
                      <button
                        type="button"
                        className="menu__toggle"
                        aria-expanded={shown}
                        aria-controls={`menu-${e.id}`}
                        aria-label={`${shown ? 'Hide' : 'Show'} the pages of ${e.label}`}
                        onClick={() => setAcc((a) => (a === e.id ? null : e.id))}
                      >
                        <i />
                        <i />
                      </button>
                    )}
                  </div>
                  {e.items && (
                    <div id={`menu-${e.id}`} className="menu__drawer">
                      <ul className="menu__sub">
                        {e.items.map((l, j) => (
                          <li key={l.to} style={{ '--j': j } as CSSProperties}>
                            <Link to={l.to} onClick={close} tabIndex={shown ? undefined : -1} aria-current={!l.chapter && path === l.to ? 'page' : undefined}>
                              <span>{l.label}</span>
                              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                                <path d="M3 10h13M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                              </svg>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              )
            })}
            <li className={`menu__item ${path === '/contact' ? 'is-here' : ''}`} style={{ '--i': ENTRIES.length } as CSSProperties}>
              <div className="menu__row">
                <Link to="/contact" className="menu__link" onClick={close} aria-current={path === '/contact' ? 'page' : undefined}>
                  <span className="menu__mask">
                    <span className="menu__label">Contact</span>
                  </span>
                </Link>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </header>
  )
}
