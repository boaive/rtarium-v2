# RTARIUM site: rules for phone motion

These came out of a jitter at the start of every phone section (Nov 2026). Follow them for any new section.

## 1. Phones scroll natively (veedo.space's way, Nov 17 2026)
On a phone or portrait tablet (`nativeScroll()` in `src/lib/motion.ts`, the compact query) only the browser moves the
page. The reference is veedo.space's source, `C:\DOWNLOADS\vee.build-main` (its `AGENTS.md`, `src/film/Film.tsx`).
- No Lenis and no stepper (`startSmoothScroll`, `stepScreens` stand aside). Never add a `scrollTo` loop, a snap or a
  "bring it to the nearer stop" on a phone: any code moving the page during a fling makes it shake and scroll back.
- One exception, the user's (17 Nov 2026): Home's opening tour still goes a screen a swipe, and from its line one swipe
  flies through the cavity and the white to About by itself (`useSwipePager` + `useWhiteHandoff`, its swipes taken on
  the first `touchmove` so no fling starts under the glide). On a phone `pagedZones` returns the tour alone: About,
  What it replaces, Innovation and Tech Space scroll natively.
- One more exception, the user's (18 Nov 2026): the Rainscreen barrier and the Stud Frame components on a phone (`ListingScreen` with `snap`) are a
  stop a swipe both ways, six stops (each point's whole view, then its close view), by the browser's own CSS snapping:
  `scroll-snap-stop: always` points half a screen apart, `html:has(.fls--snap) { scroll-snap-type: y proximity }`.
  Nothing in code moves the page. A JS hold (`data-hold`) could not stop a real phone's fling there.
- Pinned parts are `position: sticky` and play by where the page is. Their picture eases toward the scroll target
  (`damp(v, target, 9.5, dt)`, veedo's `DAMPING`), never set straight from a scroll event.
- One passive scroll listener per thing, and read layout before writing styles in a frame.
- `holdScroll` (opening, menu) holds the page with `overflow: hidden` when there is no Lenis.
- A section that should rest on a stop carries `data-settle` (+ `data-stops`): `src/lib/settle.ts` glides it there
  slowly, only once the finger is off and the fling has stopped, and a touch cancels it. Used by the Unitized six
  layers, which on a phone play by themselves with "Skip to the end". Not the Rainscreen barrier or the Stud Frame
  components on a phone (18 Nov 2026): they scroll freely, each listing held 1.8 screens, as settling read as locked.
- A screen of parts a scroll carries `data-hold` (Unitized six layers, Wall Panels' panels): a fling crossing its top is
  stopped on it by cutting the page's overflow for two frames (ends the browser's momentum, nothing fights it). Held
  there, each swipe is taken on its first `touchmove` and sent to the screen as `holdstep` (a part on or back); the
  screen marks its ends with `data-hold-at` (first, last), where a swipe out is left to the browser. No autoplay.
  Gone through to its last part once (or skipped there), it is released for the visit (`release` in settle.ts): never
  caught, stepped or settled onto again.
- On a phone the loading screen plays on every load and on every page change (`openOnPage` in `src/opener.ts`), so
  each page's 3D is built behind it, never in a quiet moment mid-scroll.
- A wide screen is unchanged: Lenis and the stepper as before. The pager code stays for it to be switched back.

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
- In a row of cards, only the card in front animates. The others hold still.
- Home's card row on a phone is films, not 3D (mobile-v3-fallback, 18 Nov 2026): each card model turning, recorded a
  frame at a time (`src/dev/FilmCard.tsx` at `/__film-card?id=`, `node scripts/film-record.mjs`, GPU=1) into
  `public/video/cards` as a seamless H.264 loop at 810 px, its first frame the poster. Only the front card plays. A
  change to a card model or its shot (AppModel `SHOTS`) means recording its film again.
- No 3D scene is built or plays its opening after the loading screen on a phone's Home. Home's loading screen plays
  on every load there, not once a visit.
- Building them a few seconds after the loading screen instead let their openings play while the visitor scrolled
  About. The whole page then felt like 15 fps on a phone.
- Before the films, each card model was built behind the loading screen (up to 18 s of it) and kept as a picture
  (AppModel: `Snapshot`), drawn at 1.5x and soft on a 3x screen. Keeping the three scenes alive, each with a 2048²
  shadow map, slowed the hero's flight on a phone even though they drew nothing.
- Rule of thumb: on a phone's Home, the only live WebGL context during scrolling is the main stage.
- On the product pages (Stage3D), a phone's scene that the page carries along as it moves is not redrawn until the page
  is still (`Carried`); a pinned scene, played by the scroll, keeps drawing. Phone shadow maps are 1024².
- Product pages on a phone (after veedo.space, C:\DOWNLOADS\vee.build-main): a scene within 1.75 screens is built in a
  quiet moment (page still 280 ms), then every other one on the page; at once only if already on the screen. Once built
  a scene is kept (releasing far ones made the way back up meet scenes still to be built). One sharpness a visit (no `Pace`); a budget phone (src/lib/tier.ts) draws at 1 px per CSS px.
- Films in place of live 3D: never swap a film's source in place. Swapping it (Three elements' thickness switch) showed
  black until the new one loaded. A film that keeps its source (Home's cards) is fine.

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
