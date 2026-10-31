import { useEffect, useMemo, useRef } from 'react'
import '../../facade/unitized.css'
import '../../facade/rainscreen.css'
import '../data.css'
import '../semi.css'
import { setShared, type Ground } from '../../three/stageStore'
import { scrollToY } from '../../lib/scroll'
import { FacadePage, usePageMeta } from '../../facade/Shell'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../../facade/three/Stage3D'
import { createBus } from '../../facade/three/kit'
import { useLive } from '../../facade/unitized/live'
import { Problems, type Problem, type SampleOf } from '../data/Problems'
import { CARBON_BAND, Voices, type Band } from '../data/Voices'
import { More } from '../data/More'
import { Hero } from '../semi/Hero'
import { Stage, type SceneOf, type Step } from '../semi/Stage'
import { FloorFrame } from '../semi/FloorFrame'
import { CardSample, type CardKind } from '../semi/three/CardSample'
import { THREAT_CUTS, ThreatScene } from '../semi/three/ThreatScene'
import { BuildScene } from '../semi/three/BuildScene'
import { BuildUp } from '../semi/three/BuildUp'

/**
 * Semiconductor Plant. One continuous scroll in the Data & AI Centres page's grammar, the grounds
 * taking turns:
 *
 *   the opening    yellow: a piece of a cleanroom's floor on its waffle slab, a process tool drawn on it
 *   three failures yellow rising to black: micro-vibration, cleanroom dust, chemicals and ESD, each a
 *                  card struck and answered in place
 *   the problem    black, its bar red, pinned: the nanometre a fab prints to, the tremor from the floor
 *                  that loses a die, the plant under the slab, the vapour and dust a screed lets through
 *   yield kept     yellow, pinned: how RTARIUM's floor answers each threat, in seven steps from the slab
 *   frame to floor warm white, pinned: the floor grows into the cleanroom, the fab drawn round it
 *   sign-offs      warm white: what it means for the consultant, the owner and the contractor, then
 *                  the sustainability win on black
 *   more ways      warm white: the other two applications
 *
 * Everything on the page moves with the scroll; only the 3D has motion of its own, in time.
 */

/*
 * The client's segment brief for semiconductor and electronics plants (RTARIUM Flooring Strategic
 * Briefing): vibration damping from the monolithic bond of 80 mm RC and a 20 mm RTARIUM screed; a
 * dense surface that does not dust; a stable, chemical-resistant sub-base under ESD resin coats.
 * Photographs of other fabs are open-licence and credited; RTARIUM's own are its site and studio.
 */
const PROBLEMS: Problem[] = [
  {
    id: 'vibration',
    name: 'Micro-vibration',
    problem: 'Building vibration misaligns lithography tools and destroys whole batches of wafers.',
    tab: 'A monolithic damper',
    head: 'Damped at the slab.',
    line: '80 mm RC and 20 mm RTARIUM bond into one shock absorber, raising the floor’s damping ratio.',
    photos: [
      { src: '/img/flooring/sc-cleanroom.webp', alt: 'The cleanroom of a semiconductor plant under yellow light, its process tools along the walls', credit: 'Photo: NASA, public domain' },
      { src: '/img/shoot/mesh-macro.webp', alt: 'RTARIUM basalt mesh, close up' },
    ],
  },
  {
    id: 'dust',
    name: 'Cleanroom dust',
    problem: 'Screeds delaminate over time, shedding fine dust that overwhelms the filters.',
    tab: 'Dense, non-dusting',
    head: 'Dense. Zero dust.',
    line: 'An exceptionally dense surface matrix that will not dust under mechanical stress.',
    photos: [
      { src: '/img/flooring/sc-ffu.webp', alt: 'A cleanroom under construction: the fan-filter ceiling grid over a bare floor', credit: 'Photo: Rudolf Simon, M+W Group, CC BY-SA 2.0 DE' },
      { src: '/img/flooring/dc-site-gloss.webp', alt: 'A long, level strip of freshly laid RTARIUM screed, glossy, between the columns of a hall' },
    ],
  },
  {
    id: 'esd',
    name: 'Chemicals & ESD',
    problem: 'Washdowns crack and blister resin top-coats, breaking the path to ground.',
    tab: 'An unbroken path to ground',
    head: 'Stable under the coat.',
    line: 'A chemical-resistant sub-base: no cracking, no bubbling, a continuous path to ground.',
    photos: [
      { src: '/img/flooring/sc-wetbench.webp', alt: 'Two people in cleanroom suits at a wet bench under orange light', credit: 'Photo: UCL MAPS, CC BY 2.0' },
      { src: '/img/flooring/dc-site-strip.webp', alt: 'A strip of RTARIUM screed, finished, on the slab of a building under construction', pos: '30% 50%' },
    ],
  },
]
const CLOSE = ['Micro-vibration arrested.', 'Zero dust.', 'Continuous ESD.']
const sample: SampleOf = (id, solved, live) => <CardSample kind={id as CardKind} solved={solved} live={live} />

