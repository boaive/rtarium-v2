# RTARIUM V2 homepage

RTARIUM by HEMISPHERE ONE. React 19 · Vite · Three.js / React Three Fiber.

```bash
npm install
npm run dev        # http://localhost:5173 (the in-app preview uses 5180, see .claude/launch.json)
npm run build      # type-check, production build, one index.html per route in dist/
npm run preview
```

- `src/three/` holds the single fixed 3D stage (`Stage.tsx`, `StageScene.tsx`), its poses (`poses.ts`) and the mesh
  model code ported from V1 (`mesh/`). Sections borrow the stage with `useStageRegion`.
- Every technical figure is in `src/content/technical.ts`; site map, applications and contact settings in
  `src/content/site.ts`.
- `?review` in the address shows the open questions beside flagged figures.
- `assets/` holds the client's originals (not served). `PRODUCT.md` records product truth for design work;
  `docs/V2-IMPLEMENTATION-REPORT.md` is the build report and the list of client decisions.
