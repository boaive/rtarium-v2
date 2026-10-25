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