/* The client's scenes 1 and 2, in five steps. */
const THREAT: Step[] = [
  { id: 'standard', name: 'The nano-scale standard', head: ['Printed to', 'the nanometre'], line: 'EUV scanners print circuits onto silicon wafers, under amber light.', labels: ['scanner', 'amhs'] },
  { id: 'line', name: 'The laser line', head: ['One line,', 'held still'], line: 'The beam must hold its place while every line is printed.', labels: ['line'] },
  { id: 'shock', name: 'The shockwave', head: ['A tremor', 'from the floor'], line: 'A micro-vibration reaches the stage. The line blurs; the die is lost.', labels: ['wave', 'defect'] },
  { id: 'under', name: 'Under the floor', head: ['Pumps, chillers,', 'slab creep'], line: 'Plant shakes the slab, and a brittle topping passes all of it up.', labels: ['plant', 'topping'] },
  { id: 'dust', name: 'Vapour and dust', head: ['Vapour in,', 'dust out'], line: 'Moisture rises through the concrete; the screed sheds cement dust at its joints.', labels: ['vapour', 'dust'] },
]
const THREAT_LABELS: LabelSpec[] = [
  { id: 'scanner', anchor: 'tt-scanner', text: 'EUV scanner', dx: 70, dy: -60 },
  { id: 'amhs', anchor: 'tt-amhs', text: 'AMHS', dx: -50, dy: -60 },
  { id: 'line', anchor: 'tt-line', text: 'Circuit line', dx: 60, dy: -80 },
  { id: 'wave', anchor: 'tt-wave', text: 'Micro-vibration', dx: -60, dy: 70 },
  { id: 'defect', anchor: 'tt-defect', text: 'Defect', dx: 60, dy: -70 },
  { id: 'plant', anchor: 'tt-plant', text: 'Pumps, chillers, air handlers', dx: -50, dy: -70 },
  { id: 'topping', anchor: 'tt-topping', text: 'Brittle topping', dx: 60, dy: 80 },
  { id: 'vapour', anchor: 'tt-vapour', text: 'Moisture vapour', dx: 60, dy: 80 },
  { id: 'dust', anchor: 'tt-dust', text: 'Cement dust', dx: 60, dy: -70 },
]

