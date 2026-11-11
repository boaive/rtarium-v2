import { useEffect, useRef, type RefObject } from 'react'

/**
 * Cloudflare Turnstile, the contact form's check that a person is sending it. In "managed" mode most visitors see only a
 * small box that ticks itself; a few are asked to click it. The token it gives is checked by the server
 * (worker/contact.ts) and is good for one use, so after a failed send the form resets it for a fresh one.
 * Cloudflare's script is loaded only when the widget is first shown (the form's last step).
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
let loading: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SRC
      s.async = true
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load')))
      s.onerror = () => {
        loading = null
        reject(new Error('Turnstile did not load'))
      }
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
  handle,
}: {
  siteKey: string
  onToken: (token: string) => void
  onExpire: () => void
  handle?: RefObject<TurnstileHandle | null>
}) {
  const box = useRef<HTMLDivElement>(null)
  // the latest callbacks, without re-rendering the widget when they change
  const cb = useRef({ onToken, onExpire })
  cb.current = { onToken, onExpire }

  useEffect(() => {
    let id: string | undefined
    let api: TurnstileApi | undefined
    let gone = false
    loadTurnstile()
      .then((ts) => {
        if (gone || !box.current) return
        api = ts
        id = ts.render(box.current, {
          sitekey: siteKey,
          theme: 'light',
          callback: (t: string) => cb.current.onToken(t),
          'expired-callback': () => cb.current.onExpire(),
          'error-callback': () => cb.current.onExpire(),
        })
        if (handle) handle.current = { reset: () => id && ts.reset(id) }
      })
      .catch(() => cb.current.onExpire())
    return () => {
      gone = true
      if (api && id) api.remove(id)
      if (handle) handle.current = null
      cb.current.onExpire()
    }
  }, [siteKey, handle])

  return <div ref={box} className="ct-verify" />
}
