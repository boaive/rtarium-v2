// What each page says to a search engine or a link preview before any script runs: its title, its description, its
// heading and a few paragraphs of its copy, and the pages it links on to. scripts/prerender.mjs writes these into each
// route's own index.html at build time. The titles and descriptions match what the page itself sets once it runs
// (usePageMeta and document.title in src/), so a crawler that runs the script and one that does not read the same.

export const SITE_URL = 'https://rtarium.com'
export const BRAND = 'RTARIUM by HEMISPHERE ONE'
/** 1200 × 630, for Open Graph and Twitter cards (made by scripts/make-share-image.py) */
export const SHARE_IMAGE = { path: '/og/rtarium-share.jpg', width: 1200, height: 630, alt: 'RTARIUM three-dimensional basalt reinforcement mesh in a thin concrete façade panel' }

const titled = (t) => `${t} · ${BRAND}`

/** the site's sections, as the header lists them */
export const NAV = [
  { path: '/advanced-flooring', label: 'Advanced Flooring' },
  { path: '/facade-cladding', label: 'Façade & Cladding' },
  { path: '/wall-panels', label: 'Wall Panels' },
  { path: '/contact', label: 'Contact' },
]

const FACADE_SYSTEMS = [
  { path: '/facade-cladding/unitized-thin-concrete-facade', label: 'Unitized Thin Concrete Façade', line: 'Thin concrete panels, glazing and insulation built into units off-site, then hung from slab to slab.' },
  { path: '/facade-cladding/rainscreen-cladding', label: 'Rainscreen Cladding', line: 'Large thin concrete panels held off the wall, in front of a ventilated cavity.' },
  { path: '/facade-cladding/stud-frame-cladding', label: 'Stud Frame Cladding', line: 'Architectural concrete skins on structural steel stud frames, for intricate profiles.' },
]
const FLOORING_APPS = [
  { path: '/advanced-flooring/data-ai-centres', label: 'Data & AI Centres', line: 'Heavy racks on a floor that must never crack.' },
  { path: '/advanced-flooring/automated-warehouse', label: 'Automated Warehouse', line: 'Flat, jointless floors for robots running all day.' },
  { path: '/advanced-flooring/semiconductor-plant', label: 'Semiconductor Plant', line: 'Still, inert floors for cleanrooms and their tools.' },
]
const WALL_STREAMS = [
  { path: '/wall-panels/affordable-housing', label: 'Affordable housing', line: 'A single-storey home: vertical SIP walls, a lintel over every opening.' },
  { path: '/wall-panels/industrial-building', label: 'Industrial building', line: 'A logistics hub: SIP to 3.7 m, 30 mm solid above, three loading bays.' },
  { path: '/wall-panels/frame-structure', label: 'Frame structure', line: 'An RC frame infilled, or a steel portal clad.' },
]
const WALLS_DESCRIPTION =
  'RTARIUM modular wall panels: 30 mm solid panels and 100 mm SIP insulated panels, reinforced with a three-dimensional basalt mesh. Non-magnetic, fire-rated, interlocking on all four sides and bolted, not welded, for logistics hubs, cleanroom plants, data centres, housing and frame structures.'
const WALLS_BODY = [
  'A 30 mm solid panel and a 100 mm SIP insulated panel (15 + 70 mm EPS/SPS core + 15), up to 5.8 m × 600 mm, each reinforced with RTARIUM.',
  '30 mm solid panels span 5.8 m column bays while maintaining deflection control. Made with inert basalt, with ferrule inserts cast in at the factory, the panels are lifted by their tie holes, clamped and bolted to the frame: no welding required. A four-sided tongue-and-groove joint aligns each panel and distributes horizontal wind shear.',
]

/**
 * Every page the build writes. `path` has no trailing slash (as the app's router reads it); its address on the site
 * has one, which is where the server sends any address without it.
 */
