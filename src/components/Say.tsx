import type { Ref } from 'react'
import { Statement } from './Chapter'
import { useInView } from '../facade/Story'

/**
 * A page's one sentence, alone on a black screen: the homepage's challenge, the same on every page that
 * has a statement, so the sections of the site read as one. The words run left to right and arrive one
 * by one once the screen is reached; `kicker` is what the sentence is about, set small above it.
 */
export function Say({ text, kicker, label, sectionRef }: { text: string; kicker?: string; label: string; sectionRef?: Ref<HTMLElement> }) {
  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -30% 0px')
  return (
    <section ref={sectionRef} className="say on-black" aria-label={label}>
      <div ref={ref} className={`say__in ${inView ? 'is-in' : ''}`}>
        {kicker && <p className="say__kicker">{kicker}</p>}
        <Statement text={text} />
      </div>
    </section>
  )
}
