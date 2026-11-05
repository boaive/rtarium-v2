import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Lineage, type LineageWords, type Version } from '../facade/Lineage'
import { Stage3D, MovingKeyLight } from '../facade/three/Stage3D'
import { CellRig, type CellShot } from '../facade/three/CellRig'
import { FACT_SIZE, FactScene, type Fact } from './three/FactScenes'

/**
 * What RTARIUM wall panels do best, told as the Façade & Cladding overview tells its story: three full screens of
 * four boxes each (its name, what it gives, and two things it does, each shown in its own small 3D, standing still at
 * the moment that says it), opening diagonally, held while read, closing into the far corner; each passed block
 * leaves a plain, numbered row under the header, which takes you back to it. The boxes' open and close is the one
 * movement here: the page is never held, and nothing plays or changes on top of it. Black and warm white take turns;
 * the yellow stays.
 *
 *   01 concrete muscle   the real panel under load (one of RTARIUM's own photographs, in the photograph's frame that
 *                        opens out of its corner), and strong (hung by its ferrules, 125 kg a point)
 *   02 mineral mesh      non-magnetic (a magnet takes the steel nut, not the panel); and fire-rated for 4 hours, which
 *                        is the SIP insulated panel's rating, not the mesh's (owner): its face takes the heat, the clock
 *                        at 4 hours (no flames: owner)
 *   03 factory precision millimetric (a caliper on its edge, 30.0 mm) and lower carbon (a square metre of it gives up
 *                        what it is made of: a small cube of concrete and a sheet of basalt, no steel)
 *
 * (Zoning and interlocking are left to the envelope's slides below, so nothing is said twice.)
 */

interface Block extends Version {
  /** the two things it does: the first on the left, the second on the right (a 3D scene, or its photograph, `photo`) */
  facts: [Fact | 'photo', Fact | 'photo']
  names: [string, string]
}

const BLOCKS: Block[] = [
  {
    id: 'muscle',
    name: 'Concrete muscle',
    full: 'The strength of solid concrete, at the weight of cladding',
    label: 'Strong, and light',
    // (each figure kept on one line)
    replaced: '125 kg per point. 70 kg/m².',
    tag: 'Strong · light',
    material: '',
    thick: 30,
    facts: ['photo', 'strength'],
    names: ['', 'Strength'],
    photo: {
      src: '/img/walls/panel-hang.webp',
      alt: 'An eye bolt in a ferrule insert of an RTARIUM wall panel, a chain and hook hung from it, black test weights behind',
      ratio: 3 / 4,
      pos: '50% 74%',
    },
  },
  {
    id: 'mesh',
    name: 'Mineral mesh',
    full: 'An independent, three-dimensional basalt mesh for reinforcement',
    // (the mesh is non-magnetic; the fire rating is the insulated panel's: owner, 2 Nov 2026)
    label: 'Basalt mesh, insulated panel',
    replaced: 'Non-magnetic. Thermal resistant.',
    tag: 'Non-magnetic · Thermal resistant',
    material: '',
    thick: 15,
    facts: ['magnet', 'fire'],
    names: ['Non-magnetic', 'Fire-rated: 4 hours'],
  },
  {
    id: 'made',
    name: 'Factory precision',
    full: 'Made in the factory, bolted on site',
    label: 'Precise, and lean',
    replaced: 'Millimetric accuracy. Lower carbon.',
    tag: 'Millimetric',
    material: '',
    thick: 30,
    facts: ['caliper', 'carbon'],
    names: ['Millimetric', 'Lower carbon'],
  },
]

const WORDS: LineageWords = {
  title: 'What RTARIUM wall panels do best',
  rows: 'The wall panel system',
  used: '',
  replaced: '',
  claim: '',
}

/** each scene seen from a front diagonal, a little from above, swaying only a touch (it moves on its own) */
const SHOTS: Record<Fact, CellShot> = {
  strength: { target: [0, 0.02, 0], azim: 26, elev: 14, zoom: 1, sway: 2 },
  magnet: { target: [0, 0, 0], azim: 24, elev: 18, zoom: 1, sway: 2 },
  fire: { target: [0, 0.03, 0], azim: -22, elev: 10, zoom: 1, sway: 2 },
  caliper: { target: [0, 0.01, 0.1], azim: 28, elev: 20, zoom: 1, sway: 2 },
  carbon: { target: [0.04, -0.02, 0], azim: -16, elev: 10, zoom: 1, sway: 2 },
}

/** one fact, in its own canvas: its name at the top of its box, what it reads at the foot, the scene standing still */
function FactCell({ fact, name, compact, dark }: { fact: Fact; name: string; compact: boolean; dark: boolean }) {
  const shot = useMemo(() => () => SHOTS[fact], [fact])
  const host = useRef<HTMLDivElement>(null)
  const readout = useRef<HTMLParagraphElement>(null)
  const live = useRef(false)
  useEffect(() => {
    const el = host.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => void (live.current = e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const [sw, sh] = FACT_SIZE[fact]
  return (
    <div ref={host} className="fs-panel wp-fact">
      <Stage3D shadows keyLight={false}>
        <CellRig shotAt={shot} size={compact ? [sw * 0.98, sh * 0.98] : [sw * 1.08, sh * 1.08]} live={live} />
        <MovingKeyLight focus={[0, 0, 0]} reach={1.4} offset={[-4, 10, 7.5]} />
        <FactScene fact={fact} readout={readout} dark={dark} />
      </Stage3D>
      <p className="wp-fact__name">{name}</p>
      <p ref={readout} className="wp-fact__read num" aria-live="off" />
    </div>
  )
}

export function Story({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  // the two boxes along the foot read left to right, first fact first: the blocks take turns at which box is on the
  // left (the photograph's on the even ones, the panel's on the odd); on a phone the panel's box stands above. A
  // photograph always goes in the photograph's box, framed as the story frames its photographs (it opens out of its corner)
  const which = (k: number, compact: boolean, box: 'panel' | 'photo') => {
    const p = BLOCKS[k].facts.indexOf('photo')
    if (p >= 0) return box === 'photo' ? p : 1 - p
    return compact || k % 2 ? (box === 'panel' ? 0 : 1) : box === 'photo' ? 0 : 1
  }
  // and their grounds: the panel's box black on the even blocks, warm white on the odd; the photograph's the other way
  const dark = (k: number, box: 'panel' | 'photo') => (k % 2 === 0) === (box === 'panel')
  const cell = (k: number, compact: boolean, box: 'panel' | 'photo') => {
    const b = BLOCKS[k]
    const i = which(k, compact, box)
    const f = b.facts[i]
    if (f === 'photo') return null
    return <FactCell key={`${f}-${compact}`} fact={f} name={b.names[i]} compact={compact} dark={dark(k, box)} />
  }
  return (
    <Lineage
      id="walls-story"
      sectionRef={sectionRef}
      versions={BLOCKS}
      words={WORDS}
      finale={false}
      panel={(k, compact) => cell(k, compact, 'panel')}
      second={(k, compact) => cell(k, compact, 'photo')}
    />
  )
}
