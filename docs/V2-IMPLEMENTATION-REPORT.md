# RTARIUM V2 homepage: implementation report

Second build, October 2026, after the owner's review of the first. Project: `D:\float you thrive\rtarium v2`
(separate from V1 at `D:\float you thrive\Rtarium`, which is read but never modified).

## 1. What changed and why

The first build kept V1's layout and a black-led palette, scrolled through long scenes and carried too much text.
The owner's direction, with eleven reference screenshots (EnduroSat space-service, Enerblock, Buttermax and a
concept board): yellow as the majority colour, the site opening on yellow, warm white instead of white, every
screen full and saying one thing, very little text, time-based motion instead of scroll-scrubbed motion, a hero that
is the most attractive screen, and Innovation and Tech Space reworked. Everything from the hero down was rebuilt.

What makes the references premium, and how it is applied:

| Reference | Principle | Here |
|---|---|---|
| EnduroSat | One full-screen scene per message, giant type, one 3D object, the next scene plays on its own once reached, a segmented step indicator at the bottom | Every step is one screen and a snap point; reaching it starts a timed sequence; progress chips per chapter that fill while the step plays |
| EnduroSat | Statements that light up word by word | "The challenge" step |
| Buttermax | Yellow ground, the name set huge, a 3D object in front of it | The opening: RTARIUM at full width under the 3D layer, the mesh tile drops in front and bounces |
| Enerblock | Hard colour fields, black on brand colour, giant wordmark footer, clean technical hierarchy | Yellow / black / warm-white grounds that change in time; footer with the name at full width; readouts and tables |
| Concept board | Gold-lit dark mesh, callout labels, "three elements" exploded system, big figures | Silver-under-gold mesh on black, pinned labels, exploded concrete–mesh–concrete, count-up figures |

## 2. The homepage, step by step (15 full screens)

| # | Chapter | Ground | Step | What moves (in time) |
|---|---|---|---|---|
| 0 | Opening | yellow | RTARIUM, "Reinforcement with depth" | Letters rise; the tile drops and bounces; the cursor presses the mesh and it springs back (V1 press field); a press knocks it |
| 1 | About | yellow | A mesh with a third dimension | Camera swings to the edge; labels pin to upper face, connecting fibres, lower face |
| 2 | About | yellow | Woven from volcanic rock | Macro of the rovings; rock → melted → filaments → mesh light up in turn |
| 3 | About | black | Concrete flows in. And locks it. | Real mortar footage fills the screen |
| 4 | Why | black | The challenge | The statement lights up word by word |
| 5 | Why | yellow | What RTARIUM replaces | Steel fibre, AR-glass fibre, flat 2D mesh are struck through; the RTARIUM answer arrives |
| 6 | Innovation | yellow | Reinforced through its depth | X, Y, Z arrows grow one after another; fibres lit |
| 7 | Innovation | yellow | No plane to split along | A flat mesh lies on its own plane, then RTARIUM's second face and fibres grow across it; toggle to compare |
| 8 | Innovation | black | No coating to wear off | Gold-lit macro of the basalt |
| 9 | Tech Space | black | Three elements. One system. | Concrete, mesh, concrete pulled apart with labels; jump to Mesh / Yarn / Concrete |
| 10 | Tech Space | black | Mesh | Six readouts count up round the model; the model steps through 3 / 6 / 10 / 15 mm with a live dimension; "All figures" sheet |
| 11 | Tech Space | black | Yarn | 2.62 GPa counts up; bars race against steel, aluminium, titanium, carbon fibre |
| 12 | Tech Space | black | Concrete | +77 % counts up; steel fibre vs RTARIUM bars; the mesh cast in concrete by x-ray |
| 13 | Applications | warm white | Built into three applications | Three full-height photo panels |
| 14 | Footer | yellow | Bring us the floor, façade or wall | The name at full width |

## 3. Implementation

- One fixed coloured ground (changes colour in 0.9 s) under one fixed transparent WebGL canvas under the copy. The
  canvas renders one 18 × 18 cell tile of V1's Blender mesh and glides between poses in spherical camera terms.
- `src/components/Chapter.tsx`: the scene engine (steps, snap markers, timed reveals, count-ups, word highlights).
- `src/three/StageScene.tsx` / `poses.ts`: poses, the drop-and-bounce spring, the V1 press field, ink / silver /
  x-ray looks, concrete slabs, axes, shear plane, thickness dimension.
