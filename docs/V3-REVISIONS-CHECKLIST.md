# V3 revisions checklist

Source: `V.3 RTARIUM REVISIONS.pdf` (57 pages), checked against branch `changes-v2` at commit `e623db5`, 6 November 2026.

`[x]` is done on the branch. `[ ]` is still open: it needs a decision, a sign-off, or a check.

**How this was checked**

- **Copy:** 216 text checks taken from the PDF were run against the source. 215 match. The one difference is the deliberate 100 mm (W1).
- **Seen in the browser at 1440 x 900:** Home opening and cavity tags, Rainscreen hero, Façade landing story and closing section, Flooring landing hero and layer, Wall Panels hero, story and panels, Warehouse table and failure screen.
- **From the code only:** every other design item, including the Skip button, which is present on the step bars but was not clicked.
- **Not checked:** phone layout, reduced motion, and how the timed animations feel at full speed.
- `tsc` passes. No console errors on the pages opened. The production build was not run.

---

## 1. Decisions needed first

### Sign-off: the branch goes against the PDF on purpose

The commit's report says these were kept "on the owner's word". The client's marketing team should be told, because their PDF says otherwise.

- [ ] **W1 · p.49 · Wall Panels hero says 100 mm, PDF says 80 mm.** The layers add up to 100 (7+6+2+70+2+6+7), and the client's panel sketches are for 100 mm. The older `Rtarium` site had an 80 mm panel, so the PDF's figure may be out of date. Confirm with the client.
- [ ] **H1 · p.10 · Home timeline kept, PDF says remove.** The PDF also rewrites the timeline's line of copy, so it is unclear whether the steps or the whole block should go. The new line is in.
- [x] **F1 · p.17 · Steel fibre image reworked.** No other steel fibre photo exists in the assets, so the licensed photo was cropped close and put on a neutral ground (`public/img/facade/steel-fibres.webp`). A photo from your own shoot would still be stronger.
- [ ] **W2 · pp.54-55 · Panels run for 3.4 screens, PDF says keep static with an arrow.** Clicking a table part, the larger diagram and the Six layers format are all done. Only the static request was not followed.

### Questions for the client: gaps in the PDF

- [ ] **G12 is never defined.** It is listed in the contents and referenced on pp.34 and 53, but the G comments stop at G11. Ask for the missing text.
- [ ] **p.34 · Should every section have a statement?** Flooring and Wall Panels now share Home's style, which meets p.53's "adapt to an existing style". The Façade & Cladding landing has no statement, so p.34's "every section should have this" is not met.
- [ ] **p.43 · "High-velocity delivery" has a heading and nothing under it.** Ask what was meant. The step of that name is now "Pump the screed".
- [ ] **Data sheet approval.** `public/rtarium-data-sheet.pdf` was generated from the site's own figures and did not come from the client. They should approve it before it goes live.

### Consistency: the PDF did not cover these

- [ ] **Warehouse title is still "Frame to floor."** Data & AI and Semiconductor now say "From floor to facility."
- [ ] **Warehouse and Semiconductor table titles are unchanged:** "Traditional screeds were not built for this. RTARIUM was built for this." Data & AI has new wording.
- [ ] **Old absolute claims remain,** although the PDF softened them elsewhere:
  - Warehouse closing line: "Zero interference. Zero curling." (both were dropped from its hero)
  - Semiconductor table: "Dense. Zero dust." and closing line "Zero dust."
  - Semiconductor sign-off bands: "absolute atmospheric containment", "completely eliminates", "Flawless millimetric execution", "zero risk of structural cracking"
  - Rainscreen: "Eliminates water damage", "Eliminates thermal bridging"
- [ ] **G4 · Warehouse and Semiconductor give failure two screens in a row:** the comparison table, then the failure list. Each fits one screen, but G4 says to limit failure to one scroll.
- [x] **Stud Frame kicker** "Built to breathe with the heat" is now said once.

### Small fixes

- [ ] **Data & AI build step:** the 3D label says "Mild undulations", the new copy says "slight undulations".
- [ ] **Façade landing:** the label reads "Why it is replaced" on every entry. The PDF shows "Why it was replaced" for GFRC and UHPC. The shared label is probably better, so confirm and leave it.

### Checks before release

- [ ] **Phone layout.** The report says it was not reviewed after the larger titles went in, and that heroes on Unitized, Rainscreen, Data & AI and Wall Panels had touched the 3D.
- [ ] **G5 cut text on every page, at more than one size.** Seen clean on Home, Rainscreen, Flooring landing and Wall Panels at 1440 x 900 only.
- [ ] **Skip button:** click through on every step bar.
- [ ] **Production build:** `npm run build`.
- [ ] **Merge:** `changes-v2` is one commit ahead of `main` and is not merged.

