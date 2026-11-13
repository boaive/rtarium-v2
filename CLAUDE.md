# RTARIUM site: rules for phone motion

These came out of a jitter at the start of every phone section (Nov 2026). Follow them for any new section.

## 1. One scroll driver at a time
A page that is being glided by our code must never also be moved by the browser's own momentum.
- Chrome and Safari keep a finger's fling running off the main thread after `touchend`, and nothing can cancel it.
  A `scrollTo` loop on top of a fling makes the page shake a few pixels back and forth as it lands.
- So in any stepped (snap-a-screen) stretch, the swipe is taken on its **first** `touchmove`. Call `preventDefault`
  (only the first move can be cancelled) and move the page with the finger yourself. Then no fling ever starts.
  See `useSwipePager` in `src/sections/Hero.tsx`.
- A new stepped section joins the existing pager: `data-swipe-rows` (screen-tall parts) or `data-swipe-stops`.
  Never write a second snap or scroll handler.
- Never use CSS `scroll-snap` or `scroll-behavior: smooth` on top of the pager.
- Leave alone, for the browser: sideways drags, menus and dialogs (`dialog`, `[data-lenis-prevent]`), and swipes
  out to where the page scrolls freely.

## 2. Nothing first happens mid-swipe
Everything a section will draw is prepared behind the loading screen, never as it scrolls into view. That covers:
- models, textures and every thickness option;
- shader programs, including shadow and solid-yarn variants;
- each card's first frame.

The opener (`src/opener.ts`) waits on `builds.waiting` (Stage3D's queue) and `builds.stage` (StageScene priming every
phone card). A new 3D view must be covered by one of these.

## 3. A glide reaches its stop exactly
Any ease used for a glide must end at exactly 1. A bare `1 - 2^-10t` stops 0.1% short and snaps on its last frame.

## 4. No layout that moves with the browser's bars
- Screen-tall stepped parts use `100lvh`, not `vh`, `svh` or `dvh`.
- Copies from the shared WebGL canvas are clamped to its current size. It is resized a frame behind the bars.

## 4b. Animated 3D cards stay light
A live 3D card that turns forever is redrawn every frame, and the page lags under it. Keep it live, but make it cheap:
- A phone card's turn holds while the page moves (`pageMoving` in StageScene; the card models' turn in ScrubRig
  likewise). The card is never redrawn mid-swipe; it scrolls as a picture. At rest it turns every frame: stepping it
  at 30 fps read as a stutter.
- A model's opening animation plays as soon as the model is built, out of sight. Starting three at once as their
  section came into view stalled the page four times, 100–130 ms each.
- The phone's stage primes every card on every load, not only when the loading screen shows. Later loads in a visit
  skip the loading screen.
- In a row of cards, only the card in front animates (Applications: `liveOf`). The others draw nothing.
- No 3D scene is built or plays its opening after the loading screen on a phone's Home. Home's loading screen plays
  on every load there, not once a visit. It waits while the card row (`data-stage-early`) is built and its openings
  play out (`builds.tail`), up to 18 s.
- Building them a few seconds after the loading screen instead let their openings play while the visitor scrolled
  About. The whole page then felt like 15 fps on a phone.
- Once built and played, each card model is captured as a picture (AppModel: `Snapshot`) and its 3D scene is
  discarded. Keeping the three scenes alive, each with a 2048² shadow map, slowed the hero's flight on a phone even
  though they drew nothing.
- Rule of thumb: on a phone's Home, the only live WebGL context during scrolling is the main stage.
- Films in place of live 3D were tried and dropped. Swapping a film's source (Three elements' thickness switch) showed
  black until the new one loaded.

## 5. Cards in stepped sections are not pressed or turned by hand
A finger on them only moves the page (`PAGED` in `src/components/Chapter.tsx`).

## Testing
- A mouse wheel never shows rules 1–4. Check on a real phone (Wi-Fi preview), or in headless Chrome with CDP
  `Input.dispatchTouchEvent`.
- Log `scrollY` every frame across a landing. Any change of direction after the swipe means two drivers are fighting.

## Repo habits
- Commit to `kristen` locally; push only when asked. Never deploy from a branch.
- Files keep their line endings (most are CRLF). Edit with the Edit tool, or Python using `newline=''`. `sed -i` here
  strips the CRs.
- Read and write files as UTF-8 explicitly (`encoding='utf-8'`). Windows' default encoding mangles ©, ç and dashes.
