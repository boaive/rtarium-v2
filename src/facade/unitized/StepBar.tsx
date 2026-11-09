import type { MouseEvent } from 'react'
import { scrollToY } from '../../lib/scroll'

/**
 * The bar along the foot of a pinned section (EnduroSat's phase bar), shared by every step-through: a
 * cell per step. The current one fills as its step runs (`--f`), a passed one closes to a square with
 * its number (`--c`), the ones to come stand open, outlined; each takes you to its step, so a passed step
 * can be seen again without scrolling back through the rest. Skip goes straight past the section. The
 * section writes `--f` and `--c` to the cells as it scrolls.
 */

/** the way past the section it stands in: to its foot, the next section at the top of the screen */
export function Skip({ label, className = '', onSkip }: { label: string; className?: string; onSkip?: () => void }) {
  const past = (e: MouseEvent<HTMLButtonElement>) => {
    if (onSkip) return onSkip()
    const section = e.currentTarget.closest('section')
    if (section) scrollToY(section.getBoundingClientRect().bottom + window.scrollY)
  }
  return (
    <button type="button" className={`fu-bar__skip ${className}`} onClick={past} aria-label={`Skip: go past ${label.toLowerCase()}`}>
      Skip
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M8 2.5v10M3.5 8.5 8 13l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    </button>
  )
}

export function StepBar({
  label,
  names,
  step,
  onGo,
  cellRef,
  skip = true,
  onSkip,
}: {
  label: string
  names: string[]
  step: number
  onGo: (k: number) => void
  cellRef: (k: number, el: HTMLLIElement | null) => void
  /** whether the bar offers the way past its section (a section with no run to skip goes without) */
  skip?: boolean
  /** where Skip goes, for a bar that stands outside its section (Home's, fixed to the screen) */
  onSkip?: () => void
}) {
  return (
    <nav className="fu-bar" aria-label={label}>
      <ol className="fu-bar__list">
        {names.map((name, k) => (
          <li key={name} ref={(el) => cellRef(k, el)} className="fu-bar__cell" data-state={k < step ? 'past' : k === step ? 'now' : 'next'}>
            <button type="button" className="fu-bar__btn" aria-current={k === step ? 'step' : undefined} title={name} onClick={() => onGo(k)}>
              {[false, true].map((fill) => (
                <span key={String(fill)} className={`fu-bar__face ${fill ? 'fu-bar__face--fill' : ''}`} aria-hidden={fill || undefined}>
                  <span className="num">0{k + 1}</span>
                  <span className="fu-bar__name">{name}</span>
                </span>
              ))}
            </button>
          </li>
        ))}
      </ol>
      {skip && <Skip label={label} onSkip={onSkip} />}
    </nav>
  )
}
