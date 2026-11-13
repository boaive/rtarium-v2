# Smooth Scroll

The phone Home's scroll optimisations (13 Nov 2026, branch `kristen`). It was tuned against the user's real phone,
screenshot by screenshot, until every section scrolled at 60 fps with no twitch.

Recall it by name ("smooth scroll"). The short rules live in [CLAUDE.md](../CLAUDE.md). This file says what was
done, where, and why.

## 1. One scroll driver: no fling under a glide
- **Problem:** at every landing the page shook ±10 px for about 0.3 s. Chrome's own fling from the swipe kept running,
  off the main thread, while our glide set `scrollTo` each frame. The two pulled against each other.
- **Fix:** `useSwipePager` (src/sections/Hero.tsx) takes the swipe on its **first `touchmove`**: `preventDefault`,
  and the page follows the finger itself. No fling ever starts.
- A swipe starting in a stepped stretch is always taken, even one leaving it. It glides to the next stretch's stop if
  one is within 1.6 screens (`entry`), else one screen on.
  - Left to the browser, a back-swipe fling ran up through every section, each catching it: jitter, then a fall to
    the hero.
- Sideways drags, dialogs and the menu (`[data-lenis-prevent]`) are left to the browser.
- Stepped stretches: `data-swipe-rows` (About, Innovation, Tech Space: `PAGED` in src/components/Chapter.tsx) and
  `data-swipe-stops` (What it replaces).
- The glide ease reaches exactly 1 (`glideEase`): a bare expo stopped 0.1 % short and snapped on its last frame.

## 2. Nothing first happens mid-scroll: the loading screen does it
- On a phone's Home the loading screen plays on **every load** (index.html: `phoneHome`), not once a visit.
- It waits for:
  - every model and texture (three's loading manager), including all four thickness cells (preloaded at once);
  - `builds.stage`: StageScene primes every phone card, drawing it once into its canvas in every program it will
    use, with arrows, shear plane and dimension grown;
  - `builds.waiting` / `builds.tail`: Home's applications cards (`data-stage-early`) are built, play their openings,
    are **captured as pictures** (AppModel `Snapshot`), and their 3D scenes are discarded.
- Safety limits: 18 s on phone Home (`MOST` in src/opener.ts; CSS bail at 20 s in index.html).
- Priming also runs on loads where the loading screen doesn't show.

## 3. Only one live WebGL context while scrolling
- The main stage (StageScene) is the only live 3D on a phone's Home.
- The three applications cards are pictures. Each live scene had its own canvas, MSAA and a 2048² shadow map, and
  even idle they slowed the hero's flight on a phone.
- Cards in About, Innovation and Tech Space are drawn by the one stage into their own 2D canvases, and redrawn only
  when their picture changes.

## 4. Animated cards stay light
- A turning card holds its turn while the page moves (`pageMoving` in StageScene; `movedAt` / `held` in
  src/facade/three/ScrubRig.tsx). Mid-swipe it is never redrawn, just scrolled as a picture. At rest it turns every
  frame (30 fps stepping read as a stutter).
- The idle check never parks a card that is due to turn (`spinning`) or the hero waiting out its hold (`opening`).
- In a row of cards only the front one animates (Applications `liveOf`).
- Films in place of live 3D were tried and dropped: swapping a film's source (thickness switch) flashed black.

## 5. Layout never moves with the browser's bars
- Screen-tall stepped parts use `100lvh`.
- Card copies from the shared canvas are clamped to its current size; it is resized a frame behind the bars.

## 6. Small things that each read as a twitch
- Hero: opens at its reference angle (`OPEN_START` 90°), holds about 5 s, then eases into a slow turn.
- Non-Corrosive grows with the scroll (`grow` pose, `uWinShift` in the yarn shader) instead of turning.
- Tap highlight and text selection are off on buttons, links and the header (src/styles/base.css). Hover tints only
  apply with `@media (hover: hover)`. The Monolithic toggle's pill slides instead of jumping.
- The footer's liquid blob is off on phones.

## How to check
- A mouse wheel shows none of this. Test on the phone (Wi-Fi preview of `npm run build`), or with synthetic touch
  events (`new Touch` / `TouchEvent` dispatched on `document.body`).
- Log `scrollY` per frame: any change of direction after a swipe means two drivers are fighting.
- `PerformanceObserver({ entryTypes: ['longtask'] })` while stepping `scrollTo` frame by frame. Every stretch should
  show a median of 16.7 ms and no long tasks on the first pass after a fresh load.
