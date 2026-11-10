import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The contact form's endpoint while developing: POST /api/contact runs the same code the Vercel function does
 * (server/enquiry.ts), with the settings from .env.local (GMAIL_USER, GMAIL_APP_PASSWORD, CONTACT_TO).
 */
function contactApi(): Plugin {
  return {
    name: 'contact-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      server.middlewares.use('/api/contact', async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return send(405, { ok: false, error: 'POST only.' })
        let raw = ''
        for await (const chunk of req) raw += chunk
        let body: unknown = null
        try {
          body = JSON.parse(raw)
        } catch {
          return send(400, { ok: false, error: 'Not JSON.' })
        }
        try {
          const { handleEnquiry } = await server.ssrLoadModule('/server/enquiry.ts')
          const out = await handleEnquiry(body, { ...process.env, ...env })
          send(out.status, out.body)
        } catch (err) {
          console.error('[contact]', err)
          send(500, { ok: false, error: 'Something went wrong.' })
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), contactApi()],
  server: {
    watch: {
      ignored: ['**/out/**', '**/.git/**', '**/rtarium-film/**', '**/rtarium-unitized/**'],
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
})
