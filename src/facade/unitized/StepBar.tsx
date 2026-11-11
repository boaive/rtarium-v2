import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { scrollToY } from '../../lib/scroll'
import { useIsCompact } from '../../lib/motion'

/**
 * The bar along the foot of a pinned section (EnduroSat's phase bar), shared by every step-through: a
 * cell per step. The current one fills as its step runs (`--f`), a passed one closes to a square with
 * its number (`--c`), the ones to come stand open, outlined; each takes you to its step, so a passed step
 * can be seen again without scrolling back through the rest. Skip goes straight past the section. The
 * section writes `--f` and `--c` to the cells as it scrolls.
 */

/**
 * A word to the visitor, wherever a part of the page is worked by the scroll or by its buttons: what to do there, and
 * its mark (`scroll`: a mouse, its wheel turning; `pick`: an arrow pointing down at the steps to pick from).
 */
export type Hint = { text: string; icon: 'scroll' | 'pick' }

/** over a bar once its section has played to its end: its steps can be seen again, one by one */
export const REPLAY_HINT: Hint = { text: 'Pick a step to see it again', icon: 'pick' }
/** over the bar of a section that plays with the scroll, at its start, before anything has played */
export const RUN_HINT: Hint = { text: 'Scroll to play it step by step', icon: 'scroll' }

/** the word, on a plain tag in the ink of what it stands on */
export function HintTag({ hint, className = '' }: { hint: Hint; className?: string }) {
  return (
    <p className={`hint ${className}`} role="status">
      {hint.icon === 'scroll' && (
        <svg className="hint__mouse" viewBox="0 0 14 20" width="12" height="17" aria-hidden="true">
          <rect x="1" y="1" width="12" height="18" rx="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <rect className="hint__wheel" x="6" y="4.5" width="2" height="4" rx="1" fill="currentColor" />
        </svg>
      )}
      {hint.text}
      {hint.icon === 'pick' && (
        <svg className="hint__point" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M8 2.5v10M3.5 8.5 8 13l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      )}
    </p>
  )
}

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
  hint,
  hints,
  pick = false,
}: {
  label: string
  names: string[]
  step: number
  onGo: (k: number) => void
  cellRef?: (k: number, el: HTMLLIElement | null) => void
  /** whether the bar offers the way past its section (a section with no run to skip goes without) */
  skip?: boolean
  /** where Skip goes, for a bar that stands outside its section (Home's, fixed to the screen) */
  onSkip?: () => void
  /** a word over the bar (once a section that plays by itself has played to its end: its steps can be picked to be
   * seen again); while it asks for a step to be picked, the steps lift one after another now and then */
  hint?: Hint | null
  /** `run`, for a section that plays with the scroll: the word over its bar read off its cells, to scroll at its
   * start, before anything has played, and to pick a step once its last has played out */
  hints?: 'run'
  /** a bar of things to pick from, not steps: every cell open, the one picked (`step`) filled, picked again to let go */
  pick?: boolean
}) {
  const list = useRef<HTMLOListElement>(null)
  const [read, setRead] = useState<Hint | null>(null)
  useEffect(() => {
    const ol = list.current
    if (hints !== 'run' || !ol) return
    const fill = (el: Element | undefined) => Number((el as HTMLElement | undefined)?.style.getPropertyValue('--f') || 0)
    const look = () => {
      const cells = ol.children
      if (!cells.length) return
      setRead(fill(cells[cells.length - 1]) >= 0.999 ? REPLAY_HINT : fill(cells[0]) <= 0.001 ? RUN_HINT : null)
    }
    look()
    // the section writes the fills as it plays: the word follows them
    const watch = new MutationObserver(look)
    watch.observe(ol, { subtree: true, attributes: true, attributeFilter: ['style'] })
    return () => watch.disconnect()
  }, [hints])
  const shown = hint ?? (hints === 'run' ? read : null)

  /*
   * On a phone the bar is hidden (a hairline down the right edge stands for it: ScrollLine), and its section is
   * stepped through by a sideways swipe across it as well as by the scroll: left for the next step, right for the one
   * before, each pressed as the bar's own cell would be. An upright swipe scrolls the page as ever.
   */
  const compact = useIsCompact()
  const latest = useRef({ step, n: names.length })
  latest.current = { step, n: names.length }
  useEffect(() => {
    const section = list.current?.closest('section')
    if (!compact || !section) return
    const g = { id: -1, x: 0, y: 0 }
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || (e.target as HTMLElement | null)?.closest?.('a, button')) return
      g.id = e.pointerId
      g.x = e.clientX
      g.y = e.clientY
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== g.id) return
      g.id = -1
      const dx = e.clientX - g.x
      const dy = e.clientY - g.y
      if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy) * 1.3) return
      const { step: k, n } = latest.current
      const to = Math.min(n - 1, Math.max(0, k + (dx < 0 ? 1 : -1)))
      // pressed as its cell would be, so it goes the way a click on the bar goes (a page's stepper takes it there,
      // back or on: usePageSteps)
      if (to !== k) list.current?.children[to]?.querySelector<HTMLButtonElement>('.fu-bar__btn')?.click()
    }
    const cancel = (e: PointerEvent) => {
      if (e.pointerId === g.id) g.id = -1
    }
    section.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      section.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [compact])

  return (
    <nav className={`fu-bar ${shown?.icon === 'pick' ? 'has-hint' : ''} ${pick ? 'fu-bar--pick' : ''}`} aria-label={label}>
      {shown && <HintTag key={shown.text} hint={shown} className="fu-bar__hint" />}
      <ol ref={list} className="fu-bar__list">
        {names.map((name, k) => (
          <li
            key={name}
            ref={(el) => cellRef?.(k, el)}
            className="fu-bar__cell"
            style={{ '--k': k, ...(pick ? { '--f': k === step ? 1 : 0 } : {}) } as CSSProperties}
            data-state={pick ? (k === step ? 'now' : 'next') : k < step ? 'past' : k === step ? 'now' : 'next'}
          >
            <button
              type="button"
              className="fu-bar__btn"
              aria-current={!pick && k === step ? 'step' : undefined}
              aria-pressed={pick ? k === step : undefined}
              title={name}
              onClick={() => onGo(k)}
            >
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
