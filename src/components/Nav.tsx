import { useEffect, useRef, useState } from 'react'
import { Link, useRoute } from '../lib/router'
import { APPLICATIONS } from '../content/site'
import { useStageValue } from '../three/stageStore'

export function BrandMark({ ink }: { ink: boolean }) {
  return (
    <span className="brand">
      <img className="brand__rt" src={ink ? '/brand/rtarium-logo-ink.png' : '/brand/rtarium-logo.png'} alt="RTARIUM" width={2170} height={725} />
      <span className="brand__by">
        by <img src={ink ? '/brand/hemisphere-one-logo-ink.png' : '/brand/hemisphere-one-logo.png'} alt="HEMISPHERE ONE" width={2185} height={720} />
      </span>
    </span>
  )
}

/** the homepage's chapters: Technology (About, Innovation, Tech Space), then the applications */
const LINKS = [
  { to: '/#about', label: 'About', chapter: 'about' },
  { to: '/#innovation', label: 'Innovation', chapter: 'innovation' },
  { to: '/#tech', label: 'Tech Space', chapter: 'tech' },
  { to: '/#applications', label: 'Applications', chapter: 'applications' },
]

export function Nav() {
  const { path } = useRoute()
  const home = path === '/'
  const ground = useStageValue('ground')
  const chapter = useStageValue('chapter')
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>('a')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.documentElement.classList.add('menu-open')
    window.addEventListener('keydown', onKey)
    return () => {
      document.documentElement.classList.remove('menu-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  useEffect(() => setOpen(false), [path])

  // inner pages sit on warm white; the homepage follows the ground of the step on screen
  const theme = open ? 'black' : home ? ground : 'light'
  const ink = theme !== 'black'

  return (
    <header className={`nav on-${theme}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="nav__bar">
        <Link to="/" className="nav__home" aria-label="RTARIUM by HEMISPHERE ONE, home">
          <BrandMark ink={ink} />
        </Link>
        <nav className="nav__main" aria-label="Main">
          <ul>
            {LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="nav__link" aria-current={home && chapter === l.chapter ? 'true' : undefined}>
                  {l.label}
                </Link>
              </li>
            ))}
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
          {LINKS.map((l) => (
            <li key={l.to}>
              <Link to={l.to} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="menu__list menu__list--small">
          {APPLICATIONS.map((a) => (
            <li key={a.id}>
              <Link to={a.path} onClick={() => setOpen(false)}>
                {a.title}
              </Link>
            </li>
          ))}
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
