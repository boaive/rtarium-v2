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
    'Shown in the client\'s latest order (thin panel, insulation, vapour barriers, gasket, glazing window, mounting frame), with the mounting bracket, fire and smoke barrier and mounting connection in "Slab to slab". The earlier corrections PDF also listed drywall-ready accessories, which this page no longer shows. Confirm.',
  connection:
    'Bracket, hook and restraint details are drawn generically to show the slab-to-slab principle; they are not a product drawing.',
  doubleHeight: 'Corrections PDF: "double height capability or multi-slab connection in single unit". No unit size or weight is given.',
  ferrules: 'Shown from the production shoot: ferrule inserts set into the mesh before the backing coat. Confirm these are the anchorage used for unitized units.',
  panelSizes:
    'Owner, 28 Oct 2026: rainscreen panels go up to 6 m (the corrections PDF had named 4, 5 and 8 m). Panel width, thickness option and fixing are not given; the longest mesh sheet listed is 5.8 m.',
  rain: 'Published as the client’s line (site map: "Deflects 90% rainwater and wind"). No test, standard or source is given.',
  wrb: 'The site map calls the rainscreen a "Weather-Resistance Barrier (WRB)"; in usual rainscreen terms the WRB is the membrane on the wall behind the cavity. Not published until confirmed.',
  subframe: 'The support frame (brackets on the wall, vertical rails, fixings) is drawn generically after the installation references; no insulation or membrane is drawn because none is specified.',
  materials:
    'Typical figures from published sources, not tests of ours: precast 125–150 mm, about 350 kg/m² (Construction Canada); natural stone 20–30 mm, 30 mm granite about 75–85 kg/m², some systems limited to 600 × 1200 mm (manufacturer data); GRC skins 12–20 mm, about 30 kg/m² thin and more with its frame, AR-glass strength reduced by long wet exposure (PCI Journal 1987); UHPC 15–30 mm, 33–66 kg/m² (manufacturer data); ACP about 4 mm. Ranges vary by product; confirm before publishing figures.',
  weight:
    'Not in the client documents: 12 mm at an assumed 2,200–2,400 kg/m³ (the project’s earlier wall-panel weights used 2,400) is 26–29 kg/m², plus 0.22–0.32 kg/m² of mesh. Confirm the tested density.',
  composite: 'Client positioning from the site map (ACP or metal composite against GRC / UHPC). No weight or cost figures are given, so none are shown.',
  skin: 'Site map: target thickness of the imprint 16 to 20 mm, face coat 5 mm. The mesh thickness option used in the skin is not given.',
  heat: 'Site map: flex anchors let the skin "expand in 45 degree temperature". Read as 45 °C air temperature; confirm.',
  profiles: 'The cornice, jamb and sill profiles are drawn for illustration; they are not a client design.',
} as const
