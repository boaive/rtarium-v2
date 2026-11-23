// Pre-renders every route to its own static HTML after the build (replaces write-routes.mjs). Each route's
// dist/<route>/index.html carries, before any script runs:
//   - its own <title>, meta description and self-referencing canonical (the trailing-slash address the server serves);
//   - Open Graph and Twitter card tags, with the 1200 × 630 share image;
//   - JSON-LD: the Organization (HEMISPHERE ONE) and its Brand (RTARIUM) on every page, the WebSite on the homepage,
//     breadcrumbs on every other page;
//   - its heading, copy and links inside #root, so a crawler or a link preview that runs no script reads the page.
// The app's createRoot() replaces that copy as soon as it mounts; until then it is hidden from view (html.js), never
// from a crawler. Also writes dist/sitemap.xml (robots.txt, in public/, points to it) and the app's 404 page.
// Content: scripts/seo-pages.mjs.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BRAND, NAV, PAGES, SHARE_IMAGE, SITE_URL, urlOf } from './seo-pages.mjs'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const template = readFileSync(join(dist, 'index.html'), 'utf8')
const NL = template.includes('\r\n') ? '\r\n' : '\n'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** a link on the site, at the address the server serves (trailing slash) */
const href = (path) => (path === '/' ? '/' : `${path}/`)
const titleOf = (path) => PAGES.find((p) => p.path === path)?.title

const ORG_ID = `${SITE_URL}/#organization`
const BRAND_ID = `${SITE_URL}/#brand`
/**
 * RTARIUM, HEMISPHERE ONE's brand. (No Product node: Google lists a Product with no `offers`, `review` or
 * `aggregateRating` as an invalid product snippet, and RTARIUM is sold on enquiry, with no published price. Add a Product
 * back, with real `offers`, if a price is ever published.)
 */
const brand = {
  '@type': 'Brand',
  '@id': BRAND_ID,
  name: 'RTARIUM',
  description:
    'A three-dimensional basalt spacer mesh for thin, high-performance concrete: two basalt mesh faces held apart by connecting fibres, for advanced flooring, façades and cladding, and wall panels.',
  logo: `${SITE_URL}/brand/rtarium-logo.png`,
  url: `${SITE_URL}/`,
}
const organization = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'HEMISPHERE ONE',
  url: `${SITE_URL}/`,
  logo: { '@type': 'ImageObject', url: `${SITE_URL}/brand/hemisphere-one-logo.png`, width: 900, height: 171 },
  email: 'info@rtarium.com',
  // (how a client reaches the team: the enquiry address and the contact page. No phone or address is published yet;
  // add `telephone`, `address` and `sameAs` (the LinkedIn page's address) here once they are)
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'sales',
    email: 'info@rtarium.com',
    url: `${SITE_URL}/contact/`,
    availableLanguage: ['English'],
  },
  brand: { '@id': BRAND_ID },
}

function jsonLd(page) {
  const graph = [organization, brand]
  // (the site's own name, as Google shows it above a result)
  if (page.path === '/') graph.push({ '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: 'RTARIUM', alternateName: BRAND, url: `${SITE_URL}/`, publisher: { '@id': ORG_ID } })
  if (page.path !== '/') {
    const crumbs = [{ path: '/', name: 'RTARIUM' }]
    if (page.parent) crumbs.push({ path: page.parent, name: titleOf(page.parent).split(' · ')[0] })
    crumbs.push({ path: page.path, name: page.h1 })
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: urlOf(c.path) })),
    })
  }
  // (`<` escaped so no string in it can close the script element)
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')
}

function head(page) {
  const url = urlOf(page.path)
  const image = `${SITE_URL}${SHARE_IMAGE.path}`
  return [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(BRAND)}" />`,
    `<meta property="og:locale" content="en_GB" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="${SHARE_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${SHARE_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${esc(SHARE_IMAGE.alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:image:alt" content="${esc(SHARE_IMAGE.alt)}" />`,
    `<script type="application/ld+json">${jsonLd(page)}</script>`,
  ]
    .map((l) => `    ${l}`)
    .join(NL)
}

function body(page) {
  const a = (path, label) => `<a href="${href(path)}">${esc(label)}</a>`
  const links = page.links?.length
    ? [
        page.linksTitle ? `<h2>${esc(page.linksTitle)}</h2>` : '',
        '<ul>',
        ...page.links.map((l) => `<li>${a(l.path, l.label)}${l.line ? `: ${esc(l.line)}` : ''}</li>`),
        '</ul>',
      ]
    : []
  const up = page.parent ? [`<p>${a(page.parent, `Back to ${titleOf(page.parent).split(' · ')[0]}`)}</p>`] : []
  return [
    '<div class="prerender">',
    `<header><a href="/">${esc(BRAND)}</a><nav aria-label="Main"><ul>${NAV.map((n) => `<li>${a(n.path, n.label)}</li>`).join('')}</ul></nav></header>`,
    '<main>',
    `<h1>${esc(page.h1)}</h1>`,
    ...page.body.map((p) => `<p>${esc(p)}</p>`),
    ...links,
    ...up,
    '</main>',
    `<footer><p>${esc(BRAND)} · <a href="mailto:info@rtarium.com">info@rtarium.com</a> · ${a('/contact', 'Contact')} · ${a('/privacy', 'Privacy')}</p></footer>`,
    '</div>',
  ].join('')
}

/** one route's page: the template with its own head and copy */
function render(page) {
  let html = template
  const swap = (re, to, what) => {
    if (!re.test(html)) throw new Error(`prerender: ${what} not found in dist/index.html`)
    html = html.replace(re, to)
  }
  swap(/<title>[\s\S]*?<\/title>/, `<title>${esc(page.title)}</title>`, '<title>')
  swap(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${esc(page.description)}" />`, 'meta description')
  swap(/(<meta\s+name="description"[^>]*\/>)/, `$1${NL}${head(page)}`, 'meta description')
  swap(/<div id="root"><\/div>/, `<div id="root">${body(page)}</div>`, '#root')
  // (the no-script notice would be a second heading: the page's own copy is there now)
  html = html.replace(/\s*<noscript>\s*<div[\s\S]*?<\/noscript>/, '')
  return html
}

for (const page of PAGES) {
  const out = page.path === '/' ? dist : join(dist, page.path)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'index.html'), render(page))
}

// the not-found page: the bare app, kept out of search
const notFound = template
  .replace(/<title>[\s\S]*?<\/title>/, `<title>Page not found · ${esc(BRAND)}</title>`)
  .replace(/(<meta\s+name="description"[^>]*\/>)/, `$1${NL}    <meta name="robots" content="noindex" />`)
writeFileSync(join(dist, '404.html'), notFound)

const today = new Date().toISOString().slice(0, 10)
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...PAGES.map((p) => `  <url><loc>${urlOf(p.path)}</loc><lastmod>${today}</lastmod></url>`),
  '</urlset>',
  '',
].join('\n')
writeFileSync(join(dist, 'sitemap.xml'), sitemap)

console.log(`prerender: ${PAGES.length} pages + 404.html + sitemap.xml`)
