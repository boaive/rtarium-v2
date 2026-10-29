import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { prefersReducedMotion } from '../../lib/motion'
import { smooth } from '../progress'

/**
 * Made face down, the stud frame's way: the Unitized page's photo strip (`fu-made`), four steps. As the
 * section comes up the frames open from their corners one after another, their size read out at the
 * corner, and a line runs through the step numbers; all of it follows the scroll. Pointing at a card
 * lifts the whole card a little, leaning from the point under the cursor (a tap does the same on touch).
 *
 * The photographs are placeholders from the production shoot until the stud frame shoot is in.
 */

const MADE = [
  { img: '/img/facade/panel-back.webp', pos: '50% 42%', name: 'The frame', text: 'Galvanized tubes, drilled at the ferrules’ intervals.', alt: 'Steel members bolted to the back of a thin concrete panel' },
  { img: '/img/facade/mould-timber.webp', pos: '50% 86%', name: 'The mould', text: 'CNC-routed timber, the cornice’s face as its cavity.', alt: 'An empty timber mould for a thin panel on the factory floor' },
  { img: '/img/facade/mesh-on-face-coat.webp', pos: '50% 50%', name: 'RTARIUM', text: 'Cut to each face, stitched at the folds, laid in.', alt: 'RTARIUM laid on the face coat in the mould, a ferrule insert standing up from it' },
  { img: '/img/facade/ferrule-in-mesh.webp', pos: '50% 50%', name: 'Frame onto skin', text: 'Set on the ferrule inserts and locked.', alt: 'A ferrule insert set into the RTARIUM mesh, a bolt above it' },
]

export function Made() {
  const section = useRef<HTMLElement>(null)
  const frames = useRef<(HTMLElement | null)[]>([])
  const reads = useRef<(HTMLSpanElement | null)[][]>([])
  const rail = useRef<HTMLDivElement>(null)
  const [pop, setPop] = useState<number | null>(null)

  useEffect(() => {
    const reduced = prefersReducedMotion()
    const sizes = new Map<HTMLElement, [number, number]>()
    let raf = 0
    const read = () => {
      raf = 0
      const el = section.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      // 0 as the section's top reaches the foot of the screen, 1 once it is well up
      const q = reduced ? 1 : Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.95)))
      rail.current?.style.setProperty('--run', smooth(0.25, 0.95, q).toFixed(4))
      frames.current.forEach((f, i) => {
        if (!f) return
        const g = Math.max(0.03, smooth(0.2 + i * 0.12, 0.55 + i * 0.12, q))
        f.style.setProperty('--g', g.toFixed(4))
        let s = sizes.get(f)
        if (!s) sizes.set(f, (s = [f.offsetWidth, f.offsetHeight]))
        const [rx, ry] = reads.current[i] ?? []
        if (rx) rx.textContent = `X: ${Math.round(g * s[0])}`
        if (ry) ry.textContent = `Y: ${Math.round(g * s[1])}`
      })
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    const resize = () => {
      sizes.clear()
      on()
    }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', resize)
    }
  }, [])

  /** the point under the cursor, as the origin the photograph grows from */
  const aim = (e: ReactMouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--ox', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`)
    e.currentTarget.style.setProperty('--oy', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`)
  }

  return (
    <section ref={section} className="fu-made on-light" aria-labelledby="fs-made-title">
      <header className="fu-made__head">
        <h2 id="fs-made-title" className="fu-made__title">
          Made in the factory.
        </h2>
        <p className="fu-made__lede">The frame first; the skin sprayed face down, RTARIUM stitched in; the two joined.</p>
      </header>
      <div ref={rail} className="fu-made__rail" aria-hidden="true" />
      <ol className="fu-made__steps" data-pop={pop ?? undefined}>
        {MADE.map((m, i) => (
          <li
            key={m.name}
            className={`fu-made__step ${pop === i ? 'is-pop' : ''}`}
            style={{ '--i': i } as CSSProperties}
            onPointerEnter={(e) => {
              aim(e)
              if (e.pointerType === 'mouse') setPop(i)
            }}
            onPointerMove={aim}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setPop((p) => (p === i ? null : p))}
            onClick={(e) => {
              aim(e)
              setPop((p) => (p === i ? null : i))
            }}
          >
            <span className="fu-made__num num">{i + 1}</span>
            <figure ref={(el) => void (frames.current[i] = el)} className="fu-made__photo">
              <span className="fu-made__frame">
                <img src={m.img} alt={m.alt} loading="lazy" decoding="async" width={720} height={1280} style={{ objectPosition: m.pos }} />
              </span>
              <i className="fu-made__dot" aria-hidden="true">
                <span ref={(el) => void ((reads.current[i] ??= [])[0] = el)} className="fu-made__x num" />
                <span ref={(el) => void ((reads.current[i] ??= [])[1] = el)} className="fu-made__y num" />
              </i>
            </figure>
            <h3 className="fu-made__name">{m.name}</h3>
            <p className="fu-made__text">{m.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