---

## 2. Site-wide comments

- [x] G1 · One anatomy format: Wall Panels uses the Six layers format
- [x] G2 · Skip on step bars, and steps stay clickable (code; see checks above)
- [x] G3 · Conventional problems on one screen: Home, Unitized, Rainscreen, Warehouse, Semiconductor
- [x] G4 · No red: colour scan of all source found none, including 3D (one-scroll point is open above)
- [ ] G5 · Cut text: see checks above
- [x] G6 · Heavier page titles
- [x] G7 · No sibling links in sub-page heroes; they stay at the page end
- [x] G8 · Instructor voice in process steps. The PDF's own Stud Frame and Unitized casting copy is descriptive, and was used as supplied
- [x] G9 · No "Back to the problem" links anywhere
- [x] G10 · "View all details" on Home and Wall Panels; Unitized spec block replaced by a "Drag to turn" nudge
- [x] G11 · Text reads left to right: Façade story, Flooring layer, Wall Panels mineral mesh
- [ ] G12 · Uniform sections: see decisions above

---

## 3. Home

- [x] p.8 Headline "Introducing RTARIUM."
- [x] p.8 Tags removed from the hero diagram
- [x] p.8 "Explore the mesh" replaced by "Talk to our team"
- [x] p.8 "An open core for concrete."
- [x] p.9 Cavity tags yellow and legible
- [x] p.9 "Concrete, better than ever." removed (its screen stays, 3D only, no words)
- [x] p.10 Third dimension sub-text
- [x] p.10 Timeline line rewritten
- [ ] p.10 Timeline removal: see H1
- [x] p.11 "Concrete flows in. The mesh is locked."
- [x] p.11 Sub-text under the heading removed
- [x] p.11 "Thin concrete traditionally relies on..."
- [x] p.12 "One mesh in place of three compromises." is a table at a glance
- [x] p.12 Banner line removed
- [x] p.13 Three-Dimensional, Monolithic, Non-Corrosive, each with new copy
- [x] p.14 Data sheet CTA, brief summary, technical detail moved into "View all details"
- [x] p.15 Applications follow the nav order
- [x] p.15 Closing CTA

## 4. Façade & Cladding landing

- [x] p.16 "mesh" used throughout the landing, not "textile"
- [x] p.16 "Concrete façades, re-engineered." and old sub-text dropped
- [x] p.16 Left-to-right reading
- [x] p.16 Nothing struck through
- [x] p.17 Better steel fibre image: see F1
- [x] p.17 Steel bar, GFRC / GRC and UHPC copy
- [x] p.18 "Replaces" summary table removed
- [x] p.18 RTARIUM entry copy

## 5. Unitized Thin Concrete Façade

- [x] p.19 Title and subtext carry more weight
- [x] p.19 Sibling links moved to the end of the page
- [x] p.19 "Built for Lightweight Strength."
- [x] p.21 Vapour barrier and insulation copy
- [x] p.22 "Hang. Seal. Join. Done."
- [x] p.22 Problem cards 1 and 2 rewritten, 3 and 4 unchanged, all on one screen
- [x] p.23 Spec block replaced by a nudge
- [x] p.23 Scroll prompt removed
- [x] p.23 "The RTARIUM Solution"
- [x] p.24 Solution cards 1 to 5 (the counter ends on "6")
- [x] p.24 "Back to the problems" removed
- [x] p.24 Inverted casting: title, intro and all four steps

## 6. Rainscreen Cladding

- [x] p.25 "Designed for Lasting Weather Protection." and sub-text
- [x] p.25 "A perfect weather-resistance barrier" appears once
- [x] p.25 Features 1 and 2
- [x] p.25 "From structure to facade."
- [x] p.26 "A concrete façade is the architect's first choice." removed
- [x] p.26 Trade-offs are one simple table
- [x] p.27 "Back to the trade-offs" removed
- [x] p.27 Benefits 1 to 6

## 7. Stud Frame Cladding

- [x] p.28 "Designed for Thermal Movement."
- [x] p.29 "Flex anchors" said once
- [x] p.30 "45°C" replaced by "Expands in the heat"
- [x] p.30 White sections removed
- [x] p.30 Daytime and night-time copy
- [x] p.31 "Cast in 5 steps. Every step happens under factory control." and steps 1 to 5
- [x] p.32 "Made in the factory." removed

