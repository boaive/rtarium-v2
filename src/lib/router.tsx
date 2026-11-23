import { createContext, useCallback, useContext, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { scrollToY } from './scroll'

/**
 * A minimal path router: the homepage and a few planned destination pages. In-page links
 * (`/#tech`) scroll to their chapter, from any page.
 */
const RouterContext = createContext<{ path: string; go: (to: string) => void }>({ path: '/', go: () => {} })

const SITE_URL = 'https://rtarium.com'

/**
 * A page's address as the server serves it: every page is a folder with its own index.html, and the server redirects
 * `/contact` to `/contact/`. Links point straight at the served address (no redirect hop, one URL per page for search);
 * routes themselves are matched without the slash. `/contact#form` → `/contact/#form`; `/`, `#x` and other sites as given.
 */
export function withSlash(to: string) {
  if (!to.startsWith('/') || to.startsWith('//')) return to
  const cut = to.search(/[?#]/)
  const pathname = cut < 0 ? to : to.slice(0, cut)
  const rest = cut < 0 ? '' : to.slice(cut)
  if (pathname.endsWith('/') || /\.[a-z0-9]+$/i.test(pathname)) return to
  return `${pathname}/${rest}`
}

/** the head's canonical and og:url follow the page (pre-rendered per route by scripts/prerender.mjs; kept in step here) */
function syncCanonical(path: string) {
  const url = SITE_URL + withSlash(path)
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', url)
  document.querySelector('meta[property="og:url"]')?.setAttribute('content', url)
}

function scrollToHash(hash: string) {
  const id = hash.replace('#', '')
  if (!id) return scrollToY(0)
  const el = document.getElementById(id)
  if (!el) return
  scrollToY(el.getBoundingClientRect().top + window.scrollY)
}

export function Router({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => window.location.pathname.replace(/\/+$/, '') || '/')

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname.replace(/\/+$/, '') || '/')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => syncCanonical(path), [path])

  const go = useCallback(
    (to: string) => {
      const url = new URL(to, window.location.origin)
      const next = url.pathname.replace(/\/+$/, '') || '/'
      if (next === path) {
        if (url.hash) {
          history.replaceState(null, '', url.hash)
          scrollToHash(url.hash)
        } else scrollToY(0)
        return
      }
      history.pushState(null, '', withSlash(url.pathname) + url.hash)
      setPath(next)
      // the new page renders first, then lands on its chapter (or its top)
      requestAnimationFrame(() => requestAnimationFrame(() => (url.hash ? scrollToHash(url.hash) : scrollToY(0, true))))
    },
    [path],
  )

  return <RouterContext.Provider value={{ path, go }}>{children}</RouterContext.Provider>
}

export const useRoute = () => useContext(RouterContext)

export function Link({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { go } = useRoute()
  return (
    <a
      href={withSlash(to)}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        go(to)
      }}
      {...rest}
    />
  )
}
