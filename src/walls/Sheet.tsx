import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { ReviewNote } from '../components/Media'

/**
 * A sheet that opens over the page (the homepage's figures sheet, as a dialog): its kicker and title,
 * a close button, and what it holds. Closes on Escape, on its button, or on the ground round it; the
 * page under it is still while it is open.
 */
export function Sheet({ dialog, kicker, title, children, review }: { dialog: RefObject<HTMLDialogElement | null>; kicker: string; title: string; children: ReactNode; review?: string }) {
  const id = `wp-sheet-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <dialog ref={dialog} className="wp-sheet" aria-labelledby={id} data-lenis-prevent onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}>
      <div className="wp-sheet__inner">
        <header className="wp-sheet__head">
          <div>
            <p className="wp-sheet__kicker">{kicker}</p>
            <h2 id={id} className="wp-sheet__title">
              {title}
            </h2>
          </div>
          <button type="button" className="wp-sheet__close" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </header>
        {children}
        {review && (
          <p className="wp-sheet__fine">
            <ReviewNote>{review}</ReviewNote>
          </p>
        )}
      </div>
    </dialog>
  )
}

/** a block of the sheet: its label and what it holds */
export function Block({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`wp-sheet__block ${wide ? 'is-wide' : ''}`}>
      <h3 className="wp-sheet__label">{label}</h3>
      {children}
    </section>
  )
}

/** a list of figures: name, value, unit, on hairlines */
export function Figures({ rows }: { rows: readonly (readonly [string, string, string])[] }) {
  return (
    <dl className="wp-figs">
      {rows.map(([name, value, unit]) => (
        <div key={name} className="wp-figs__row">
          <dt>{name}</dt>
          <dd>
            <span className="num">{value}</span> {unit}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** a numbered list (the client's "panel construction") */
export function Steps({ items }: { items: readonly string[] }) {
  return (
    <ol className="wp-steps">
      {items.map((s, i) => (
        <li key={s}>
          <span className="num">0{i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  )
}

/** a dialog, and how to open it */
export function useSheet() {
  const dialog = useRef<HTMLDialogElement>(null)
  // the smooth scroll is held while a sheet is open, and the page is given back where it was
  useEffect(() => {
    const d = dialog.current
    if (!d) return
    const close = () => document.documentElement.classList.remove('sheet-open')
    d.addEventListener('close', close)
    return () => d.removeEventListener('close', close)
  }, [])
  const open = () => {
    document.documentElement.classList.add('sheet-open')
    dialog.current?.showModal()
  }
  return [dialog, open] as const
}
