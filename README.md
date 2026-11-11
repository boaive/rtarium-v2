# RTARIUM V2 homepage

RTARIUM by HEMISPHERE ONE. React 19 · Vite · Three.js / React Three Fiber.

```bash
npm install
npm run dev        # http://localhost:5173 (the in-app preview uses 5180, see .claude/launch.json)
npm run build      # type-check (site and Worker), production build, one index.html per route in dist/
npm run preview
npm run deploy     # build, then deploy to Cloudflare (npx wrangler login first)
```

## Hosting: Cloudflare Workers

One Worker, `rtarium` (`wrangler.jsonc`, code in `worker/`), serves everything:

- **The site**: the built `dist/` as static assets. Only `/api/*` runs Worker code first.
- **`POST /api/contact`** (`worker/contact.ts`): rate limit per IP, the same field checks as the form, Cloudflare
  Turnstile, then ONE database transaction saving the enquiry and its two email jobs (AWS RDS PostgreSQL through
  Hyperdrive). The visitor sees "sent" only after that commits. The jobs then go on the `rtarium-email` queue.
- **The queue consumer** (`worker/mailer.ts`): sends each job through Cloudflare Email Service and records it in
  `email_outbox`; failures retry with backoff, then the dead-letter queue `rtarium-email-dlq`, and the job is marked
  `failed`. Each job row is locked while it sends, so an email is never sent twice by two deliveries.
- **Every 5 minutes** (cron): jobs stuck `pending`/`queued` for 10 minutes go back on the queue.

The two emails (`worker/emails.ts`):

| | Client notification | Visitor confirmation |
|---|---|---|
| From | `RTARIUM Enquiries <enquiries@rtarium.com>` | `RTARIUM <enquiries@rtarium.com>` |
| To | `info@rtarium.com` (fixed in the binding) | the visitor's address |
| Reply-To | the visitor | `info@rtarium.com` |
| Subject | `New Product Enquiry – {name}` | `We've Received Your Enquiry – RTARIUM` |

The confirmation does not repeat the visitor's message, so the form cannot be used to mail arbitrary text to someone.

**Secret** (once): `npx wrangler secret put TURNSTILE_SECRET_KEY`. Nothing else secret is in the repo: the database
password lives in the Hyperdrive configuration.

**Developing the API locally**: `npm run build`, then `npx wrangler dev` (port 8787; `npm run dev` proxies `/api` to it).
Hyperdrive needs a local connection string for that: set `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.
Put `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` (Cloudflare's always-pass test secret) in `.dev.vars`;
in development the form uses the matching test site key.

**Checking emails**: `select ref, kind, status, attempts, last_error from email_outbox join enquiries e on e.id = enquiry_id order by e.created_at desc;`

- `src/three/` holds the single fixed 3D stage (`Stage.tsx`, `StageScene.tsx`), its poses (`poses.ts`) and the mesh
  model code ported from V1 (`mesh/`). Sections borrow the stage with `useStageRegion`.
- Every technical figure is in `src/content/technical.ts`; site map, applications and contact settings in
  `src/content/site.ts`.
- `src/facade/` holds the Façade & Cladding pages as one lazy chunk: the overview (`pages/Overview.tsx`,
  `Lineage.tsx`), the Unitized page (sections in `unitized/`, its 3D in `three/unit/`, styles in `unitized.css`),
  the Rainscreen page (sections in `rainscreen/`, its 3D in `three/rain/`, styles in `rainscreen.css`) and Stud Frame. Each section has its own canvas (`three/Stage3D.tsx`).
- `src/flooring/` holds the Advanced Flooring pages as one lazy chunk, the same way: the overview
  (`pages/Overview.tsx`) and one file per application, each a placeholder until it is built:
  `/advanced-flooring/data-ai-centres` (`pages/DataCentres.tsx`), `/advanced-flooring/automated-warehouse`
  (`pages/AutomatedWarehouse.tsx`), `/advanced-flooring/semiconductor-plant` (`pages/SemiconductorPlant.tsx`).
  Their titles and paths are in `flooring/content.ts`, which the nav reads; a new path also goes in `scripts/write-routes.mjs`.
- `GPU=1 node scripts/dev-shoot.mjs shots.json` takes headless Edge screenshots of the 3D pages (the in-app preview
  pauses animation frames); the owner's screen is about 1270 × 713 CSS px (1920 × 1200 at 150 %).
- `?review` in the address shows the open questions beside flagged figures.
- `assets/` holds the client's originals (not served). `PRODUCT.md` records product truth for design work;
  `docs/V2-IMPLEMENTATION-REPORT.md` is the build report and the list of client decisions.
