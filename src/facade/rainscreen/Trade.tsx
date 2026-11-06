import { useRef, type CSSProperties } from 'react'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { useIsCompact } from '../../lib/motion'
import { RiseWords, useRise } from '../unitized/Rise'

/**
 * The trade-offs: a list of five rows on one black screen, a line between each: its number, its name with its
 * figures and what it falls short on under it, and at the end a small photograph of the material, in grey so
 * none of them brings a colour of its own. A yellow line along its foot is drawn to scale for its weight (`kg`,
 * the top of its range). Every row comes in with the scroll, one after another: its line draws across, its number
 * drops out from under the line above, its words wipe in, its photograph opens from its corner and its weight draws.
 * Pointing at a row draws a yellow line along it and moves its name in. RTARIUM's answers follow it.
 *
 * Typical figures, from published sources (REVIEW.materials): precast 125–150 mm at about 350 kg/m²
 * (Construction Canada); solid stone 20–30 mm, 30 mm granite about 75–85 kg/m², panels as small as
 * 600 × 1200 mm (manufacturer data); GRC skins 12–20 mm, thin GRC about 30 kg/m² and more with its
 * frame, AR-glass strength lost with long wet exposure (PCI Journal, 1987); UHPC 15–30 mm at 33–66
 * kg/m² (manufacturer data); aluminium composite about 4 mm and a few kilograms a square metre.
 */
const MATERIALS = [
  { id: 'precast', img: '/img/facade/precast-joint.webp', pos: '50% 45%', alt: 'A joint between precast concrete panels', kg: 350, name: 'Precast concrete', thick: '125–150 mm', weight: '~350 kg/m²', costs: 'Heavy on the frame and the foundations.' },
  { id: 'stone', img: '/img/facade/granite.webp', pos: '50% 50%', alt: 'Polished granite, close up', kg: 85, name: 'Natural stone', thick: '20–30 mm', weight: '75–85 kg/m²', costs: 'Heavy, and only in small sizes.' },
  { id: 'grc', img: '/img/facade/glass-fibre.webp', pos: '50% 50%', alt: 'Chopped glass fibre strands', kg: 45, name: 'GRC', thick: '12–20 mm', weight: '30–45 kg/m²', costs: 'Its glass fibre loses strength with age.' },
  { id: 'uhpc', img: '/img/facade/steel-fibres.webp', pos: '50% 50%', alt: 'Steel fibres in broken concrete', kg: 66, name: 'UHPC', thick: '15–30 mm', weight: '33–66 kg/m²', costs: 'A costly mix, its steel fibres can corrode.' },
  { id: 'acp', img: '/img/facade/acp-panels.webp', pos: '50% 50%', alt: 'A building clad in a grid of aluminium composite panels', kg: 10, name: 'Metal / ACP', thick: '3–4 mm', weight: 'Under 10 kg/m²', costs: 'Dents, fades, and it isn’t concrete.' },
]

/** the heaviest, the length of a full line */
const MOST = Math.max(...MATERIALS.map((m) => m.kg))

export function Trade() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const cols = useRef<HTMLOListElement>(null)
  useRise(section, title, rail, cols, compact)

  return (
    <section ref={section} id="tradeoffs" className="fu-flaws on-black" data-ground="black" aria-labelledby="tradeoffs-title">
      <div className="fu-probs">
        <h2 ref={title} id="tradeoffs-title" className="fu-flaws__title fu-probs__title">
          <RiseWords text="Every material has its trade-offs." />
          <ReviewNote>{REVIEW.materials}</ReviewNote>
        </h2>
        <div ref={rail} className="fu-probs__rail" aria-hidden="true" />
        <ol ref={cols} className="fr-wts" aria-label="The materials compared, by weight">
          {MATERIALS.map((m, i) => (
            <li key={m.id} className="fu-prob__stage fr-wt" style={{ '--w': m.kg / MOST } as CSSProperties}>
              <span className="fr-wt__num num" aria-hidden="true">
                0{i + 1} /
              </span>
              <div className="fr-wt__body">
                <h3 className="fr-wt__name">{m.name}</h3>
                <div className="fr-wt__line">
                  <p className="fr-wt__facts num">
                    {m.thick} thick · {m.weight}
                  </p>
                  <p className="fr-wt__short">{m.costs}</p>
                </div>
              </div>
              <div className="fr-wt__box">
                <img src={m.img} alt={m.alt} loading="lazy" decoding="async" width={160} height={160} style={{ objectPosition: m.pos }} />
                <i aria-hidden="true" />
              </div>
            </li>
          ))}
        </ol>
        {/* the licences ask for these, and for the changes to be said */}
        <p className="fr-wts__credit">Photos: Achim Hering, CC BY 3.0; Eurico Zimbres, CC BY-SA 2.5; Reynobond, CC BY-SA 4.0. Cropped, greyscale.</p>
      </div>
    </section>
  )
}
