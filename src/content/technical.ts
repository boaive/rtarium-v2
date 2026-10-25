/**
 * Every technical figure on the homepage, in one place.
 *
 * Source: RTARIUM TECHNICAL DATA - WEBSITE.pdf (client). Where the PDF's mesh table and its margin
 * notes disagree, the margin notes are treated as corrections (project owner, October 2026):
 * sheet lengths 2.4 / 3.4 / 5.8 m, elastic modulus 79,600 MPa, elongation at break 3.4 %.
 * Each figure records what it describes (mesh, yarn, or concrete reinforced with RTARIUM), because
 * the PDF reports different values for different things. `review` holds the open question that
 * `?review` shows beside the figure.
 */

export const THICKNESS_OPTIONS = [3, 6, 10, 15] as const
export type Thickness = (typeof THICKNESS_OPTIONS)[number]

/** what the 3D bench shows while a property row is under the cursor or focused */
export type BenchView = 'overview' | 'faces' | 'thickness' | 'fibres' | 'material'

export interface Spec {
  label: string
  value: string
  unit?: string
  note?: string
  view: BenchView
  review?: string
}

export interface SpecGroup {
  label: string
  rows: Spec[]
}

export const MESH_SPECS: SpecGroup[] = [
  {
    label: 'Geometry',
    rows: [
      { label: 'Structure', value: '3D woven spacer', note: 'Two faces held apart by connecting fibres', view: 'faces' },
      { label: 'Thickness options', value: '3 / 6 / 10 / 15', unit: 'mm', view: 'thickness' },
      {
        label: 'Sheet length',
        value: '2.4 / 3.4 / 5.8',
        unit: 'm',
        view: 'overview',
        review: 'From the margin note of the technical PDF; its table says 6 m.',
      },
      { label: 'Sheet width', value: '1,220', unit: 'mm', view: 'overview' },
      {
        label: 'Surface density',
        value: '220 – 320',
        unit: 'g/m²',
        note: '±10 g/m²',
        view: 'overview',
        review: 'Not tied to a thickness option in the PDF.',
      },
    ],
  },
  {
    label: 'Performance',
    rows: [
      { label: 'Tensile strength', value: '> 50', unit: 'kN/m', note: 'Per metre width of mesh', view: 'fibres' },
      {
        label: 'Elastic modulus',
        value: '79,600',
        unit: 'MPa',
        view: 'fibres',
        review: 'Margin-note value; the PDF table says ~71,000 MPa.',
      },
      {
        label: 'Elongation at break',
        value: '3.4',
        unit: '%',
        view: 'fibres',
        review: 'Margin-note value; the PDF table says 2.5 ±1 %.',
      },
    ],
  },
  {
    label: 'Resistance',
    rows: [
      { label: 'Sustained temperature', value: '820', unit: '°C', view: 'material' },
      { label: 'Melting point', value: '1,460 – 1,500', unit: '°C', view: 'material' },
      { label: 'Corrosion', value: 'Non-corrosive', view: 'material' },
      { label: 'Alkali', value: 'High resistance', view: 'material' },
    ],
  },
]

export interface Bar {
  label: string
  value: number
  rtarium?: boolean
}

export interface YarnComparison {
  id: string
  title: string
  figure: string
  unit: string
  /** unit of the bars' values */
  scaleUnit: string
  bars: Bar[]
  reading: string
}

/** The impregnated basalt yarn the mesh is woven from, against the materials the PDF names. */
export const YARN: YarnComparison[] = [
  {
    id: 'tensile',
    title: 'Tensile strength',
    figure: '2.62',
    unit: 'GPa',
    scaleUnit: 'MPa',
    bars: [
      { label: 'Structural steel', value: 550 },
      { label: 'High-strength aircraft aluminium', value: 570 },
      { label: 'Titanium alloy', value: 1200 },
      { label: 'RTARIUM yarn', value: 2620, rtarium: true },
      { label: 'Carbon fibre', value: 3500 },
    ],
    reading: 'Above steel, aircraft aluminium and titanium alloy; below carbon fibre.',
  },
  {
    id: 'modulus',
    title: 'Elastic modulus',
    figure: '79.6',
    unit: 'GPa',
    scaleUnit: 'GPa',
    bars: [
      { label: 'E-glass fibre', value: 72 },
      { label: 'AR-glass fibre', value: 74 },
      { label: 'RTARIUM yarn', value: 79.6, rtarium: true },
    ],
    reading: 'Stiffer than E-glass and AR-glass fibre.',
  },
  {
    id: 'elongation',
    title: 'Elongation at break',
    figure: '3.40',
    unit: '%',
    scaleUnit: '%',
    bars: [
      { label: 'Steel fibre', value: 1.5 },
      { label: 'Glass fibre', value: 2.5 },
      { label: 'RTARIUM yarn', value: 3.4, rtarium: true },
    ],
    reading: 'More stretch before it breaks than glass or steel fibre, which helps against cracking and shrinkage.',
  },
]

/** Concrete reinforced with RTARIUM. */
export const CONCRETE_FIGURES = [
  {
    id: 'axial',
    label: 'Axial tensile strength',
    value: '19.7',
    unit: 'MPa',
    context: 'Normal concrete reaches 2 to 5 MPa.',
    review: 'The comparison table gives 20.9 MPa; confirm whether these are two different tests.',
  },
  {
    id: 'elastic-limit',
    label: 'Elastic-limit tensile strength',
    value: '18.3',
    unit: 'MPa',
    context: 'Up to this stress the matrix behaves elastically; above it, the first internal micro-cracks form.',
  },
  {
    id: 'modulus',
    label: 'Tensile elastic modulus',
    value: '64',
    unit: 'GPa',
    context: 'A 20 mm GFRC is around 25 GPa; UHPC around 50 GPa.',
  },
] as const

/** Ultra-high-performance concrete with its steel fibres (SFRC) swapped for RTARIUM. */
export const SFRC_SWAP = [
  { metric: 'Tensile strength', sfrc: '16.2', rtarium: '20.9', unit: 'MPa', change: '+29 %' },
  { metric: 'Flexural strength', sfrc: '28.6', rtarium: '50.6', unit: 'MPa', change: '+77 %' },
] as const

export const CONCRETE_REVIEW =
  'No test standard, specimen geometry, mix, age, laboratory or mesh option is given for these results. Request the test report.'
