import type { ReactNode } from 'react'

/**
 * The bar along the foot of a pinned section (EnduroSat's phase bar), shared by slab to slab and
 * RTARIUM's answers: a cell per step. The current one fills as its step runs (`--f`), a passed one
 * closes to a square with its number (`--c`), the ones to come stand open, outlined; each takes you to
 * its step. The section writes `--f` and `--c` to the cells as it scrolls.
 */
export function StepBar({
  label,
  names,
  step,
  onGo,
  cellRef,
  after,
}: {
  label: string
  names: string[]
  step: number
  onGo: (k: number) => void
  cellRef: (k: number, el: HTMLLIElement | null) => void
  after?: ReactNode
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
      {after}
    </nav>
  )
}