export const PAGES = [
  {
    path: '/',
    // (≤ 60 characters and ≤ 155: what a results page shows without cutting)
    title: `${BRAND} · 3D Basalt Reinforcement Mesh`,
    description:
      'RTARIUM by HEMISPHERE ONE: a 3D basalt spacer mesh for thin, high-performance concrete in advanced flooring, façades and cladding, and wall panels.',
    h1: 'RTARIUM: three-dimensional basalt reinforcement mesh',
    body: [
      'RTARIUM is a three-dimensional basalt spacer mesh for thin, high-performance concrete: two basalt mesh faces held apart by connecting fibres. Concrete flows right through its open cavity and is cast round both faces, so the mesh is locked in three dimensions.',
      'Woven from volcanic rock, it is three-dimensional, monolithic and non-corrosive: rust-proof, non-magnetic and chemically inert. It replaces steel bar, AR-glass fibre and steel fibre as the reinforcement of thin concrete.',
      'RTARIUM is made by HEMISPHERE ONE for three applications:',
    ],
    links: [
      { path: '/advanced-flooring', label: 'Advanced Flooring', line: 'An intermediate reinforcement layer for thin, high-performance concrete overlays on structural slabs.' },
      { path: '/facade-cladding', label: 'Façade & Cladding', line: 'Textile reinforced concrete for façade and cladding panels: thinner, lighter, stronger, with in-built anchors.' },
      { path: '/wall-panels', label: 'Wall Panels', line: 'A 30 mm solid panel and a 100 mm SIP insulated panel, up to 5.8 m × 600 mm.' },
    ],
    product: true,
  },
  {
    path: '/facade-cladding',
    title: titled('Façade & Cladding'),
    description:
      'RTARIUM in façades and cladding: concrete façades, re-engineered. One 3D basalt mesh replaces steel bar, AR-glass fibre and steel fibre in thin façade panels: unitized thin concrete façades, rainscreen cladding and stud frame cladding.',
    h1: 'Façade & Cladding: concrete façades, re-engineered',
    body: [
      'Textile reinforced concrete for façade and cladding panels: RTARIUM replaces glass fibre and steel fibre as the intermediate reinforcement. One 3D basalt mesh makes thin façade panels thinner, lighter and stronger, with anchors built in.',
      'Three façade systems use it:',
    ],
    links: FACADE_SYSTEMS,
    product: true,
  },
  {
    path: '/facade-cladding/unitized-thin-concrete-facade',
    title: titled('Unitized Thin Concrete Façade'),
    description:
      'Unitized thin concrete façade: an advanced prefabricated building envelope system. Thin concrete panels reinforced with RTARIUM, insulation, vapour barrier, gasket, glazing and a main mounting frame, built off-site as modular units with in-built anchorage and hung from slab to slab.',
    h1: 'Unitized Thin Concrete Façade',
    body: [
      'An advanced prefabricated building envelope system: thin concrete panels reinforced with RTARIUM, insulation, vapour barrier, gasket, glazing window and a main mounting frame, assembled off-site as modular units.',
      'Each unit carries in-built anchorage and is lifted into place, hung from slab to slab and sealed slab to slab.',
    ],
    links: FACADE_SYSTEMS.filter((s) => s.path !== '/facade-cladding/unitized-thin-concrete-facade'),
    linksTitle: 'Other façade systems',
    parent: '/facade-cladding',
  },
  {
    path: '/facade-cladding/rainscreen-cladding',
    title: titled('Rainscreen Cladding'),
    description:
      'RTARIUM rainscreen cladding: a ventilated system for weather protection, of thin concrete panels reinforced with a 3D basalt textile. A solid concrete face, a lightweight 12 mm panel, under 30 kg/m², integrated fixing points, non-corrosive, panels up to 6 m tall.',
    h1: 'Rainscreen Cladding',
    body: [
      'A ventilated system for weather protection: large thin concrete panels reinforced with a 3D basalt textile, held off the wall in front of a ventilated cavity.',
      'A solid concrete face on a lightweight 12 mm panel, under 30 kg/m², with integrated fixing points. Non-corrosive, with panels up to 6 m tall.',
    ],
    links: FACADE_SYSTEMS.filter((s) => s.path !== '/facade-cladding/rainscreen-cladding'),
    linksTitle: 'Other façade systems',
    parent: '/facade-cladding',
  },
  {
    path: '/facade-cladding/stud-frame-cladding',
    title: titled('Stud Frame Cladding'),
    description:
      'RTARIUM stud frame cladding: architectural concrete skins of 16 to 20 mm on galvanized steel stud frames, joined by flexible L-plates that let the skin move with the heat. Sprayed face down with RTARIUM cut and stitched inside, craned onto L frames on site, levelled and sealed.',
    h1: 'Stud Frame Cladding',
    body: [
      'Architectural concrete skins of 16 to 20 mm on galvanized steel stud frames, for intricate profiles such as cornices, jambs and sills.',
      'The skin is sprayed face down with RTARIUM cut and stitched inside, joined to the frame by flexible L-plates that let it move with the heat, then craned onto L frames on site, levelled and sealed.',
    ],
    links: FACADE_SYSTEMS.filter((s) => s.path !== '/facade-cladding/stud-frame-cladding'),
    linksTitle: 'Other façade systems',
    parent: '/facade-cladding',
  },
  {
    path: '/advanced-flooring',
    title: titled('Advanced Flooring'),
    description:
      'RTARIUM in advanced flooring: the first independent 3D mineral reinforcement mesh for high-performance concrete overlays. Crack-free, jointless, vibration-dampening and rust-proof floors for data and AI centres, automated warehouses and semiconductor plants.',
    h1: 'Advanced Flooring',
    body: [
      'The first independent 3D mineral reinforcement mesh for high-performance concrete overlays: an intermediate reinforcement layer for thin overlays on structural slabs. Rust-proof, non-magnetic and chemically inert.',
      'Crack-free, jointless, vibration-dampening floors that take high peak loads, with improved flexural behaviour, for three applications:',
    ],
    links: FLOORING_APPS,
    product: true,
  },
  {
    path: '/advanced-flooring/data-ai-centres',
    title: titled('Data & AI Centres'),
    description:
      'RTARIUM for data and AI centre floors: a 20 mm screed reinforced with a non-metallic 3D basalt mesh on prestressed hollow-core slabs. Less dead weight, no conductive dust, a flawless anchor for ESD coatings.',
    h1: 'Floors for Data & AI Centres',
    body: [
      'Heavy racks on a floor that must never crack. RTARIUM reinforces a 20 mm screed with a non-metallic 3D basalt mesh on prestressed hollow-core slabs.',
      'Less dead weight, no conductive dust, and a flawless anchor for ESD coatings.',
    ],
    links: FLOORING_APPS.filter((a) => a.path !== '/advanced-flooring/data-ai-centres'),
    linksTitle: 'Other flooring applications',
    parent: '/advanced-flooring',
  },
  {
    path: '/advanced-flooring/automated-warehouse',
    title: titled('Automated Warehouse'),
    description:
      'RTARIUM for automated warehouse floors: a jointless 20 mm screed reinforced with a non-metallic 3D basalt mesh on structural PT and SFRC slabs. Flat floors and uninterrupted movement for AGVs and robotic cranes, 24/7.',
    h1: 'Floors for Automated Warehouses',
    body: [
      'Flat, jointless floors for robots running all day. RTARIUM reinforces a jointless 20 mm screed with a non-metallic 3D basalt mesh on structural PT and SFRC slabs.',
      'Flat floors and uninterrupted movement for AGVs and robotic cranes, 24/7.',
    ],
    links: FLOORING_APPS.filter((a) => a.path !== '/advanced-flooring/automated-warehouse'),
    linksTitle: 'Other flooring applications',
    parent: '/advanced-flooring',
  },
  {
    path: '/advanced-flooring/semiconductor-plant',
    title: titled('Semiconductor Plant'),
    description:
      'RTARIUM for semiconductor cleanroom floors: a 20 mm graphene self-levelling screed reinforced with a non-metallic 3D basalt mesh on post-tensioned waffle slabs. Micro-vibration damped, zero outgassing and dusting, a flawless anchor for ESD coatings.',
    h1: 'Floors for Semiconductor Plants',
    body: [
      'Still, inert floors for cleanrooms and their tools. RTARIUM reinforces a 20 mm graphene self-levelling screed with a non-metallic 3D basalt mesh on post-tensioned waffle slabs.',
      'Micro-vibration damped, with zero outgassing and dusting, and a flawless anchor for ESD coatings.',
    ],
    links: FLOORING_APPS.filter((a) => a.path !== '/advanced-flooring/semiconductor-plant'),
    linksTitle: 'Other flooring applications',
    parent: '/advanced-flooring',
  },
  {
    path: '/wall-panels',
    title: titled('Wall Panels'),
    description: WALLS_DESCRIPTION,
    h1: 'Wall Panels',
    body: WALLS_BODY,
    links: WALL_STREAMS,
    linksTitle: 'Built with RTARIUM wall panels',
    product: true,
  },
  ...WALL_STREAMS.map((s) => ({
    path: s.path,
    title: titled(`${s.label} · Wall Panels`),
    description: WALLS_DESCRIPTION,
    h1: `Wall Panels for ${s.label.toLowerCase()}`,
    body: [s.line, ...WALLS_BODY],
    links: WALL_STREAMS.filter((o) => o.path !== s.path),
    linksTitle: 'Other uses',
    parent: '/wall-panels',
  })),
  {
    path: '/contact',
    title: titled('Contact'),
    description:
      'Contact RTARIUM by HEMISPHERE ONE about 3D basalt reinforcement mesh for flooring, façades and wall panels: write to info@rtarium.com or send an enquiry.',
    h1: 'Contact RTARIUM',
    body: [
      'Write to us at info@rtarium.com, or send an enquiry through the form on this page, about RTARIUM for advanced flooring, façades and cladding, or wall panels.',
    ],
    email: 'info@rtarium.com',
  },
  {
    path: '/privacy',
    title: titled('Privacy'),
    description: 'What the RTARIUM website collects and why: the enquiry form, hosting by Cloudflare, and Google Analytics only if you accept. Questions go to info@rtarium.com.',
    h1: 'Privacy',
    body: [
      'This site is run by HEMISPHERE ONE. This page says what it collects, why, and how to change your mind: what you send through the enquiry form, how Cloudflare serves the pages, and Google Analytics, used only if you accept. Questions go to info@rtarium.com.',
    ],
  },
]

/** a page's address on the site: always with its trailing slash, where the server lands it */
export const urlOf = (path) => `${SITE_URL}${path === '/' ? '/' : `${path}/`}`
