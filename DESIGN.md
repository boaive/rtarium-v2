---
name: RTARIUM by HEMISPHERE ONE
description: Hard colour fields, inverse-colour slabs and one real 3D basalt mesh, presented one full screen at a time.
colors:
  rtarium-yellow: "#fdd001"
  ink-black: "#080808"
  warm-white: "#f2f0e9"
  graphite: "#151515"
  grey: "#929292"
  gold: "#e8a317"
  on-yellow-2: "#4a3d00"
  on-dark-2: "#bfa64a"
  on-light-2: "#57554f"
  review-flag: "#b04a00"
typography:
  display:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(2.1rem, min(3.9vw, 7.2vh), 4.4rem)"
    fontWeight: 700
    lineHeight: 1.02
  name:
    fontFamily: "Anybody Variable, Archivo Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(5rem, 19.6vw, 22rem)"
    fontWeight: 860
    lineHeight: 0.9
  statement:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.9rem, 3.7vw, 4rem)"
    fontWeight: 600
  figure:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(3.4rem, min(7.4vw, 13vh), 7.6rem)"
    fontWeight: 600
    fontFeature: "tnum"
    letterSpacing: "-0.01em"
  readout:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.45rem, min(2.2vw, 4vh), 2.3rem)"
    fontWeight: 600
    fontFeature: "tnum"
  lead:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.05rem, 1.25vw, 1.3rem)"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    letterSpacing: "0.04em"
rounded:
  none: "0"
  xs: "4px"
  sm: "6px"
  md: "8px"
  pill: "999px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
  s-8: "64px"
  s-9: "96px"
  gutter: "clamp(18px, 4.2vw, 64px)"
components:
  pill-solid:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.rtarium-yellow}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "46px"
  pill-solid-hover:
    backgroundColor: "transparent"
    textColor: "{colors.ink-black}"
  pill-ink:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.rtarium-yellow}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "56px"
  explore-slab:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.rtarium-yellow}"
    rounded: "{rounded.none}"
    height: "60px"
  brand-capsule:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.warm-white}"
    rounded: "{rounded.pill}"
    padding: "11px 20px 11px 16px"
  progress-step:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.rtarium-yellow}"
    rounded: "{rounded.none}"
    typography: "{typography.label}"
    height: "36px"
  heading-slab-line:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.rtarium-yellow}"
    rounded: "{rounded.none}"
    padding: "0.04em 0.18em 0.12em 0.14em"
---

# Design System: RTARIUM by HEMISPHERE ONE

## Overview

**Creative North Star: "The Machined Slab"**

The site is a presentation, not a page. Every screen is a full-height field of one colour that says one thing, and the only object with real depth is the basalt mesh itself, drawn in WebGL. Everything around it is flat, hard-edged and exact: blocks of yellow, black and warm white, hairline leaders, numbered notes, and headings set on slabs of the inverse colour so they read over anything.

The mood is premium and engineered, in the manner the owner set as binding: EnduroSat's one-scene-per-message continuity, Buttermax's giant name on a colour ground, Enerblock's hard colour fields and scroll motion. Screens change by one continuous, symmetrical motion: the next panel and its ground rise along one edge with the scroll, and fall back the same way. Words arrive one by one at a moderate, time-based pace. Nothing cross-fades and nothing washes over the mesh.

Technical content is exact and plain: the explanation first, then the figure, in tabular numerals, labelled by what it describes (mesh, yarn, concrete).

**Key Characteristics:**
- Yellow is the majority colour; black is ink and the ground of technical screens; warm white replaces white.
- The mesh keeps its own basalt-bronze colour on every ground, never black.
- Type and mesh both read, through contrast colours or an inverse slab, never blend modes.
- One message per screen; little text; layouts vary per screen and avoid "left text over right 3D".
- Flat UI, deep 3D: all depth belongs to the mesh.

## Colors

Three grounds, one brand yellow, and tints for secondary text on each ground. There is no accent beyond the yellow itself.

