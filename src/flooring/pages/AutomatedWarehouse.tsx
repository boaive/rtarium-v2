import { useEffect, useRef } from 'react'
import '../../facade/unitized.css'
import '../../facade/rainscreen.css'
import '../data.css'
import '../warehouse.css'
import { setShared, type Ground } from '../../three/stageStore'
import { FacadePage, usePageMeta } from '../../facade/Shell'
import { More } from '../data/More'
import { Hero } from '../warehouse/Hero'
import { Problems } from '../warehouse/Problems'
import { FailCards, type FailSceneOf, type Reason } from '../FailCards'
import type { LabelSpec } from '../../facade/three/Stage3D'
import { FailScene } from '../warehouse/three/FailScene'
import { Solution } from '../warehouse/Solution'
import { FloorFrame } from '../warehouse/FloorFrame'
import { Voices } from '../warehouse/Voices'

/* the client's two scenes, the fast floor and its failure, as five reasons */
const REASONS: Reason[] = [
  { id: 'race', name: 'At full speed', line: 'AGVs and picking cranes, down narrow aisles.', labels: [] },
  { id: 'stress', name: 'Into the slab', line: 'Every wheel load runs down through the screed.', labels: ['stress'] },
  { id: 'joint', name: 'Rolling shear', line: 'Heavy wheels cross the saw-cut joint, again and again.', labels: ['joint'] },
  { id: 'spall', name: 'Spalled, pitted, cracked', line: 'The edges break up. Micro-cracks run out.', labels: ['crack'] },
  { id: 'stop', name: 'System stop', line: 'A wheel catches. The laser loses alignment.', labels: ['laser'] },
]
/** the stretch of the scene each card plays: each ends on its own shot, before the camera leaves for the next */
const BEATS: [number, number][] = [
  [0, 0.55],
  [1.02, 1.5],
  [2.02, 2.72],
  [3.02, 3.74],
  [4.02, 4.8],
]
const FAIL_LABELS: LabelSpec[] = [
  { id: 'stress', anchor: 'fl-stress', text: 'Stress paths', dx: 70, dy: 80 },
  { id: 'joint', anchor: 'fl-joint', text: 'Saw-cut joint', dx: 70, dy: 90 },
  { id: 'crack', anchor: 'fl-crack', text: 'Micro-cracks', dx: 70, dy: 90 },
  { id: 'laser', anchor: 'fl-laser', text: 'Laser sensor', dx: -44, dy: -84 },
]
const failScene: FailSceneOf = (t, bus, compact, room, live) => <FailScene t={t} bus={bus} compact={compact} room={room} live={live} />

/**
 * Automated Warehouse. The Data & AI Centres page's grammar, its story moved from the electrical to
 * speed, wear and precision. One continuous scroll, the grounds taking turns:
 *
 *   the opening    yellow: a piece of the hall's floor, a laser-guided truck drawn on it, RTARIUM in its corner
 *   four failures  black: the line alone on a screen, then conventional screed against RTARIUM, row by row
 *   the failure    black, one screen: a card to each of the five reasons, each with its own piece of the scene
 *   the solution   yellow and black, pinned: the floor made again from its base, ending on the fast floor
 *   frame to floor warm white, pinned: that floor takes its racks, grows into a hall, the building drawn round it
 *   sign-offs      warm white: what it means for the consultant, the owner and the contractor, then
 *                  the sustainability win on black
 *   more ways      warm white: the other two applications
 *
 * Everything on the page moves with the scroll; only the 3D has motion of its own, in time.
 */
export default function AutomatedWarehouse() {
  usePageMeta(
    'Automated Warehouse',
    'RTARIUM for automated warehouse floors: a jointless 20 mm screed reinforced with a non-metallic 3D basalt mesh on structural PT and SFRC slabs. Flat floors and uninterrupted movement for AGVs and robotic cranes, 24/7.',
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

  return (
    <FacadePage>
      <div className="fu" data-ground="yellow">
        <Hero sectionRef={hero} />
      </div>
      <div className="fu" data-ground="black">
        <Problems />
      </div>
      <div className="fu" data-ground="black">
        <FailCards id="failure" title="Where the screed fails" label="Why a traditional floor fails" reasons={REASONS} beats={BEATS} labels={FAIL_LABELS} scene={failScene} fallback={<img className="fu-still" src="/img/flooring/aw-agv-aisle.webp" alt="" />} />
      </div>
      <div className="fu" data-ground="yellow">
        <Solution />
      </div>
      <div className="fu" data-ground="light">
        <FloorFrame />
      </div>
      <div className="fu" data-ground="light">
        <Voices />
      </div>
      <div className="fu" data-ground="light">
        <More current="warehouse" />
      </div>
    </FacadePage>
  )
}
