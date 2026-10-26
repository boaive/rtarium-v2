---
target: Facade & Cladding overview and header site map
total_score: 22
max_score: 36
na_heuristics: 10
p0_count: 0
p1_count: 3
target_identity: "file:D:\\float you thrive\\rtarium v2\\src\\facade\\pages\\Overview.tsx"
target_fingerprint: "sha256:25e9c3530a966eb8245d553c0b42fd27eb8f4457880da1da2928ecf039bdb404"
target_path: "D:\\float you thrive\\rtarium v2\\src\\facade\\pages\\Overview.tsx"
timestamp: 2026-10-26T11-00-24Z
slug: src-facade-pages-overview-tsx
---
Method: dual-agent (A: design review, B: detector + rendered evidence via headless Edge)

## Design Health Score: 22/36 (n/a: 10)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Bar mapped 9 screens onto 4 cells and vanished for the systems |
| 2 | Match System / Real World | 2 | GRC/GFRC/UHPC/TRC/AR-glass never spelled out |
| 3 | User Control and Freedom | 2 | TRC unreachable on systems screens and footer |
| 4 | Consistency and Standards | 2 | GRC vs GFRC/GRC; subnav white on black; brand yellow on failure crack |
| 5 | Error Prevention | 3 | Jump guard, focus jump into stack |
| 6 | Recognition Rather Than Recall | 3 | TRC in bar from screen 0, explained only on beat 5 |
| 7 | Flexibility and Efficiency | 3 | Bar + subnav shortcuts |
| 8 | Aesthetic and Minimalist Design | 3 | One line per screen; Façade & Cladding x3 on opening |
| 9 | Error Recovery | 2 | WebGL fallback is one still |
| 10 | Help and Documentation | n/a | Persuade surface |

## Design Specificity Verdict
Story authored for RTARIUM (x-ray specimen line); finish partly generic (grid floor, wireframe boxes, catalogue-like systems half). Detector: source scan clean; live scan hero-eyebrow-chip (hero label) + straggler (phone .fco-line). Overlay injection skipped (in-app pane cannot reach dev server).

## Priority Issues (status after same-session fixes)
- [P1] TRC not reachable at all times. FIXED: bar on every beat, Systems cell, light-ground variant.
- [P1] Answer beat weaker than problem beat; mesh read as flat 2D grid. PARTLY FIXED: oblique close camera on beat 5. OPEN: payoff (replay attack on TRC; one supported figure, flexural +77 % in UHPC).
- [P1] Weak-points claims: Alkali aimed at AR-glass; directional weakness drawn on UHPC; crack in brand yellow. PARTLY FIXED: crack warm white. OPEN: wording is the client's; decision needed.
- [P2] Label collisions and leader drift (1024 and 1280x640). FIXED: LabelProjector bottom reserve, leaders follow shifted tags, AR-glass label to the left.
- [P2] System models not premium (stud lying from behind, rainscreen cavity invisible, no mesh shown). PARTLY FIXED: real key-light shadows, phone framing. OPEN: model work.

## Fixed minor items
Acronyms expanded under headlines; hero eyebrow removed; gaze-based isolation of specimens; subnav dark links yellow; phone subnav edge fade; Non-corrosive on phones; open stack row fills column; stack background; .fco-line text-wrap pretty; screen-reader text for TRC answers; row heads aria-controls.

## Open minor items
Subnav links 36 px tall; footer groups pages under Technology vs header Home; header plate flashes yellow at footer; WebGL fallback is one still.

## Persona Red Flags
Facade consultant: no figure on page; Beyond UHPC vs RTARIUM-in-UHPC evidence; models leave cavity/red strips/mesh unanswered. Marketing presenter: bar vanished at systems (fixed). Keyboard/screen-reader: good skip link and bar; weak-points evidence visual only.

## Questions to Consider
Is UHPC the enemy, or loose fibre? What would make the TRC answer outdo the rust? Does the overview need its own subnav once the header lists the section?
