import { useCallback, useEffect, useRef, useState, type MutableRefObject, type Ref } from 'react'
import { Statement } from './Chapter'
import { FallingText } from './FallingText'
import { useInView } from '../facade/Story'
import { prefersReducedMotion } from '../lib/motion'

/**
 * A page's one sentence, alone on a black screen: the homepage's challenge, the same on every page that
 * has a statement, so the sections of the site read as one. The words run left to right and arrive one
 * by one once the screen is reached; `kicker` is what the sentence is about, set small above it. With `then`,
 * the answer to it, the screen takes two scrolls: the first brings the sentence, whole; the second drops the answer
 * from the top of the screen, in yellow, onto the sentence, shattering it, whose words rain down and can be played with. Scrolling back
 * puts it together again.
 */

/** the share of a screen scrolled into the hold at which the answer comes, and the lower one at which it goes again */
const STRIKE = 0.22
const LIFT = 0.12
/** ms for the answer to fall onto the sentence: the moment it lands, the sentence breaks */
const IMPACT = 330

function Answered({ text, then, label }: { text: string; then: string; label: string }) {
  const held = useRef<HTMLElement>(null)
  const [struck, setStruck] = useState(false)
  const [fallen, setFallen] = useState(false)

  useEffect(() => {
    if (!struck) {
      setFallen(false)
      return
    }
    const timer = setTimeout(() => setFallen(true), IMPACT)
    return () => clearTimeout(timer)
  }, [struck])

  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      const el = held.current
      if (!el) return
      const past = -el.getBoundingClientRect().top / window.innerHeight
      setStruck((was) => (was ? past > LIFT : past > STRIKE))
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
  }, [])

  return (
    <section ref={held} className="say say--answer on-black" aria-label={label}>
      <div className={`say__hold ${struck ? 'is-found' : ''}`}>
        <FallingText text={text} fallen={fallen} />
        <p className="say__found">{then}</p>
      </div>
    </section>
  )
}

export function Say({ text, then, kicker, label, sectionRef }: { text: string; then?: string; kicker?: string; label: string; sectionRef?: Ref<HTMLElement> }) {
  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -30% 0px')
  const held = useRef<HTMLElement | null>(null)
  const setSection = useCallback(
    (el: HTMLElement | null) => {
      held.current = el
      if (typeof sectionRef === 'function') sectionRef(el)
      else if (sectionRef) (sectionRef as MutableRefObject<HTMLElement | null>).current = el
    },
    [sectionRef],
  )
  // while its words are arriving the page does not step on past it, or back: a scroll then waits for the sentence (the
  // steps' hold, `data-busy`); as long as the words take, by the screen's own timing (story.css: 0.2 s, 95 ms a word, 0.62 s each)
  useEffect(() => {
    const el = held.current
    if (!el || !inView || then || prefersReducedMotion()) return
    el.setAttribute('data-busy', '')
    const id = window.setTimeout(() => el.removeAttribute('data-busy'), 200 + (text.split(' ').length - 1) * 95 + 620)
    return () => {
      window.clearTimeout(id)
      el.removeAttribute('data-busy')
    }
  }, [inView, text, then])
  if (then) return <Answered text={text} then={then} label={label} />
  return (
    <section ref={setSection} className="say on-black" aria-label={label}>
      <div ref={ref} className={`say__in ${inView ? 'is-in' : ''}`}>
        {kicker && <p className="say__kicker">{kicker}</p>}
        <Statement text={text} />
      </div>
    </section>
  )
}
