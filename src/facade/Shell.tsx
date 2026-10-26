import { useEffect, type ReactNode } from 'react'
import { Link } from '../lib/router'
import { FACADE, SYSTEMS, type SystemId } from './content'

/** the arrow cell of the homepage's Explore slab */
export function Arrow() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

/** the page's title and description for the browser and search */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = `${title} · RTARIUM by HEMISPHERE ONE`
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const before = meta?.content
    if (meta) meta.content = description
    return () => {
      if (meta && before !== undefined) meta.content = before
    }
  }, [title, description])
}

/**
 * The close of a system page: the other two systems, the next one first, and the way back to the
 * overview. The current system is named, not linked.
 */
export function SystemsNav({ current }: { current?: SystemId }) {
  const i = SYSTEMS.findIndex((s) => s.id === current)
  const order = current ? [1, 2].map((k) => SYSTEMS[(i + k) % SYSTEMS.length]) : SYSTEMS
  return (
    <nav className="fc-next on-black" aria-labelledby="fc-next-title">
      <div className="fc-next__head">
        <h2 id="fc-next-title" className="fc-next__title">
          {current ? 'Two more ways onto a building.' : 'Choose a system.'}
        </h2>
        {current && (
          <Link to={FACADE.path} className="fc-next__overview">
            Façade & Cladding overview
          </Link>
        )}
      </div>
      <ul className="fc-next__list">
        {order.map((s) => (
          <li key={s.id}>
            <Link to={s.path} className="fc-next__link">
              <span className="fc-next__name">{s.title}</span>
              <span className="fc-next__line">{s.line}</span>
              <span className="fc-next__cell" aria-hidden="true">
                <Arrow />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function FacadePage({ children }: { children: ReactNode }) {
  return <div className="fc-page">{children}</div>
}
