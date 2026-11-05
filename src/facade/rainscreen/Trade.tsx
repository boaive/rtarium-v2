import { Compare } from '../Compare'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'

/**
 * The trade-offs: what the market offers and what each one falls short on, in one table on one black
 * screen, taken in at a glance. RTARIUM's answers follow it.
 *
 * Typical figures, from published sources (REVIEW.materials): precast 125–150 mm at about 350 kg/m²
 * (Construction Canada); solid stone 20–30 mm, 30 mm granite about 75–85 kg/m², panels as small as
 * 600 × 1200 mm (manufacturer data); GRC skins 12–20 mm, thin GRC about 30 kg/m² and more with its
 * frame, AR-glass strength lost with long wet exposure (PCI Journal, 1987); UHPC 15–30 mm at 33–66
 * kg/m² (manufacturer data); aluminium composite about 4 mm and a few kilograms a square metre.
 */
const MATERIALS = [
  { id: 'precast', name: 'Precast concrete', thick: '125–150 mm', weight: '~350 kg/m²', costs: 'Heavy on the frame and the foundations.' },
  { id: 'stone', name: 'Natural stone', thick: '20–30 mm', weight: '75–85 kg/m²', costs: 'Heavy, and only in small sizes.' },
  { id: 'grc', name: 'GRC', thick: '12–20 mm', weight: '30–45 kg/m²', costs: 'Its glass fibre loses strength with age.' },
  { id: 'uhpc', name: 'UHPC', thick: '15–30 mm', weight: '33–66 kg/m²', costs: 'A costly mix, its steel fibres can corrode.' },
  { id: 'acp', name: 'Metal / ACP', thick: '3–4 mm', weight: 'Under 10 kg/m²', costs: 'Dents, fades, and it isn’t concrete.' },
]

export function Trade() {
  return (
    <Compare
      id="tradeoffs"
      title={
        <>
          Every material has its trade-offs.
          <ReviewNote>{REVIEW.materials}</ReviewNote>
        </>
      }
      columns={[{ label: 'Thickness' }, { label: 'Weight' }, { label: 'Its shortcoming' }]}
      rows={MATERIALS.map((m) => ({
        id: m.id,
        name: m.name,
        cells: [<span className="num">{m.thick}</span>, <span className="num">{m.weight}</span>, <b className="cmp__short">{m.costs}</b>],
      }))}
    />
  )
}