### Primary
- **RTARIUM Yellow** (#fdd001): the opening ground, the footer, the type colour on black, and the fill of inverse slabs on black. It is the majority colour.

### Neutral
- **Ink Black** (#080808): type on yellow and warm white, the ground of technical screens (Why's challenge, No coating, Tech Space), every slab on yellow, and the brand capsule.
- **Warm White** (#f2f0e9): the third ground (What it replaces, Applications, inner pages, the "Concrete, better than ever." cast) and the light of the opening tour's wash.
- **Graphite** (#151515) and **Grey** (#929292): reserved neutrals for rare surfaces and muted marks.
- **Gold** (#e8a317): warm key light and highlights on the mesh, not a UI colour.

### Secondary text, per ground
- **Dark Olive Ink** (#4a3d00) on yellow, **Dimmed Yellow** (#bfa64a, 7.7:1) on black, **Stone** (#57554f) on warm white. All at or above 4.5:1.

### Named Rules
**The Inverse Rule.** On yellow, a block is black with yellow type; on black, a block is yellow with black type. White type on black is not used; type on black is yellow.

**The Own-Colour Rule.** The mesh is shown in basalt bronze on every ground. It is never black, never tinted by a ground, and nothing inverts it.

**The No-Blend Rule.** No `mix-blend-mode` anywhere. A difference blend read as muddy olive in review; legibility comes from slabs or clear ground.

## Typography

**Display and body font:** Archivo Variable (with Helvetica Neue, Arial)
**Name font:** Anybody Variable (at 150 % width, weight about 860)

**Character:** Archivo is neutral and sturdy and carries every heading, paragraph and measurement. Anybody at its widest is a machined, extended face used only where the name is set as type (the opening, the footer), so the wordmark answers the logo.

### Hierarchy
- **Name** (860, `clamp(5rem, 19.6vw, 22rem)`, extended): "RTARIUM." in the opening and the footer at full width; "Meet" above it is the same face, narrow and light, about a third of the size.
- **Display** (700, `clamp(2.1rem, min(3.9vw, 7.2vh), 4.4rem)`, 1.02): step headings. Sizes follow viewport height as well as width so a short window never pushes copy into the header.
- **Statement** (600, `clamp(1.9rem, 3.7vw, 4rem)`): the one full-screen sentence of "The challenge".
- **Figure** (600, `clamp(3.4rem, min(7.4vw, 13vh), 7.6rem)`, tabular): the single large number on a screen.
- **Readout** (600, `clamp(1.45rem, min(2.2vw, 4vh), 2.3rem)`, tabular): Tech Space figures you can point at.
- **Lead** (400, `clamp(1.05rem, 1.25vw, 1.3rem)`): one supporting sentence under a heading.
- **Body** (400, 1.0625rem, 1.55): running text.
- **Label** (700, 0.78rem, 0.04em, uppercase): progress steps and chips.

### Named Rules
**The One Face for Numbers Rule.** Every measurement, large or small, is Archivo with tabular figures (`.num`). No monospace face for figures.

**The Word-by-Word Rule.** Headings rise word by word out of their own masks once the screen is reached, 85 ms apart (95 ms for the challenge statement), then hold their end state.

## Layout

Each step is a real 100 svh screen. Copy position is chosen per screen and kept clear of the mesh: bottom right, top band, full-screen sentence, top right, bottom left, ground band under a close-up, diagonal. Copy always keeps a fixed margin under the header and above the step chips (`--nav-h` 84 px, 64 px on phones; `--progress-h` 96 px, 76 px on phones).

About, Innovation and Tech Space run sideways: the chapter is pinned, the damped scroll carries it across, and the next slide enters from the right edge over the last, with one mesh moving continuously between the steps' poses. Opening, Why's rows and the other vertical screens are scroll-driven; each screen and step is a holding point the page settles onto.

Horizontal rhythm is a fluid gutter (`clamp(18px, 4.2vw, 64px)`) on a 4 px base scale (4 to 96). On phones the model sits above and the copy below on a ground panel; callouts reduce to the one with clear ground.

## Elevation & Depth

Flat by default. The interface has no card shadows; depth is carried only by the 3D mesh, its shadow-catcher and the cast concrete. The few UI shadows are the brand capsule's soft lift (`0 6px 18px -10px rgb(8 8 8 / 0.55)`, deeper on hover) and a hairline of yellow on it when it sits on black, plus a long soft shadow under the footage frame (`0 18px 40px -24px rgb(8 8 8 / 0.6)`).

### Named Rules
**The Flat-UI Rule.** Surfaces are flat colour fields separated by hairlines (`rgb(8 8 8 / 0.22)` on yellow, `rgb(253 208 1 / 0.22)` on black). If a block needs to stand out, it becomes a slab of the inverse colour, not a shadowed card.

## Shapes

Two shape languages, never mixed on one control. Actions are pills (fully rounded, 1.5 px border). Structure is square: slabs, step chips, the Explore button and cast panels have no radius. A small 4 to 8 px radius appears only on photographic frames and pins. Leader lines, dimension ticks and numbered notes use hairlines and square ends, like an engineering drawing.

## Components

### Pills (actions)
- **Shape:** fully rounded (999 px), 46 px tall (56 px for `pill--ink`), 22 to 28 px side padding, 1.5 px current-colour border.
- **Solid:** black with yellow type on yellow and warm white; yellow with black type on black. Hover empties the fill and keeps the border.
- **Line:** transparent with a border; hover fills with the inverse colour.

### Explore slab
- **Shape:** square, 60 px tall: a black slab (yellow label) with a separate arrow cell. On hover yellow runs back across the slab and the arrow steps on.

### Brand capsule
- **Shape:** black pill carrying both logos in full colour with a hairline divider before "by HEMISPHERE ONE". It is black on every ground because the logos' yellow vanishes on yellow; on black it gains a yellow hairline edge.

### Heading slabs
- **Style:** each heading line sits on its own block of the inverse colour; the block opens left to right (0.55 s), then the words rise. Used on Innovation, Tech Space and the tour's two statements.

### Progress steps
- **Style:** square 36 px chips, uppercase 0.78 rem labels, inverse-colour slabs whose label is always at full contrast, with a rule that fills along the foot while the step plays. Each chip jumps to its step.

### Stage labels
- **Style:** no chips; a leader line from the point on the mesh to a dot and a plain label on clear ground. Where a piece passes under a label, the label keeps a plate of the ground behind its words. Numbered notes and dimensions follow the same drawing language.

### Navigation
- **Style:** the brand capsule left; Technology chapters and a solid "Contact" pill right; "Menu" on narrow screens opening a yellow overlay. The header follows the ground of the step on screen, and parts sit on chips of that ground so they stay legible over the mesh.

### Footer liquid (signature)
- **Style:** a black liquid follows the cursor and turns the yellow footer black where it flows (the footer's yellow copy is clipped to its outline), carrying a 3D piece of the real mesh that bends and stretches in motion and lies flat at rest. On narrow screens it shows only while touched.

## Do's and Don'ts

### Do:
- **Do** open on yellow (#fdd001); keep it the majority colour across the story.
- **Do** put type on a contrast colour or an inverse slab: black on yellow, yellow on black.
- **Do** keep every screen to one message and very little text; explain in plain language first, then give the exact figure.
- **Do** set every number in Archivo tabular figures and label it by what it describes (mesh, yarn, concrete).
- **Do** use "3D spacer structure" or "3D woven spacer", and "RTARIUM by HEMISPHERE ONE" for the name.
- **Do** make screen changes one continuous, symmetrical motion in both directions, and honour reduced motion (end states shown, no glide, no drop).
- **Do** keep a still image fallback where WebGL is unavailable, and meet WCAG 2.2 AA contrast with full keyboard access.

### Don't:
- **Don't** show the mesh in black, or let any ground, blend or filter recolour it.
- **Don't** use `mix-blend-mode`, cross-fades or colour washes over the mesh (the one intended wash is the tour's white light).
- **Don't** put copy over the 3D or lay out "left text over right 3D".
- **Don't** show concrete outside "Concrete, better than ever.", "In concrete" and Tech Space's own slabs.
- **Don't** use white type on black, shadows on cards, or pills and square chips on the same control.
- **Don't** publish "Diamondcomb", or any figure, test standard, certification or contact detail the client's material does not supply.
- **Don't** resolve the open questions (19.7 vs 20.9 MPa, "impregnated" vs "no chemical top-coatings"); keep them flagged.
