/**
 * Site map, applications and contact configuration.
 *
 * CONTACT DETAILS ARE NOT IN THE SUPPLIED MATERIAL. Nothing here is invented: while both channels
 * are empty, the contact page says so plainly instead of showing a form that cannot send.
 */
export const SITE = {
  name: 'RTARIUM',
  by: 'HEMISPHERE ONE',
  contact: {
    email: '',
    phone: '',
    address: '',
  },
} as const

export const contactConfigured = () => Boolean(SITE.contact.email || SITE.contact.phone)

/**
 * Cloudflare Turnstile's site key for the contact form (public: it is meant to be in the page; its secret lives only in
 * the Worker). While developing, Cloudflare's test key, which always passes, so the form works on localhost.
 */
export const TURNSTILE_SITE_KEY: string =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || (import.meta.env.DEV ? '1x00000000000000000000AA' : '0x4AAAAAAF81S59VTqixzZll')

/** `?review` in the address shows the open questions beside flagged figures. */
export const REVIEW_MODE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('review')

/** In-page chapters of the homepage, in reading order. */
export const CHAPTERS = [
  { id: 'about', label: 'About RTARIUM', short: 'About' },
  { id: 'innovation', label: 'Innovation', short: 'Innovation' },
  { id: 'tech', label: 'Tech Space', short: 'Tech Space' },
  { id: 'applications', label: 'Applications', short: 'Applications' },
] as const

export interface Application {
  id: string
  path: string
  title: string
  /** the client's own performance points for this application (site map workbook) */
  points: string[]
  intro: string
  pages: string[]
  image: { src: string; small: string; alt: string; position?: string }
  caption: string
}

export const APPLICATIONS: Application[] = [
  {
    id: 'facade',
    path: '/facade-cladding',
    title: 'Façade & Cladding',
    points: ['Thinner', 'Lighter', 'Stronger', 'In-built anchors'],
    intro:
      'Textile reinforced concrete for façade and cladding panels: RTARIUM replaces glass fibre and steel fibre as the intermediate reinforcement.',
    pages: ['Unitized thin concrete façade', 'RTARIUM rainscreen cladding', 'Stud frame cladding'],
    image: {
      src: '/img/shoot/mould-mesh-press.webp',
      small: '/img/shoot/mould-mesh-press-sm.webp',
      alt: 'RTARIUM mesh being pressed by hand into the mould of a thin façade panel',
      position: '42% 50%',
    },
    caption: 'RTARIUM pressed into the mould of a thin panel, production shoot.',
  },
  {
    id: 'flooring',
    path: '/advanced-flooring',
    title: 'Advanced Flooring',
    points: ['High peak loads', 'Crack resistance', 'Non-conductive', 'Improved flexural behaviour'],
    intro:
      'An intermediate reinforcement layer for thin, high-performance concrete overlays on structural slabs. Rust-proof, non-magnetic and chemically inert.',
    pages: ['Hyperscale data and AI centres', 'Automated warehouses', 'Semiconductor plants'],
    image: { src: '/img/site-strip.webp', small: '/img/site-strip.webp', alt: 'A long strip of RTARIUM mesh laid out on a site trial ground', position: '50% 70%' },
    caption: 'RTARIUM laid out on a site trial.',
  },
  {
    id: 'walls',
    path: '/wall-panels',
    title: 'Wall Panels',
    points: ['Thinner', 'Longer', 'Custom size', 'Mountable', 'Weatherproof'],
    intro:
      'A 30 mm solid panel and a 100 mm SIP insulated panel (15 + 70 mm EPS/SPS core + 15), up to 5.8 m × 600 mm.',
    pages: ['30 mm solid panel', '100 mm SIP insulated panel'],
    image: {
      src: '/img/shoot/load-hang.webp',
      small: '/img/shoot/load-hang-sm.webp',
      alt: 'A thin concrete panel hanging from chains by its cast-in inserts in the test bay',
      position: '50% 40%',
    },
    caption: 'A thin panel hung by its cast-in inserts, test bay.',
  },
]

export const ROUTES = {
  home: '/',
  contact: '/contact',
} as const
