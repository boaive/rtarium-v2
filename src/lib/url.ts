/** the site's own address: canonicals and analytics name every page by it */
export const SITE_URL = 'https://rtarium.com'

/**
 * A page's address as the server serves it: every page is a folder with its own index.html, and the server redirects
 * `/contact` to `/contact/`. Links, canonicals and analytics all use this one form; routes themselves are matched
 * without the slash. `/contact#form` → `/contact/#form`; `/`, `#x`, files and other sites as given.
 */
export function withSlash(to: string) {
  if (!to.startsWith('/') || to.startsWith('//')) return to
  const cut = to.search(/[?#]/)
  const pathname = cut < 0 ? to : to.slice(0, cut)
  const rest = cut < 0 ? '' : to.slice(cut)
  if (pathname.endsWith('/') || /\.[a-z0-9]+$/i.test(pathname)) return to
  return `${pathname}/${rest}`
}
