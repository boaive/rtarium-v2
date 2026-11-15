import { useEffect, useRef, type RefObject } from 'react'

/**
 * Cloudflare Turnstile, the contact form's check that a person is sending it. In "managed" mode most visitors see only a
 * small box that ticks itself; a few are asked to click it. The token it gives is checked by the server
 * (worker/contact.ts), which also checks it was made for this form (action 'contact') on this site, and is good for one
 * use, so after a failed send the form resets it for a fresh one.
 * Cloudflare's script is loaded only when the widget is first shown (the form's last step). When it cannot load (a
 * blocker, a firewall, no connection) or the widget fails, `onError` says so, so the form can say what to do.
 */

type TurnstileApi = {
  render(el: HTMLElement, opts: Record<string, unknown>): string
  reset(id?: string): void
  remove(id: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
/** a script that has not arrived by then is taken as blocked */
const LOAD_TIMEOUT_MS = 15_000
let loading: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      const fail = () => {
        window.clearTimeout(timer)
        // the next try asks again
        loading = null
        reject(new Error('Turnstile did not load'))
      }
      const timer = window.setTimeout(fail, LOAD_TIMEOUT_MS)
      s.src = SRC
      s.async = true
      s.onload = () => {
        window.clearTimeout(timer)
        if (window.turnstile) resolve(window.turnstile)
        else fail()
      }
      s.onerror = fail
      document.head.appendChild(s)
    })
  }
  return loading
}

export type TurnstileHandle = { reset(): void }

export function Turnstile({
  siteKey,
  onToken,
  onExpire,
  onError,
  handle,
}: {
  siteKey: string
  onToken: (token: string) => void
  onExpire: () => void
  /** the check could not load, or failed in a way it will not get past by itself */
  onError: () => void
  handle?: RefObject<TurnstileHandle | null>
}) {
  const box = useRef<HTMLDivElement>(null)
  // the latest callbacks, without re-rendering the widget when they change
  const cb = useRef({ onToken, onExpire, onError })
  cb.current = { onToken, onExpire, onError }

  useEffect(() => {
    let id: string | undefined
    let api: TurnstileApi | undefined
    let gone = false
    const failed = () => {
      if (gone) return
      cb.current.onExpire()
      cb.current.onError()
    }
    loadTurnstile()
      .then((ts) => {
        if (gone || !box.current) return
        api = ts
        id = ts.render(box.current, {
          sitekey: siteKey,
          action: 'contact',
          theme: 'light',
          callback: (t: string) => cb.current.onToken(t),
          'expired-callback': () => cb.current.onExpire(),
          'error-callback': failed,
          'unsupported-callback': failed,
        })
        if (handle) handle.current = { reset: () => id && ts.reset(id) }
      })
      .catch(failed)
    return () => {
      gone = true
      if (api && id) api.remove(id)
      if (handle) handle.current = null
      cb.current.onExpire()
    }
  }, [siteKey, handle])

  return <div ref={box} className="ct-verify" />
}
