/**
 * Site map, applications and contact configuration.
 *
 * The email is the owner's (12 Nov 2026): the way most clients prefer to reach RTARIUM, so the contact page and the
 * footer lead with it, the enquiry form second. Phone and address are not in the supplied material: nothing invented.
 */
export const SITE = {
  name: 'RTARIUM',
  by: 'HEMISPHERE ONE',
  contact: {
    email: 'info@rtarium.com',
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

/** Where enquiries go: the same address (the Worker's CLIENT_ADDRESS in wrangler.jsonc). */
export const ENQUIRY_ADDRESS = SITE.contact.email

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
      src: '/img/client/h2.webp',
      small: '/img/client/h2-sm.webp',
      alt: '3D render of a thin concrete façade panel with exposed RTARIUM reinforcement',
      position: '50% 50%',
    },
    caption: '3D render of the RTARIUM façade model.',
  },
  {
    id: 'flooring',
    path: '/advanced-flooring',
    title: 'Advanced Flooring',
    points: ['High peak loads', 'Crack resistance', 'Non-conductive', 'Improved flexural behaviour'],
    intro:
      'An intermediate reinforcement layer for thin, high-performance concrete overlays on structural slabs. Rust-proof, non-magnetic and chemically inert.',
    pages: ['Hyperscale data and AI centres', 'Automated warehouses', 'Semiconductor plants'],
    image: { src: '/img/client/h3.webp', small: '/img/client/h3-sm.webp', alt: '3D render of RTARIUM mesh between a structural slab and a thin screed', position: '50% 50%' },
    caption: '3D render of the RTARIUM flooring model.',
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
      src: '/img/client/h4.webp',
      small: '/img/client/h4-sm.webp',
      alt: '3D render of an RTARIUM insulated wall panel with its layers separated',
      position: '50% 50%',
    },
    caption: '3D render of the RTARIUM insulated wall-panel model.',
  },
]

export const ROUTES = {
  home: '/',
  contact: '/contact',
} as const
