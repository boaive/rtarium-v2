import { createContext, useCallback, useContext, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { prefersReducedMotion } from './motion'

/**
 * A minimal path router: the homepage and a few planned destination pages. In-page links
 * (`/#tech`) scroll to their chapter, from any page.
 */
const RouterContext = createContext<{ path: string; go: (to: string) => void }>({ path: '/', go: () => {} })

function scrollToHash(hash: string) {
  const id = hash.replace('#', '')
  if (!id) return window.scrollTo({ top: 0 })
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
}

export function Router({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => window.location.pathname.replace(/\/+$/, '') || '/')

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname.replace(/\/+$/, '') || '/')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = useCallback(
    (to: string) => {
      const url = new URL(to, window.location.origin)
      const next = url.pathname.replace(/\/+$/, '') || '/'
      if (next === path) {
        if (url.hash) {
          history.replaceState(null, '', url.hash)
          scrollToHash(url.hash)
        } else window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
        return
      }
      history.pushState(null, '', url.pathname + url.hash)
      setPath(next)
      // the new page renders first, then lands on its chapter (or its top)
      requestAnimationFrame(() => requestAnimationFrame(() => (url.hash ? scrollToHash(url.hash) : window.scrollTo({ top: 0 }))))
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
      href={to}
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
