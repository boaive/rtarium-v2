/** The API's answers: always JSON, never cached, never sniffed as anything else, never framed. */
export function json(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      ...headers,
    },
  })
}

/** an error's code (the mail service's E_… codes) and a short text for the log and the database */
export function errInfo(err: unknown) {
  const code = (err as { code?: unknown } | null)?.code
  const message = err instanceof Error ? err.message : String(err)
  return { code: typeof code === 'string' ? code : undefined, text: (typeof code === 'string' ? `${code}: ${message}` : message).slice(0, 1000) }
}
