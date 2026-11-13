# Image replacement report — 13 November 2026

Source: `C:/Users/jana/Downloads/RTARIUM-Image-Suggestions.pdf` and the supplied files in `assets/RTARIUM CLIPS/RTARIUM/`.

19 of the 33 mapped placements updated. The remaining 14 keep their current media according to the owner's follow-up. These changes are local; no production deployment was performed.

| Code | Placement | Result |
| --- | --- | --- |
| H1 | Home / In concrete | Supplied H1.MP4; full shot, silent loop, centre-framed at 16:9, desktop/mobile encodes and matching poster. |
| H2 | Home / Façade & Cladding | Still rendered from the existing façade HeroPanel. |
| H3 | Home / Advanced Flooring | Still rendered from the existing FloorSample. |
| H4 | Home / Wall Panels | Still rendered from the existing PanelPiece in its insulated, separated-layers state. |
| F1 | Façade / Steel bar | F1.jpg; described by the team as royalty-free. |
| F2 | Façade / GFRC / GRC | F2.png; team-supplied generated image. |
| F3 | Façade / UHPC | F3.png; team-supplied generated image. |
| F4 | Façade / RTARIUM | Existing mesh-stack photo colour-graded for clearer bronze mesh and neutral tones. |
| U1 | Unitized / The mould | U1.JPG. |
| U2 | Unitized / Face coat | U2.JPG retouched: neutral balance, exposure and texture clarity, subdued background. |
| U3 | Unitized / RTARIUM | U3.JPG. |
| U4 | Unitized / Backing | U4.JPG retouched: reduced yellow cast, lifted shadows, clearer backing coat and spray. |
| U5 | Unitized / In-built ferrule inserts | U5.JPG. |
| L1 | Flooring / The oldest problem | L1.jpg. |
| L2 | Flooring / A 3D basalt mesh | L2.JPG. |
| L3 | Flooring / Use the premix | Updated in the 13 Nov follow-up: professional 4:3 view derived from the supplied on-site mesh image. Uses the same diagonal photo reveal and corner readout as L1 and L2. |
| D1 | Data & AI / Pour the screed | Unchanged: mapped video absent from supplied folder; owner confirmed keep current. |
| D2 | Data & AI / Power trowel | Unchanged: mapped video absent from supplied folder; owner confirmed keep current. |
| D3 | Data & AI / Developer & Owner | Unchanged as specified in the PDF. |
| D4 | Data & AI / General Contractor | Unchanged: mapped slump photo absent from supplied folder; owner confirmed keep current. |
| W1 | Warehouse / Pump the screed | Unchanged: mapped video absent from supplied folder; owner confirmed keep current. |
| W2 | Warehouse / Logistics Developer & Owner | Unchanged as specified in the PDF. |
| W3 | Warehouse / Concrete Flooring Contractor | Unchanged: mapped video absent from supplied folder; owner confirmed keep current. |
| S1 | Semiconductor / Pump the screed | Unchanged: mapped video absent from supplied folder; owner confirmed keep current. |
| S2 | Semiconductor / Developer & Facility Owner | Unchanged: no replacement specified; owner confirmed keep current. |
| S3 | Semiconductor / Specialized Sub-Contractor | Unchanged: no replacement specified; owner confirmed keep current. |
| P1 | Wall panels / Concrete muscle | P1.JPG. |
| P2 | Wall panels / Prevent corrosion | P2.JPG. |
| P3 | Wall panels / Affordable housing case study | Unchanged: no replacement specified; owner confirmed keep current. |
| P4 | Wall panels / Industrial building case study | Unchanged: no replacement specified; owner confirmed keep current. |
| P5 | Wall panels / RC frame case study | Unchanged: no replacement specified; owner confirmed keep current. |
| P6 | Wall panels / Steel portal case study | Unchanged: no replacement specified; owner confirmed keep current. |
| C1 | Contact / Headline background | C1.JPG. |

Original supplied files are preserved. Served images are in `public/img/client/`, named by PDF code. H1 is in `public/video/client/`. The upright orientation of the source JPGs is baked into their web copies. Home cards use separate 4:3 mobile stills to retain the complete models.

Retouched masters are in `assets/RTARIUM CLIPS/retouched/`; rendered masters are in `assets/RTARIUM CLIPS/renders/`. Those folders inherit the repository's existing exclusion of client originals from Git. Web assets are tracked normally. `scripts/prepare-client-images.mjs` prepares web images with Sharp; `scripts/prepare-client-video.mjs` prepares H1 with FFmpeg. The development-only `scripts/media-render.html` reuses the production model components to render the home stills; it is not included in the production site.

The three photographic retouches used the built-in image editing tool, with the exact prompts recorded in `docs/IMAGE-EDIT-PROMPTS.md`. No CLI image generation was used. F2/F3 came from the team; H2/H3/H4 came from the site's model code.

Validation: production build and TypeScript checks passed. The six affected pages were checked at 1440×900 and 390×844: all mapped images decoded successfully, no horizontal overflow, no page exceptions or failed local requests. Screenshots were inspected for orientation, crop, image clarity and text overlap. H1 desktop play/pause, mobile autoplay and reduced-motion poster behaviour were checked separately. Review screenshots are saved in `out/image-review/`.