## 8. Advanced Flooring landing

- [x] p.33 Title weight, sub-page links out of the hero, "Flooring, built to last."
- [x] p.34 Statement copy
- [x] p.34 "The oldest problem in flooring." and sub-text
- [x] p.35 "A 3D basalt mesh, inside the screed." and sub-text
- [x] p.35 "What it does" copy, left to right
- [x] p.35 Summary strip is now a plain clickable index
- [x] p.35 Premix, Works with, A 3D basalt mesh, Crack Resistant
- [x] p.36 Jointless, Non-corrosive, Low-carbon

## 9. Data & AI Centres

- [x] p.37 "Built for Uninterrupted Performance."
- [x] p.37 Comparison restructured as one table, with new title
- [x] p.37-38 Rows 01 to 03. "Conducive" in the PDF is a typo and the site correctly says "Conductive"
- [x] p.38 Closing line "Less weight. No metal. Cracks under control."
- [x] p.38 Steps 1 to 6 and the step menu
- [x] p.39 "From floor to facility."
- [x] p.39 Maintenance, Installation, Sustainability

## 10. Automated Warehouse

- [x] p.40 "Engineered for Continuous Movement." and sub-text
- [x] p.40 "RTARIUM was built for this." restructured as a table
- [x] p.41 "Where the screed fails" on one screen, no red
- [x] p.41-42 Steps 1 to 7
- [x] p.43 "Frame to floor." plays from one scroll
- [x] p.43-44 Consultant, Owner, Contractor, Sustainability
- [ ] p.43 "High-velocity delivery": see questions above

## 11. Semiconductor Plant

- [x] p.45 Title weight, links out of the hero, "Designed for Absolute Precision."
- [x] p.46 Comparison is a table
- [x] p.46 "Where yield is lost" on one screen, no red
- [x] p.47-48 "How yield is maintained" and steps 1 to 7
- [x] p.48 "Back to the problem" removed
- [x] p.48 "From floor to facility." and Sustainability

## 12. Wall Panels

- [x] p.49 Title weight, "Wall panels, insulated and interlocked."
- [ ] p.49 Sub-text says 100 mm, not 80 mm: see W1
- [x] p.50 Story 3D stands still, with fixed words
- [x] p.51 Left-to-right reading
- [x] p.51 "Non-magnetic. Thermal resistant." and "Fire-rated: 4 hours" said once
- [x] p.51 "An independent, three-dimensional basalt mesh for reinforcement"
- [x] p.52 "Factory precision" and "A smarter approach to wall systems."
- [x] p.52 Features 1 to 6
- [x] p.53 Statement in Home's existing style
- [x] pp.54-55 Click a table part to find it on the diagram; larger diagram
- [ ] pp.54-55 Keep static: see W2
- [x] p.55 "Explore a system." and disclaimer removed
- [x] p.56 All step labels
- [x] p.57 "An RC frame, infilled."

---

## Changes on the branch that are not in the PDF

- Home's scroll snap removed, and scrolling made slower and smoother on every page (owner's instruction, per the report).

## Façade & Cladding round (uncommitted on `changes-v2`)

All PDF requests on pages 16 to 32 are closed, plus these from checking the pages:

- [x] Rainscreen: white boxes removed to match Stud Frame, "03 / 03" no longer clipped, title clear of the model
- [x] Skip added to Six layers, the Rainscreen barrier and the Stud Frame components; all nine Skip buttons clicked and working
- [x] Titles over the wireframes sit on a plate (also on the flooring pages that share the style)
- [x] Phone: listing copy shows, step names readable, Bridge words clear of the panel, Cast title margin even
- [x] One spelling: "façade", "L-plates"
- [ ] Still with the client: "Eliminated" rows and the 90% figure on Rainscreen, statement on the landing (G12)

## Façade landing, second pass