- CSS scroll snap (mandatory on desktop, proximity on touch): the wheel is never captured.
- Reduced motion: no drop, sway or glide; sequences show their end state.

(Validation, critique results and open items follow below.)

## 4. Second review (late October 2026)

The owner's second review, with Enerblock, EnduroSat and Buttermax as references, changed these things. Where it
conflicts with sections 1–3 above, this section wins (PRODUCT.md records the same direction).

| Feedback | What was done | Where |
|---|---|---|
| The mesh must not be black; it should be its own colour | One basalt look on every ground: bronze-brown rovings, darker connecting fibres (from the production shoot). The "ink" and "silver" looks are gone | `three/StageScene.tsx` (LOOK), `three/poses.ts` (Look: day / night) |
| Invert the type where the mesh crosses it, without hiding the mesh | The opening name is fixed in front of the 3D in yellow with `mix-blend-mode: difference`: black on yellow, a negative of the mesh where they cross. Docked over the full-screen mesh, a black plate opens behind it so it reads yellow | `sections/Hero.tsx`, `.hero__word`, `.hero__plate` |
| RTARIUM higher, a taller standing mesh meeting it, name in front; on scroll the name shrinks to the left while the mesh is built to full screen and the camera tours between the two faces | The opening is three screens of one scrolled tour (`stage.tour`, damped against the scroll). The sheet is a 40 × 40 cell field; a build window in the shader (`uWin`) shows 14 × 22 cells standing up, then grows ring by ring (landing cells drop in from the camera side) while the camera slips between the faces | `three/poses.ts` (TOUR, tourPose), `three/mesh/yarnMaterial.ts` (uWin, uBand, uLift), `three/mesh/MeshField.tsx` (chunk culling) |
| Yellow overlays in some sections | The left-to-right and top/bottom ground gradients over the stage are removed; every pose is framed so the mesh sits where the copy is not | `styles/story.css`, `three/poses.ts` (frames, label zones) |
| Continuous, symmetrical screen changes (Enerblock) | Steps are real 100svh panels. The ground under the 3D never fades: the next screen's colour rises along that screen's top edge with the scroll and falls back the same way. Copy lags its panel slightly (`--o`) | `components/Chapter.tsx`, `three/Stage.tsx` (Ground) |
| Words one by one, moderate speed, time-based | Every heading rises word by word (85 ms apart, 95 ms for the challenge statement) once its screen holds the middle of the viewport; played screens keep their end state | `Lines`, `Statement` in `components/Chapter.tsx` |
| Innovation and Tech Space visibility: inverted colours; white type can be yellow | Headings on inverse-colour slabs (black on yellow, yellow on black). On black all type is yellow, secondary type a dimmed yellow (#bfa64a, 7.7:1) | `.lines--slab`, `.on-black`, `--on-dark-2` |
| Not everything on the left; layouts that make people read | Per screen: bottom right (Structure, footage), top band with a panorama below (Material), full-screen sentence (Challenge), top right (Depth), bottom left (Shear), ground band under a close-up (No coating), diagonal (Three elements / One system), figure right and bars left (Yarn), x-ray left and figures right (Concrete). Phones: copy on a ground panel along the bottom | `.copy--*` in `styles/story.css` |
| Tech Space mesh somewhat vertical; hovering a value shows it on the mesh | The sheet stands at about 75° and turns. Each figure is a button: thickness chips change the cell model, width draws a dimension, lengths grow the sheet through three lengths, tensile strength lights the faces, elastic modulus strikes the sheet and it springs back, elongation stretches it 3.4 %. Click or tap keeps the view for touch | `sections/TechSpace.tsx` (useInspect), `stage.inspect` |
| Footer only: a liquid of mesh that follows the cursor, inverting what is under it | A WebGL metaball drop with a trailing tail over the footer, filled with the footer yellow under `difference` (so ground and type invert); a woven two-face mesh in basalt travels with it, magnified like a lens. Runs only while the footer is on screen | `components/LiquidMesh.tsx` |

Kickers ("01 · About RTARIUM" above every heading) were removed: the progress chips already name the chapter. The
header's parts sit on chips of the current ground so they stay legible over the mesh, the footage and the liquid.

Reduced motion: the tour stops at the built mesh (no fly-through), words and slabs appear at once, the liquid does
not wobble. Verified with the headless Edge shooter (`GPU=1 node scripts/dev-shoot.mjs`) at 1440 × 900 and 390 × 844.

## 5. Critique fixes and third review (late October 2026)

An Impeccable critique (design review and detector, run as two isolated assessments) scored the second-review
build 22/36 and found three P1 problems; the owner chose all five fixes, and mid-pass sent a reference image for the
opening plus two corrections. This section supersedes the opening and footer rows of section 4.

| Item | What was done | Where |
|---|---|---|
| The 3D lagged behind its panel (P1) | Every screen in the viewport draws its own view of the mesh, scissored to the panel's visible part, with its own camera and look; the view is framed from the panel's top, so it rises with the panel exactly as the ground does. A view eases in and turns slightly as its panel passes (symmetrical). Copy no longer fades; fog takes the panel's own ground | `three/StageScene.tsx` (views), `.scene__inner` |
| The opening (owner's reference) | "Meet RTARIUM." left; a 12 × 34-cell strip lying on the ground, receding to the upper right, with a shadow (a shadow-catcher plane and a lower key light) and callouts on leader lines. On scroll the headline drifts into the mesh and dissolves line by line (`--p`), the mesh builds to full screen, the camera goes down between the faces | `sections/Hero.tsx`, `three/poses.ts` (hero, TOUR), `StageLabel callout` |
| Inversion looked wrong | No `mix-blend-mode` anywhere. Text over the mesh sits on slabs or on clear ground; the docked name was removed (the owner chose "dissolve into the mesh") | — |
| Footer mesh | The stage renders a tileable top-down swatch of the real mesh once and hands it to the footer's WebGL drop; the drop is a small soft square that lags, stretches with its motion, wobbles and trails two merging droplets. The footer's yellow-on-black copy is clipped to the drop (`clip-path`), so its colours are exact | `components/LiquidMesh.tsx`, `components/Footer.tsx` |
| Phones (P1) | Yarn figures keep their titles; the Tech Space hint and the +77 % caveat stay; copy on ground panels; only the callout above the strip shows | `styles/story.css` (compact block) |
| Tech Space (P2) | Every figure says what it does to the mesh at rest (marker + line), lit on hover; slab headings on all four screens ("Three elements." / "One system.", "The sheet.", "The yarn.", "The concrete."); warmer night light; Yarn shows one ribbon of the mesh beside the figures; Concrete shows the mesh in bronze through translucent concrete; every measurement in Archivo tabular figures (IBM Plex Mono removed) | `sections/TechSpace.tsx`, `three/poses.ts` (roving, xray) |
| Chrome (P2) | Progress steps are inverse-colour slabs whose label is always in full contrast, with a rule that fills along the foot; Applications numbers on a plate; chip borders at 8:1; the strike runs through the name only; unlit making-stations at 7:1; footer legal at a 29rem measure; menu overlay in yellow; deeper ground behind the footage copy; without WebGL each mesh screen shows a still | `styles/shell.css`, `styles/story.css`, `components/Chapter.tsx` (STILLS) |

Detector after the pass: source scan clean; URL scan reports the intended word-by-word gating
(`content-hidden-at-rest`) and one stale-ground reading on the Yarn bar labels (8.4:1 on their real black ground).

## 6. Fourth review (25 October 2026)

The owner's fourth review, with EnduroSat (continuous movement, minimalism) and Enerblock (scroll motion) as
references. Where it conflicts with the sections above, this section wins (PRODUCT.md records the same direction).

| Feedback | What was done | Where |
|---|---|---|
| Logos hidden on yellow | The RTARIUM emblem and half the HEMISPHERE ONE disc are yellow: both logos now sit in full colour on a black capsule on every ground (a yellow hairline keeps its edge on black) | `components/Nav.tsx`, `.nav__home` |
| "Meet RTARIUM" bigger, another face, "Meet" smaller | The name in Anybody at 150 % width, 860 weight (also the footer's name); "Meet" in the same face, narrow and light, about a third of the size | `.hero__title`, `--font-name`, `@fontsource-variable/anybody` |
| Basalt yarn callout hidden; mesh wider, shorter, isolated; show the offset | An 18 × 12-cell piece hovering 3 cm over its own shadow, tilted 11°, seen from 52° so the two offset faces and their lattice shadow read; callouts re-aimed onto clear ground, each with a plate of ground behind its words | `three/poses.ts` (hero, lift, tilt), `StageScene.tsx`, `.pin__words` |
| Explore looks common | A square black slab with an arrow cell; on hover yellow runs back over it and the arrow steps on | `.explore` |
| Cavity markings | Notes in a column with level leaders to three points on one vertical, the depth between the faces dimensioned (10 mm) | `StageLabel column / span`, `.pin--column`, `.pin--span` |
| Transition out of the animation | The tour runs on along the cavity into white light (fog and ground wash to warm white), and out of the white a tile of mesh with concrete rising to its mid-plane: "Concrete, better than ever." Then the page scrolls on | `poses.ts` (tourKeys, CAST), `Ground` (wash), `Hero.tsx` |
| About, Innovation, Tech Space horizontal, one continuous mesh | `Track`: the chapter is pinned for its steps; the damped scroll carries it sideways; the next slide enters from the right edge (a hairline marks the edge) over the last, which drifts left and is covered; the ground comes in along the same edge; one view of the mesh is scrubbed between the steps' poses (`blendPose`), so it never cuts. Each step stays a snap point | `components/Chapter.tsx` (Track), `three/poses.ts` (blendPose), `Region.blend` |
| Depth mesh smaller | A 12 × 12 piece further off, space round it | `poses.ts` (depth, shear) |
| Tech Space text too big, collides with the header | Display sizes follow the viewport height as well as its width; every screen's copy keeps a fixed margin under the header and above the step chips | `--t-display`, `--t-figure`, `.scene --top / --bottom` |
| Yarn: less wording, another arrangement | One figure, two small figures, and one scale from 0 to 3,500 MPa with every material a tick on it and RTARIUM's mark running out to 2,620 | `TechSpace.tsx` (YarnStep), `.yarn`, `.scale` |
| Footer liquid and mesh | A spring holds the drop to the cursor (it overshoots and settles), it turns to its motion and stretches keeping its area, changes of pace ring three edge modes, four droplets trail on short links and merge back, the edge catches the light; inside, the symmetrical diamond lattice of doubled lines from the owner's sketch, shaded as rovings, the lower face sliding against the upper as it moves. At rest it waits, breathing, on the open ground | `components/LiquidMesh.tsx` |

Verified with the headless Edge shooter at 1440 × 900, 1536 × 864 and 390 × 844; `npm run build` passes.

## 7. Fifth review (25 October 2026)

| Feedback | What was done | Where |
|---|---|---|
| Hero mesh touches the M | The piece is framed lower and further right (same size) | `poses.ts` (hero frame) |
| Cursor hollow on "Two basalt faces, woven as one." | The press field (V1's) now runs on the built mesh too, with a wider footprint and almost no glow, so it reads as a hollow that springs back | `tourPose` (press), `StageScene.tsx` |
| Zoom from the cast into the next section | The tour runs one screen further (0..4): the slab falls away, the camera goes in close to the yarns and comes out exactly as About's first view while the white washes back to yellow. Until it gets there the opening holds the whole screen and About does not draw; then About takes over from the same pose | `poses.ts` (tourKeys 3.5, 4; tourWash), `StageScene.tsx` (handing), `Hero.tsx` |
| Material to In concrete looked odd (footage) | "In concrete" is now a 3D step on yellow: the mesh carries on from the rovings, wet mortar flows in across it from the far side (a slab through the cavity cut at a wavering, glossy front), then the footage opens in a box top right; copy bottom left | `poses.ts` (pour), `StageScene.tsx` (mortar), `About.tsx`, `.pourfilm` |
| What it replaces, one thing at a time (Enerblock layout) | A pinned stack of rows (number, drawing, name, weakness, one line). Each scroll opens the next row while the last folds into a bar at the top with its name struck through; RTARIUM opens last, on black, with the production photo of the mesh in profile. Steel fibre, AR-glass fibre and flat mesh are line drawings that draw themselves | `Why.tsx` (Replaces), `.stack`, `.row` |
| Footer liquid like the reference | The drop is a cushion of the mesh lattice with no fill: it bulges and is lit as a pillow, the lower face slides against the upper where it tilts, it swells and pinches its sides moving fast, twists when it turns and unwinds, ripples, trails two droplets and casts a soft shadow. The inverted copy is gone. On narrow screens it shows only while touched | `components/LiquidMesh.tsx`, `components/Footer.tsx` |

Verified with the headless Edge shooter at 1440 × 900, 1536 × 864 and 390 × 844; `npm run build` passes.

## 8. Sixth review (25 October 2026)

| Feedback | What was done | Where |
|---|---|---|
| Concrete in Structure, Innovation and the Tech Space sheet (a bug) | The blended pose of the sideways chapters is one shared object; the mortar switch added in the fifth review was never cleared, so it carried into every chapter after "In concrete". The blend now clears the object before each use; slabs on a sideways chapter also fade a third of the way to the next step | `poses.ts` (blendPose), `StageScene.tsx` |
| Scroll pulled back; should feel smooth | CSS scroll snapping removed; the wheel glides (Lenis 1.3.23, pinned); touch keeps native momentum; reduced motion keeps the browser's own scrolling. Every scroll the site starts goes through `scrollToY`; the menu holds the page; the figures sheet scrolls on its own | `lib/scroll.ts`, `main.tsx`, `router.tsx`, `Chapter.tsx`, `Nav.tsx` |
| Hero mesh a little lower | Framed 2.5 % lower; on phones it stands further back | `poses.ts` (hero) |
| "In concrete" in three movements, per the owner's reference | Mesh to the left (copy top right, footage bottom right); mortar flows in; the camera stands back to the cast panel (`POUR_OUT`) as the copy moves top left and the footage top right, and three numbered notes appear on leader lines | `poses.ts` (pour, POUR_OUT), `StageScene.tsx`, `About.tsx`, `.copy--pour`, `.pourfilm`, `.pin--note` |
| What it replaces: no visuals, slim, white | Rows of number, struck name, weakness and one line; an open row is about a quarter of the screen; warm-white ground; RTARIUM opens last on black | `Why.tsx`, `.stack`, `.row` |
| Footer: 3D mesh, no border, yellow turning black | A black liquid pool (spring, stretch, ripples, droplets) with the footer's yellow copy clipped to its outline, carrying a three.js piece of mesh: two faces and connecting fibres cut to a ragged outline, yarns of uneven length; it cups, opens a saddle along its motion, twists when it turns and ripples at speed. three.js loads for it only when the footer is first on screen | `components/LiquidMesh.tsx`, `three/footerMesh.ts`, `Footer.tsx` |

Verified with the headless Edge shooter at 1440 × 900, 1536 × 864 and 390 × 844; `npm run build` passes.

## 9. Seventh review (25 October 2026)

| Feedback | What was done | Where |
|---|---|---|
| Material to In concrete: mesh on the left as in Structure and Material; text and footage on one line; block too far right; leader lines too long | The first movement holds the mesh close, as in Structure and Material, filling the left with its cut edge clear of the right; the copy and the footage share one column on the right (same width, same edge). Standing back, the cast block lands a little left of the middle; its notes stand in the footage's column (`columnAt`), on short leaders from the block's near end | `poses.ts` (pour, POUR_OUT, pour anchors), `Stage.tsx` (StageLabel columnAt), `StageScene.tsx`, `.scene--flow --col` |
| Footer: use the actual mesh; it bends and stretches, and comes back to normal at rest | The footer piece is now the real RTARIUM cell (the Blender model and yarn material of the stage), instanced into a piece cut to an irregular, stepped outline. The bend (saddle, cup, twist, ripple) and a stretch along the motion all come from the motion and ease back out: at rest it lies flat | `three/footerMesh.ts`, `components/LiquidMesh.tsx` |

Verified with the headless Edge shooter at 1440 × 900 and 1536 × 864; `npm run build` passes.

## 10. Eighth review (25 October 2026)

| Feedback | What was done | Where |
|---|---|---|
| In concrete notes on the left, placed properly, no collisions, aligned | The notes stand on the left under the copy, their words starting on the copy's own line (`columnAt` now measures the element and puts the words on its left edge, the leader leaving on the side the point is on). The block turns a little (azimuth −20°) so its near edge runs steeply, the points sit evenly along it (about 90 px apart), and the leaders are short. Each note is one line; the heading stays on two lines at every width (column min(32rem, 33vw), heading up to 3.6rem). Checked at 1280, 1440, 1536 and 1920 wide | `poses.ts` (POUR_OUT, pour anchors), `StageScene.tsx`, `About.tsx` (NOTES), `.scene--flow`, `.note` |
| In concrete: the block a little to the left, nothing else changed | The stood-back framing moves from 0.49 to 0.46 of the width; the notes keep their line and get shorter leaders | `poses.ts` (POUR_OUT frame) |
| Scroll: no holding point; smooth, keeps the visitor in place, never pulls back | Every screen and step is a holding point (hero screens, chapter steps, track and stack steps, applications, footer). When the visitor stops (150 ms still, finger lifted), the page glides onto the next point in the direction they were going; a nudge under 3.5 % of the screen returns to where it was. Their next wheel, key or touch takes over at once. Off on reduced motion and while the menu or the figures sheet is open | `lib/scroll.ts` |

Holding verified with real wheel input in the headless shooter (new `wheel` action): a short scroll down lands on the next screen (900), a short scroll up on the one before (0), a nudge stays put, a long throw stops at the next point after it, and in About and the replaces stack a short scroll moves exactly one step. `npm run build` passes.


## 11. Ninth review: performance pass and owner changes (26 October 2026)

| Feedback | What was done | Where |
|---|---|---|
| Footer: no mesh, only the black liquid; it shows only while the cursor moves; not a circle | The three.js footer piece is gone (its own WebGL renderer, environment map, model and textures, and its lazy 52 kB chunk). The pool forms only while the cursor moves (its pace, held 90 ms between events) and drains away once it rests; nothing runs once it has drained. Its outline is always uneven: it leans into its way, a lobe wanders round one side, three edge modes keep a base unevenness and ring with every change of pace, and the droplets trail it | `components/Liquid.tsx` (was `LiquidMesh.tsx`), `Footer.tsx`, `three/footerMesh.ts` removed |
| What it replaces: the rows open in the same place; better designed, no pictures; RTARIUM bigger | A four-band ledger that always fills the screen: the open band takes the height the others leave and the scroll hands it down the ledger, band to band, both ways. To come: a quiet line; open: the weakness at full size rising from the band's foot, the name struck once reached; passed: the struck name with its weakness beside it. RTARIUM, last, on black: the struck bands close up to give it room, its name at full width in the wide cut, its three strengths in columns numbered for the compromises they answer | `Why.tsx` (Replaces), `.row` |
| Growing mesh: woven, not dropped from above | Wherever the build window grows, the new cells are woven on: each yarn runs out across its cell from the built side, upper face first, then the lower face, then the fibres between them, the tip lifting a little as it is laid. Each way across the sheet is decided on its own (growing or trimmed); trimmed back, cells lift away as before | `mesh/yarnMaterial.ts` (uWeave), `StageScene.tsx` |
| Hero more striking | The piece is about a fifth larger and seen lower (41°), so the two faces and the fibres between them read; it runs off the right edge rather than reaching the name. It is woven out from its middle as the page opens (2.1 s), settling a little onto its shadow; the callouts follow once it is complete, and keep clear of the headline and lede (or stay hidden). Phones: centred in the ground between the header and the copy | `poses.ts` (hero), `StageScene.tsx` |
| Performance | Measured per screen with GPU timer queries and draw/triangle counts (Intel Arc, 1440 × 900 at DPR 1.5). Cells outside the build window collapse in the vertex shader (no fragments); chunks of 6 cells are frustum-culled (bounds grown by the build's reach), with level of detail chosen per view; the shadow catcher covers only the ground the shadow can reach instead of a 4 m plane; hidden programs (concrete, mortar, lines, the casts' shadow pass) compile in parallel after the opening; the tour's keys are built once; each screen's rectangle is read once a frame. Triangles per frame fell 17–44 % on most views; the worst frame of a scripted scroll through the page fell from 230 ms to 32 ms | `StageScene.tsx`, `mesh/MeshField.tsx`, `mesh/yarnMaterial.ts`, `poses.ts` |
| Adaptive quality | The stage's pixel density steps down (to no less than 1) only if the device stays under two thirds of its refresh rate for most of 2.5 s, watched once the opening has played; it steps back up when there is room, and settles after six steps | `Stage.tsx` (drei PerformanceMonitor) |
| Scroll | The holding behaviour is kept (eighth review). It now waits while a mouse button is held, so dragging the scrollbar or selecting text is never pulled away | `lib/scroll.ts` |

Verified with the headless Edge shooter (GPU) at 1920 × 1080, 1440 × 900, 1366 × 768, 1280 × 720, 1024 × 768 and 390 × 844, and with reduced motion; `npm run build` passes.
