import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * A story told against one 3D stage. The stage is sticky for the length of the section; the steps
 * are ordinary full-screen blocks of copy that scroll over it, so the page scrolls as any page
 * does (nothing pinned, nothing captured). The step that holds the middle of the screen is the
 * current one: the stage moves to its state in time and its words rise once. Every step's copy is
 * in the document from the start, so the content reads without the 3D.
 */
export type Place = 'tl' | 'bl' | 'tr' | 'br' | 'left' | 'right'

export interface StoryStep {
  id: string
  place: Place
  body: ReactNode
  /** the copy sits on a plate of the ground: for close-ups where the model fills the screen */
  plate?: boolean
}

export function Story({
  id,
  ground,
  label,
  steps,
  stage,
  onStep,
  className = '',
}: {
  id: string
  ground: 'yellow' | 'black' | 'light'
  label: string
  steps: StoryStep[]
  stage: (step: number) => ReactNode
  onStep?: (step: number) => void
  className?: string
}) {
  const [step, setStep] = useState(0)
  const [seen, setSeen] = useState(1)
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const cb = useRef(onStep)
  cb.current = onStep

  useEffect(() => {
    // the step whose block crosses the middle line of the screen
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const i = refs.current.indexOf(e.target as HTMLDivElement)
          if (i < 0) continue
          setStep(i)
          setSeen((m) => m | (1 << i))
          cb.current?.(i)
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    )
    refs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [steps.length])

  return (
    <section id={id} className={`fc-story on-${ground} ${className}`} aria-label={label} style={{ '--n': steps.length } as CSSProperties}>
      <div className="fc-story__stage">{stage(step)}</div>
      <div className="fc-story__steps">
        {steps.map((s, i) => (
          <div
            key={s.id}
            id={`${id}-${s.id}`}
            ref={(el) => void (refs.current[i] = el)}
            className={`fc-step fc-step--${s.place} ${s.plate ? 'fc-step--plate' : ''} ${i === step ? 'is-active' : (seen & (1 << i)) !== 0 ? 'is-seen' : ''}`}
          >
            <div className="fc-step__copy">{s.body}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Splits a heading's lines into words that rise one after another (the homepage's word reveal). */
export function Words({ lines, as: Tag = 'h2', className = '', id }: { lines: string[]; as?: 'h1' | 'h2' | 'h3' | 'p'; className?: string; id?: string }) {
  let w = 0
  return (
    <Tag id={id} className={`fc-words ${className}`}>
      {lines.map((line, li) => {
        const words = line.split(' ')
        const node = words.map((word, i) => (
          <Fragment key={i}>
            <span className="word">
              <span className="word__in" style={{ '--w': w + i } as CSSProperties}>
                {word}
              </span>
            </span>
            {i < words.length - 1 ? ' ' : null}
          </Fragment>
        ))
        w += words.length
        // a space between the lines too, so the heading reads as words when the lines are not drawn apart
        return (
          <Fragment key={li}>
            <span className="fc-words__line">{node}</span>
            {li < lines.length - 1 ? ' ' : null}
          </Fragment>
        )
      })}
    </Tag>
  )
}

/** Adds `is-in` once the element is well into the viewport, for reveals outside a story. */
export function useInView<T extends HTMLElement>(margin = '0px 0px -18% 0px') {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setInView(true), { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [inView, margin])
  return [ref, inView] as const
}