- [ ] UHPC photo is now the team's cracked concrete with steel fibres: its source and licence still need confirming before launch
- [x] RTARIUM block rebuilt in the same four boxes as the others: name and "3-d mesh reinforcement", "Why it replaces them", photo at the foot, panel at the bottom right
- [x] Photos in the story blocks no longer shrink on laptop heights (padding was counted twice)
- [ ] "One scroll" for problem animations: confirmed by the team as one scroll per animation. All pass on laptop. Phone overruns are parked for the mobile pass
- [x] Unitized "Four problems with thin panels": four cards on one screen, each with its own 3D panel, in the style of the "Two more ways" block
- [x] The four cards open with the scroll the way Inverted casting does (frames from their corners, size read-out, running line); their 3D panels are smaller
- [x] The title's words rise in with the scroll; the cards come in evenly from left to right
- [x] Rainscreen "Every material has its trade-offs": table replaced with a list of five rows: number, name with its details, and a small grey photo with a yellow line to scale for its weight; pointing at a row draws a yellow line along it in the site style, same copy and figures, same entrance as the four problems
- [x] Stud Frame heat scene: back to its original warm red-orange at the team's request, a deliberate exception to G4 (no red) so the heat reads
- [x] Stud Frame: L-plates no longer breaks at its hyphen
- [x] Stud Frame "Sprayed, stitched": photo removed, a wireframe gun now runs along the mould in the 3D while each coat goes in
- [x] Explore links removed from both landing heroes, Façade and Advanced Flooring (PDF p.19, p.33); the pages stay linked at the end of each page
- [x] Flooring comparisons (Data & AI, Warehouse, Semiconductor): table replaced with the Rainscreen trade-offs rows, same copy
- [x] Data & AI build: all six steps' labels moved clear of the model, scaled with it
- [x] Rainscreen and Stud Frame rows: tag markers line up
- [x] Flooring comparisons: the line stands alone on a black screen first, then the rows; RTARIUM's side carries the yellow, the closing line sits under its column
- [x] Flooring comparisons: rows now tall, with a very large number dropping from each line as it scrolls in (Enerblock reference), so the section runs longer than one screen
- [x] Flooring comparisons: two separate tabs beside each number, RTARIUM's on yellow; the answer ("RTARIUM was.") is its own line on the opening screen
- [x] Flooring comparisons: the answer line uses TrueFocus (React Bits; adds the `motion` dependency)
- [x] Flooring comparisons: back on one screen, text alone (no boxes), rows smaller; on the opening screen the sentence blurs and the answer comes into focus in yellow, once
- [x] Flooring comparisons: opening screen centred, brackets search the sentence and find the answer, once; column names once; closing line split across the rows
- [x] Flooring opening screen: the search now follows the scroll on a held screen, gliding without stops, and reverses on the way back; `motion` removed again
- [x] Flooring comparisons: search fits one screen of scroll and reverses; the closing tags sit under each row's number
- [x] Unitized four problems: X/Y reveal removed, simple pop-up (X/Y stays on photographs only)
- [x] Warehouse "Where the screed fails": five cards on one screen, same layout and pop-up as the Unitized problems
- [x] Flooring opening screen: brackets search line by line (three stops), section shortened
- [x] Flooring opening screen: two stops only, the whole sentence, then the answer
- [x] Warehouse failure cards: clicking one opens it across the panel, words first then its scene replayed, with Close, Previous and Next (Esc and arrow keys)
- [x] Flooring opening: sentence breaks and falls on scroll (FallingText, React Bits, adds matter-js), answer pops up; reverses
- [x] Flooring comparisons: closing summaries removed at the team's request (Less weight, No metal, and so on); rows stay on one screen with column names once
- [x] Flooring opening: two scrolls, the sentence first, then the answer falls from the top onto it and shatters it into words; reverses
- [x] Semiconductor "Where yield is lost": same five cards as Warehouse, with the click-to-open view
- [x] Unitized four problems: same click-to-open view with replay, Close, Previous and Next
- [x] Problem cards on Unitized, Warehouse and Semiconductor: labels show only in the opened view
- [x] Problem cards: animations keep playing in the overview while on screen, labels stay in the opened view
- [x] Warehouse failure scene: darker floor and heavier lines so the wireframes read at card size
- [x] Flooring answer reads "RTARIUM was." on all three pages
- [x] Problem cards loop from the top, in the card and the opened view
- [x] Warehouse cards: 04 starts whole and breaks, 05 drives up and catches
- [x] Warehouse AGVs in the aisle: solid bodies and tyres, spoked wheels, finer lines, slightly larger
- [x] Warehouse card 05: the AGV matches the aisle robots, solid body and tyres, finer lines, a lighter laser fan
- [x] Home scrolls one screen at a time on mouse, trackpad and keys, and never rests between screens
- [x] Home "In concrete" notes: white cards on stepped shadow layers
- [x] Home scroll runs through the wordless close-up of the mesh
- [x] Home scroll: turning back mid-move takes effect at once, steps answer straight away for trackpads
- [x] Home tour: the camera no longer pauses on the mesh close-up, in either direction
