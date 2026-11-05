import { Problems as Table, type Problem } from '../data/Problems'

/*
 * The owner's brief for this page and the client's segment brief for advanced warehouses (RTARIUM
 * Flooring Strategic Briefing): jointless pours that eliminate curling; a multi-layered mesh that arrests
 * micro-cracks at the surface; non-metallic and magnetically inert, so zero sensor interference; 5 mm
 * cover either side of a 10 mm mesh; a polished floor under a polyurethane or polyaspartic wear coat.
 */
const PROBLEMS: Problem[] = [
  { id: 'spall', name: 'Joint spalling', problem: 'Rolling shear spalls and pits every saw-cut joint.', head: 'No joint to spall.', line: 'Monolithic bays: the wheels run on unbroken floor.' },
  { id: 'crack', name: 'Micro-cracking', problem: 'Micro-cracks open at the joints, then run deeper.', head: '5 + 10 + 5 mm.', line: 'A 10 mm 3D mesh, centred, arrests micro-cracks at the surface.' },
  { id: 'agv', name: 'Sensor failure', problem: 'A wheel catches, the laser loses alignment, the system stops.', head: 'Flat. Magnetically inert.', line: 'TR34 DM1 flatness for the wheels; non-metallic for the sensors.' },
  { id: 'dust', name: 'Abrasion and dust', problem: 'Constant traffic wears the surface away as dust.', head: 'Polished, then armoured.', line: 'Glass-smooth, under a polyurethane or polyaspartic coat.' },
]

export function Problems() {
  return (
    <Table
      problems={PROBLEMS}
      close={['Zero interference.', 'Zero curling.', '24/7 precision.']}
      title={
        <>
          Traditional screeds were not built for this. <b>RTARIUM was built for this.</b>
        </>
      }
    />
  )
}