/* The client's scenes 3 to 8, the first two of scene 3's actions taken as one step. */
const BUILD: Step[] = [
  { id: 'grind', name: 'Diamond ground', head: ['Diamond', 'ground'], line: 'The old topping cleared, the slab ground to a clean CSP-4 profile.', labels: ['csp', 'grinder'] },
  { id: 'seal', name: 'Sealed and set out', head: ['Sealed,', 'set to a laser'], line: 'An epoxy vapour barrier, then height buttons set to a laser grid, to the millimetre.', labels: ['barrier', 'laser', 'button'] },
  { id: 'mesh', name: 'RTARIUM mesh', head: ['10 mm', 'RTARIUM mesh'], line: 'Set on the buttons and locked in the centre: 5 mm below, 5 mm above.', labels: ['mesh', 'low', 'mid', 'up'] },
  {
    id: 'pour',
    name: 'Self-levelling pour',
    head: ['Graphene', 'self-levelling'],
    line: '800 mm slump flow from an enclosed mixer-pump. No pockets, no seams.',
    labels: ['pump', 'flow'],
    clip: { src: '/video/dc-pour.mp4', poster: '/video/dc-pour.jpg', label: 'On site: concrete pumped onto the floor through the hose' },
  },
  { id: 'pore', name: 'Pore-refined cure', head: ['Pore-refined', 'as it cures'], line: 'Graphene seals the capillaries: nothing left to outgas or dust.', labels: ['pores'] },
  { id: 'flat', name: 'Jointless, ground flat', head: ['Jointless,', 'ground flat'], line: 'One monolithic plate, ground ultra-flat for the cleanroom.', labels: ['grinder5', 'joint'] },
  { id: 'esd', name: 'ESD armour', head: ['Cleanroom', 'armour'], line: 'A conductive primer, a copper grounding grid, a high-gloss ESD top coat.', labels: ['cond', 'tape', 'coat'] },
]
const BUILD_LABELS: LabelSpec[] = [
  { id: 'csp', anchor: 'sb-csp', text: 'CSP-4 profile', dx: 60, dy: 80 },
  { id: 'grinder', anchor: 'sb-grinder', text: 'Planetary diamond grinder', dx: -50, dy: -70 },
  { id: 'barrier', anchor: 'sb-barrier', text: 'Epoxy vapour barrier', dx: 60, dy: -96 },
  { id: 'laser', anchor: 'sb-laser', text: 'Laser grid', dx: -50, dy: -80 },
  { id: 'button', anchor: 'sb-button', text: 'Height button', dx: 56, dy: 96 },
  { id: 'mesh', anchor: 'sb-mesh', text: 'RTARIUM, 10 mm', dx: -60, dy: -90 },
  { id: 'low', anchor: 'sb-low', text: '5 mm', dx: 14, dy: 0, wide: true },
  { id: 'mid', anchor: 'sb-mid', text: '10 mm', dx: 14, dy: 0, wide: true },
  { id: 'up', anchor: 'sb-up', text: '5 mm', dx: 14, dy: 0, wide: true },
  { id: 'pump', anchor: 'sb-pump', text: 'Enclosed mixer-pump', dx: -56, dy: -60 },
  { id: 'flow', anchor: 'sb-flow', text: '800 mm slump flow', dx: 60, dy: 90 },
  { id: 'pores', anchor: 'sb-pores', text: 'Capillaries sealed', dx: -40, dy: -70, wide: true },
  { id: 'grinder5', anchor: 'sb-grinder', text: 'Planetary grinder', dx: -50, dy: -70 },
  { id: 'joint', anchor: 'sb-joint', text: 'No joints', dx: 60, dy: 90 },
  { id: 'cond', anchor: 'sb-cond', text: 'Conductive primer', dx: -50, dy: 84 },
  { id: 'tape', anchor: 'sb-tape', text: 'Copper grounding grid', dx: 70, dy: 90 },
  { id: 'coat', anchor: 'sb-coat', text: 'High-gloss ESD top coat', dx: 60, dy: -90 },
]

const threatScene: SceneOf = (t, bus, compact, room, live) => <ThreatScene t={t} bus={bus} compact={compact} room={room} live={live} />
const buildScene: SceneOf = (t, bus, compact, room) => <BuildScene t={t} bus={bus} compact={compact} room={room} />

/* The client's messages for the three people who sign the floor off, then the sustainability win. */
const BANDS: Band[] = [
  {
    id: 'consultant',
    role: 'Fab Consultant & Process Engineer',
    head: 'Guarantee maximum vibration control.',
    line: 'The combined dampening properties of RTARIUM 3D Mesh and Graphene-SLC mute micro-vibrations to comfortably meet strict VC-D and VC-E standards, protecting high-yield lithography.',
    media: { kind: '3d' },
  },
  {
    id: 'owner',
    role: 'Semiconductor Developer & Facility Owner',
    head: 'Achieve absolute atmospheric containment.',
    line: 'A pore-refined, zero-outgassing matrix that completely eliminates sub-surface moisture transmission and concrete out-dusting to preserve critical ISO cleanroom classification.',
    media: { kind: 'photo', src: '/img/flooring/sc-inspect.webp', alt: 'An engineer in a cleanroom suit at an inspection microscope under yellow light', credit: 'Photo: O. Usher, UCL MAPS, CC BY 2.0', pos: '50% 40%' },
  },
  {
    id: 'contractor',
    role: 'Specialized Sub-Contractor',
    head: 'Flawless millimetric execution.',
    line: 'A high-fluidity 800 mm slump mix that self-levels effortlessly over a lightweight, non-conductive, and non-magnetic 3D basalt mesh, cutting installation windows in half with zero risk of structural cracking.',
    media: { kind: 'photo', src: '/img/flooring/dc-site-pump.webp', alt: 'RTARIUM on site: the mixer-pump, its hose across the slab and a crew levelling a strip of the floor', pos: '50% 50%' },
  },
  CARBON_BAND,
]

