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
- **`POST /api/contact`** (`worker/contact.ts`): same-site Origin only; 5 a minute per IP (per IPv6 /64); JSON of at
  most 32 KB; every field cleaned and checked by the same rules as the form (`src/content/enquiry.ts`); Cloudflare
  Turnstile (token checked for this host and the form's `contact` action); then ONE time-limited database transaction
  saving the enquiry and its email jobs (AWS RDS PostgreSQL through Hyperdrive). The same enquiry sent again within
  30 minutes gets the first one's reference back; the visitor's confirmation is skipped after 3 a day to one address
  or 40 an hour in all (the client's copy never is). The visitor sees "sent" only after the commit. The jobs then go
  on the `rtarium-email` queue.
- **The queue consumer** (`worker/mailer.ts`): sends each job through Cloudflare Email Service (30 s limit) and records
  it in `email_outbox`; failures retry with backoff, then the job is marked `failed` and an alert goes out. A client
  copy refused outright is sent once more without the visitor as Reply-To. Each job row is locked while it sends.
- **Every 5 minutes** (cron): jobs stuck `pending`/`queued` for 10 minutes go back on the queue. **On the hour**: an
  alert if emails have waited over 30 minutes or the database does not answer.
- **Alerts** (`worker/alert.ts`): always `[ALERT] …` in the Worker logs; also posted to `ALERT_WEBHOOK_URL` (Slack,
  Google Chat, Discord or Telegram webhook) when that secret is set. One per problem per 15 minutes.
- **Security headers**: `scripts/write-headers.mjs` writes `dist/_headers` at build (CSP with the inline script's hash,
  no framing, nosniff, HSTS, …). The API sets its own in `worker/http.ts`.
- **Database**: `db/schema.sql` is the tables, rules and indexes the Worker expects (safe to re-run; on the live
  database it only adds the missing indexes). `db/app-role.sql` makes `rtarium_app`, a user that can only read and add
  enquiries and read, add and update email jobs: point Hyperdrive at it, not at the admin user.

The two emails (`worker/emails.ts`):

| | Client notification | Visitor confirmation |
|---|---|---|
| From | `RTARIUM Enquiries <enquiries@rtarium.com>` | `RTARIUM <enquiries@rtarium.com>` |
| To | `info@rtarium.com` (fixed in the binding) | the visitor's address |
| Reply-To | the visitor | `info@rtarium.com` |
| Subject | `New Product Enquiry – {name}` | `We've Received Your Enquiry – RTARIUM` |

The confirmation does not repeat the visitor's message, so the form cannot be used to mail arbitrary text to someone.

**Secrets** (once): `npx wrangler secret put TURNSTILE_SECRET_KEY`, and `npx wrangler secret put ALERT_WEBHOOK_URL`.
Nothing secret is in the repo: the database password lives in the Hyperdrive configuration. A Turnstile *test*
secret is refused on any host but localhost.

**Developing the API locally**: `npm run build`, then `npx wrangler dev` (port 8787; `npm run dev` proxies `/api` to it).
Hyperdrive needs a local connection string for that: set `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.
Put `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` (Cloudflare's always-pass test secret) in `.dev.vars`;
in development the form uses the matching test site key. To test the built site under `wrangler dev`, build it with
`VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA` (and rebuild without it before deploying). Locally, emails are written
to `.wrangler/tmp/email/`, and `/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*` runs the cron.

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
