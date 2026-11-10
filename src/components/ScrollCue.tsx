import type { MouseEvent } from 'react'
import { scrollToY } from '../lib/scroll'

/**
 * "Scroll to explore", the homepage's cue (a hairline with a bead running down it), for the opening of a page: a
 * click takes the page on to the section after it.
 */
export function ScrollCue({ className = '' }: { className?: string }) {
  const on = (e: MouseEvent<HTMLButtonElement>) => {
    const section = e.currentTarget.closest('section')
    if (section) scrollToY(section.getBoundingClientRect().bottom + window.scrollY)
  }
  return (
    <button type="button" className={`cue ${className}`} onClick={on} aria-label="Scroll to explore: go on to the next section">
      <span className="cue__track" aria-hidden="true">
        <i />
      </span>
      <span className="cue__text">Scroll to explore</span>
    </button>
  )
}