const MODEL_LABELS: LabelSpec[] = [
  { id: 'coat', anchor: 'su-coat', text: 'ESD top coat', dx: 56, dy: -70 },
  { id: 'mesh', anchor: 'su-mesh', text: 'RTARIUM, 10 mm', dx: -50, dy: -84 },
  { id: 'slc', anchor: 'su-slc', text: '20 mm graphene SLC', dx: -56, dy: 64 },
  { id: 'slab', anchor: 'su-slab', text: 'Post-tensioned waffle slab', dx: 50, dy: 70 },
]

function Model() {
  const host = useRef<HTMLDivElement>(null)
  const live = useLive(host)
  const bus = useMemo(createBus, [])
  return (
    <div ref={host} className="fdc-v__model" aria-hidden="true">
      <Stage3D shadows keyLight={false}>
        <BuildUp bus={bus} live={live} />
        <LabelProjector bus={bus} bottom={12} />
      </Stage3D>
      <Labels bus={bus} labels={MODEL_LABELS} shown={MODEL_LABELS.map((l) => l.id)} />
    </div>
  )
}

export default function SemiconductorPlant() {
  usePageMeta(
    'Semiconductor Plant',
    'RTARIUM for semiconductor cleanroom floors: a 20 mm graphene self-levelling screed reinforced with a non-metallic 3D basalt mesh on post-tensioned waffle slabs. Micro-vibration damped, zero outgassing and dusting, a flawless anchor for ESD coatings.',
  )
  const hero = useRef<HTMLElement>(null)

  // the header takes the ground of whatever is under it, the footer included
  useEffect(() => {
    const read = () => {
      raf = 0
      let ground: Ground = 'light'
      document.querySelectorAll<HTMLElement>('[data-ground]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.top <= 40 && r.bottom > 40) ground = el.dataset.ground as Ground
      })
      const footer = document.querySelector<HTMLElement>('.footer')
      if (footer && footer.getBoundingClientRect().top <= 40) ground = 'yellow'
      setShared({ ground, chapter: 'facade' })
    }
    let raf = 0
    // read a frame late: the sign-offs' ledger lays its bands out in the frame the scroll arrives in
    const on = () => {
      if (!raf) raf = requestAnimationFrame(() => (raf = requestAnimationFrame(read)))
    }
    document.documentElement.setAttribute('data-own-ground', '')
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      document.documentElement.removeAttribute('data-own-ground')
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [])

  const back = (
    <button
      type="button"
      className="fu-bar__back"
      onClick={() => {
        const el = document.getElementById('threat')
        if (el) scrollToY(el.getBoundingClientRect().top + window.scrollY)
      }}
    >
      Back to the problem
    </button>
  )

  return (
    <FacadePage>
      <div className="fu" data-ground="yellow">
        <Hero sectionRef={hero} />
      </div>
      <div className="fu">
        <Problems problems={PROBLEMS} close={CLOSE} sample={sample} />
      </div>
      <div className="fu" data-ground="black">
        <Stage
          id="threat"
          title="Where yield is lost"
          steps={THREAT}
          stretch={[1.3, 1.4, 1.5, 1.5, 1.5]}
          labels={THREAT_LABELS}
          tone="black"
          barLabel="How a fab floor fails"
          fallback={<img className="fu-still" src="/img/flooring/sc-cleanroom.webp" alt="" />}
          scene={threatScene}
          cuts={THREAT_CUTS}
        />
      </div>
      <div className="fu" data-ground="yellow">
        <Stage
          id="build"
          title="How yield is kept"
          steps={BUILD}
          stretch={[1.4, 1.5, 1.5, 1.7, 1.5, 1.4, 1.6]}
          labels={BUILD_LABELS}
          tone="yellow"
          barLabel="How the floor is built"
          after={back}
          fallback={<img className="fu-still" src="/img/flooring/dc-site-strip.webp" alt="" />}
          scene={buildScene}
        />
      </div>
      <div className="fu" data-ground="light">
        <FloorFrame />
      </div>
      <div className="fu" data-ground="light">
        <Voices bands={BANDS} model={<Model />} />
      </div>
      <div className="fu" data-ground="light">
        <More current="semiconductor" />
      </div>
    </FacadePage>
  )
}
