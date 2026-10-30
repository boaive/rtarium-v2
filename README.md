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
