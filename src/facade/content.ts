/**
 * Façade & Cladding: the section's pages, and the statements on them that still need the client's
 * confirmation.
 *
 * Sources, in order of authority: RTARIUM - SITE MAP AND CONTENT.xlsx (rows "Cladding & Façade",
 * "Unitized Concrete Façade", "Rainscreen Cladding", "Stud Frame Cladding"); RTARIUM Website
 * Corrections and New Modules.pdf (item 6 and the façade notes on page 2); RTARIUM TECHNICAL DATA -
 * WEBSITE.pdf for mesh figures; the production shoot for photographs. `REVIEW` holds the open
 * question shown beside a statement when the page is opened with `?review`.
 */

export const FACADE = { path: '/facade-cladding', title: 'Façade & Cladding' } as const

export type SystemId = 'unitized' | 'rainscreen' | 'stud'

export interface FacadeSystem {
  id: SystemId
  path: string
  title: string
  /** what the system is, in one line */
  line: string
  /** the same, cut down for the overview's stack */
  short: string
}

export const SYSTEMS: FacadeSystem[] = [
  {
    id: 'unitized',
    path: '/facade-cladding/unitized-thin-concrete-facade',
    title: 'Unitized Thin Concrete Façade',
    line: 'Thin concrete panels, glazing and insulation built into units off-site, then hung from slab to slab.',
    short: 'Whole façade units, built off-site and hung from slab to slab.',
  },
  {
    id: 'rainscreen',
    path: '/facade-cladding/rainscreen-cladding',
    title: 'Rainscreen Cladding',
    line: 'Large thin concrete panels held off the wall, in front of a ventilated cavity.',
    short: 'Large thin panels held off the wall, over a ventilated cavity.',
  },
  {
    id: 'stud',
    path: '/facade-cladding/stud-frame-cladding',
    title: 'Stud Frame Cladding',
    line: 'Architectural concrete skins on structural steel stud frames, for intricate profiles.',
    short: 'Concrete skins on steel stud frames, for intricate profiles.',
  },
]

export const systemByPath = (path: string) => SYSTEMS.find((s) => s.path === path)

/** Statements published in a qualified form, and what the client has to confirm. */
export const REVIEW = {
  sixMetres:
    'Site map: "Can reach up to 6 meters high in single thickness". Which panel thickness and mesh option? The longest mesh sheet listed is 5.8 m.',
  layerOrder:
    'The corrections PDF lists six components (panel, pre-glazed window, drywall-ready accessories, insulation padding, firestopping and smoke barriers, main mounting frame); the site map also lists vapour barrier, gasket, mounting bracket and mounting connection. Shown as the PDF list, with the site map items placed where they belong. Confirm.',
  connection:
    'Bracket, hook and restraint details are drawn generically to show the slab-to-slab principle; they are not a product drawing.',
  doubleHeight: 'Corrections PDF: "double height capability or multi-slab connection in single unit". No unit size or weight is given.',
  ferrules: 'Shown from the production shoot: ferrule inserts set into the mesh before the backing coat. Confirm these are the anchorage used for unitized units.',
  panelSizes:
    'Corrections PDF: "we can go with larger panel sizes 4m, 5m and 8m". Is this the panel length? Panel height, thickness and fixing are not given; an 8 m panel is longer than the longest mesh sheet listed (5.8 m).',
  rain: 'Not published: the site map says the rainscreen "deflects 90% rainwater and wind". No test, standard or source is given.',
  wrb: 'The site map calls the rainscreen a "Weather-Resistance Barrier (WRB)"; in usual rainscreen terms the WRB is the membrane on the wall behind the cavity. Not published until confirmed.',
  subframe: 'The support frame (brackets on the wall, vertical rails, fixings) is drawn generically after the installation references; no insulation or membrane is drawn because none is specified.',
  composite: 'Client positioning from the site map (ACP or metal composite against GRC / UHPC). No weight or cost figures are given, so none are shown.',
  skin: 'Site map: target thickness of the imprint 16 to 20 mm, face coat 5 mm. The mesh thickness option used in the skin is not given.',
  heat: 'Site map: flex anchors let the skin "expand in 45 degree temperature". Read as 45 °C air temperature; confirm.',
  profiles: 'The cornice, jamb and sill profiles are drawn for illustration; they are not a client design.',
} as const
