# Overflow — Project Handoff

This document is the single source of truth for the Overflow project. If you're
a fresh assistant session (e.g. picking this up in Cowork), read this first: it
captures what the game is, why it's designed the way it is, the current state of
the build, and what's left to do. The *why* matters — many of the decisions
below were reached by testing and rejecting alternatives, so please don't
re-litigate them without cause.

---

## What Overflow is

A minimal, tactile puzzle game for mobile, in the spirit of the app "Arrows" —
same *essence* (quick to play, clear-the-board, satisfying, scales in
difficulty), but an original mechanic.

**Core loop.** The board is a grid of cells, each holding a NUMBER and having
its own per-cell CAP. Tapping a cell empties it and splits `floor(value * ratio)`
evenly across its 4 orthogonal neighbours (remainder discarded; shares that fall
off-grid are lost — this is the ONLY way total value drains, which guarantees the
board terminates). A cell BURSTS if it exceeds its cap. Bursting cascades: a
burst cell distributes its value, which can push neighbours over their caps,
chaining outward. **Each bursting cell costs one life.** Lives scale with grid
size (`livesForGrid()` in the engine) — 3 at 3×3, 5 at 4×4, 7 at 5×5, 10 at
6×6 (daily-only) — since a bigger board has more cells that can chain into one
cascade, and more lives lets that be genuine bad luck rather than pure
life-count attrition on top of the tighter caps. Chains resolve
deterministically and can outrun your lives, losing the board.

**Green cells.** A cell whose tap would push nothing (`floor(value*ratio/4) === 0`)
is "green" — safe filler. Greens are LOCKED (can't be tapped) until every
remaining cell is green, at which point the board auto-resolves as a win.

**Goal.** Clear the board. Binary win/lose (no star ratings — deliberately, to
avoid encouraging retries). Clearing advances a level; a wipeout offers "Try
again" at the same level.

---

## Design decisions and WHY (hard-won — don't undo lightly)

- **Numbers, not pips.** Splitting a number 4 ways with no privileged direction
  gives light arithmetic and clean interference. (Started with pips, switched.)

- **Per-cell caps, drawn across a [min,max] range.** A uniform cap made the game
  trivially greedy-solvable ("tap the highest number" won ~95%). Varied caps make
  *headroom* (cap − value) the thing you read, not raw magnitude.

- **The central difficulty insight: difficulty = FULLNESS, and LOW caps force it.**
  A cell only threatens a burst when its headroom is small (≤ ~cap/4, because of
  the ÷4 split). High caps leave cells proportionally emptier → EASIER. So low
  caps are HARDER. Big numbers for "arithmetic difficulty" actively fight
  difficulty. Keep caps low.

- **Fully-packed boards (Leon's key breakthrough).** Filling EVERY cell to start
  is what makes the game hard even on small grids: with no empty space, a
  careless tap order trips a cascade fast. This overturned an earlier (wrong)
  conclusion that "small grids can't be hard" — the real safety floor was empty
  space, not grid size. Full 3×3 drops careless-play win rate to ~34%, full 4×4
  to ~9%.

- **Depth vs fairness — the fundamental tension.** A puzzle only has depth if some
  safe moves can strand you (so order matters). A game you can never get stuck in
  has no decisions. Lives are what keep stranding FAIR: a mistake costs a life,
  not the run. Leon explicitly disliked pure "trap boards" (unfair lock-ups) and
  disliked the heat-tint colour aid (it did the reading for you) — both are OFF /
  rejected. The chosen identity: **varied low caps, no colour, full boards, read
  the board yourself.**

- **Tuning target (revised, Leon's explicit ask): gentle onboarding, quick
  ramp, long hard tail, never truly impossible.** Level 1 should be easy;
  within the first ~10-20 levels it should clearly require thought (not
  boring); difficulty should then keep climbing — gradually, not in cliffs —
  for hundreds/thousands of levels, reaching a genuinely very hard (but not
  literally unbeatable) plateau late, since most players won't get anywhere
  near there. This supersedes an earlier "HARD everywhere, careless ~40%→8%"
  framing that predated fully-packed boards and the level-curve rework below.

- **Level curve (reworked after simulation — see `scripts/simulate-difficulty.js`).**
  Fully packed at every level. Key findings that drove the current shape:
  - **Grid size is a CLIFF, not a ramp, past 4×4.** Measured directly: holding
    caps at their loosest possible value and varying ONLY grid size, a
    careful (one-ply-lookahead) bot's win rate goes 3×3=75% → 4×4=35% →
    5×5=0% → 6×6=0%, regardless of caps. This reproduces (and vindicates) an
    older, since-overridden finding that 5×5+ "makes even careful play lose
    unfairly" — an earlier session had let grid size grow unboundedly with
    level to feed a long difficulty tail, without re-testing against this.
    That also broke technically: generation cost climbs fast with n (~1s at
    10×10; 12×12+ can exhaust its attempt budget and silently fall back to
    an **unverified** board), and ladder mode generates synchronously with no
    loading UI on every level-up. Consequence: grid size can never be a
    smooth long ramp — it's 3×3, 4×4, and periodic 5×5 "wall" spikes, full
    stop, not a continuum extending to 6×6+.
  - **`capMax` widening ALONE makes the game easier for a burst-avoidance
    bot** (more generously-capped cells dilute the danger) — `capMin`
    tightening, not the cap range's width, is what drives a bot's win rate
    down. BUT Leon explicitly wants `capMax` to keep climbing anyway, well
    past its old ceiling (42 → 60, saturating around level ~8000 instead of
    ~2000) — bigger numbers make the *mental arithmetic* harder in a way the
    win-rate bots can't measure (they don't "do maths," they just react to
    burst/no-burst). So `capMax`'s climb is now an intentional felt-
    progression signal in its own right, not just a background variety knob
    — `capMin` is left to do the actual burst-avoidance difficulty work.
  - **Generation-safety is about `capMin`'s FLOOR value, not just its
    pairing with `capMax`.** A cell whose cap is ≤4 is ALWAYS green at
    ratio=0.88 (see `isGreen`), so it's forced into the single-permitted
    "full cell" slot — with `capMin` floored at 4, enough cells draw a tiny
    cap that multiple forced-full collisions become likely unless `capMax`
    is wide enough to compensate (measured: needs ≥14 at 4×4, ≥18 at 5×5,
    since more cells means more collision risk). Raising the floor to
    **5** instead removes the problem at the source — v=5 isn't always
    green, so it needs far less margin (≥10 at 4×4, ≥12 at 5×5) — small
    enough that a slowly-climbing `capMax` clears it on its own, with no
    special-casing needed. (This was found the hard way: an earlier attempt
    kept the floor at 4 and patched around it with a hard safety-floor jump
    exactly when `capMin` bottomed out — technically safe, but a visible,
    unintended easing bump at that level. Raising the floor was the cleaner
    fix.) A dynamic, pace-independent safety floor (`CAP_MAX_SAFE_FLOOR_4X4`
    / `_5X5` in `levelParams()`) still exists as a defensive backstop against
    future retuning, but shouldn't need to fire in normal operation.

  **Milestones are Leon's explicit, round-number choices** (not simulation-
  derived): 3×3 for **L1–100**, 4×4 for **L101–500**, then a 5×5 "hard wall"
  level every **5** levels from L505 on — a real, frequent recurring gauntlet
  (roughly 1 in 5 levels past L500), not the old rare "every 25 levels"
  spike. (3×3's span was raised from an original 50 to 100 after
  playtesting — Leon wanted more time on 3×3 while the numbers climb before
  handing off to 4×4.) `capMin` tightens continuously (sqrt shape, front-
  loaded) from level 1 through both the 3×3 and 4×4 bands, reaching its
  floor (5) around L282; `capMax` grows continuously too (linear,
  deliberately much slower) from level 1 all the way out to ~L8000. See
  `levelParams()` / `gridSizeForLevel()` in the engine for the exact
  formulas and the fuller reasoning in their comments.

  **L1–100 (3×3) runs its OWN separate, steeper ramp** (`tier1Params()`),
  not the whole-game curve above — the whole-game curve only moves `capMax`
  9→10 across 100 levels, imperceptible. `capMin` still tightens sqrt-shape
  (7→5, floor by ~L58); `capMax` grows LINEARLY to a much higher endpoint
  (9→20 — a steady climb of roughly 9, 12, 14, 17, 20 at L1/25/50/75/100,
  per Leon's explicit "consistent number increase" ask). This tier-1 curve
  is NOT continuous with the whole-game curve at the L100→101 seam (`capMax`
  steps back down, 20→10, right as the grid steps up to 4×4) — deliberately
  left as-is per Leon's choice, since every level is a brand-new board
  anyway and the grid-size cliff already dominates the difficulty jump
  there. Note: a back-loaded (t²) version of this curve was tried first
  specifically to avoid the tradeoff below (measured: linear swamps
  `capMin`'s narrow floor-limited tightening room, making the tutorial phase
  measurably *easier* as level rises — careless 40%→65%, greedy 80%→~95-100%
  by L100) — Leon explicitly chose linear/consistent growth over that
  win-rate flatness anyway, so the easing is back and accepted, same
  category as the 4×4-band tradeoff below.

  **Data-informed, still expect retuning from real playtesting** —
  `scripts/simulate-difficulty.js` (careless-bot + one-ply-greedy-bot win
  rate by level, plus generation-fallback-rate tracking) shows: the 3×3
  band's bot win rate leans upward toward L100 (greedy climbs into the
  90s-100% by L60-100) — the accepted tradeoff above; a sharp, expected
  cliff at the L100→101 handoff; real variation through 4×4
  (greedy roughly 3-60% depending on level, with a mild overall lean toward
  *easier* by L500, since `capMax`'s total range still slightly outweighs
  `capMin`'s narrower 7→5 range — flagged to Leon, accepted as a reasonable
  tradeoff against `capMax`'s arithmetic-difficulty role); the 5×5 walls
  landing at 0-15% greedy (a genuinely brutal, frequent gauntlet, as
  intended); and **zero generation fallbacks observed across the full
  L1-3000 range** in the latest run. Caveat: the greedy bot is a
  deliberately simple 1-ply proxy for burst-avoidance only — a real human
  doing genuine short-lookahead planning likely does meaningfully better at
  4×4+ than this bot, and the bot can't measure arithmetic load at all, so
  its win rates are a pessimistic floor on ONE dimension of difficulty, not
  a literal prediction of the full felt experience. Still needs real
  playtesting to confirm the *feel* matches the numbers.

- **At most one full (at-cap) cell to start, and it must be SAFE to tap.** A full
  cell is the obvious "tap first" focal point; more than one, or one that bursts a
  neighbour, makes the opening either obvious or an unfair trap.

- **Generation is FORWARD + verified.** Place a full board directly, then check
  it's winnable with an exact solver (memoised DFS; the board drains so it's
  bounded). The older backward generator had a density ceiling and couldn't make
  full low-cap boards. Solver budget is capped (20000) so generation stays fast
  (~3ms on 3×3, ~40ms on full 5×5 in V8/JS).

- **Cascade animation steps through per-burst frames** so the chain visibly
  travels from the tapped cell outward — the logic was always correct, but
  revealing the whole overflowed board at once made distant bursts look like bugs.

- **A bursting cell's number is coloured `burst` (`numBurst` in `Cell.jsx`).**
  Full/green cells already colour their number to match the state (`numFull`
  = signal, `numGreen` = ok); burst previously fell through to the plain
  `ink` colour with no override. Added for consistency across all three
  highlighted states — surfaced while building the app icon (`assets/`),
  which mirrors each cell state's real fill/border/number triple.

- **Monetization: AdMob (`src/ads/`). No banner ad — Leon decided against
  one, so the module only ever shows full-screen ads.** `App.js` fires
  `initAds()` on launch (fire-and-forget) purely to give consent/init/
  preloading a head start — removing the banner also silently removed the
  only thing that used to trigger `initAds()` early (it used to mount with
  the Menu screen), and `showInterstitial()` gives that FIRST-ever
  interstitial request zero wait time for a load in progress (by design —
  gameplay should never stall on a slow ad). Without the launch-time
  trigger, the level-10 interstitial reliably found nothing loaded yet and
  silently showed nothing — caught when Leon installed a build and the ads
  seemed to just be missing. Interstitial that
  plays automatically the moment every 10th level is cleared (Menu/Continue
  stay disabled until it closes, so it can't be dodged; never mid-board,
  never on the Daily; if none is preloaded it's simply skipped — gameplay
  never waits on an ad). **Rewarded "continue" after a
  loss**, once per board attempt: ladder/daily-by-lives restores
  `continueLivesForGrid(n)` lives (half the normal count, rounded up) on the
  same board; a Daily *timeout* instead grants +50% of that mode's time limit.
  Because a continue can undo a loss, `useGame({ offerContinue })` **defers
  reporting the loss** (stats/daily results) until the player commits
  (retry, new board, leaving the screen) — otherwise a saved board would
  record a loss AND a win. `useCountdown.elapsedMs` includes bonus time so a
  run finished after an extension isn't recorded as faster than it was. In
  `__DEV__` without the native module (web/Expo Go) the rewarded stub grants
  instantly so the flow is testable. Consent (UMP) runs before ads init;
  Settings shows "Ad privacy" only where the form was required. Privacy policy
  draft: `docs/privacy-policy.md` (placeholders to fill). Real Android AdMob
  app ID + both unit IDs (interstitial, rewarded) are in (`app.json` plugin +
  `REAL_UNIT_IDS` in `src/ads/index.js`) — Android's ad wiring is done.
  **Still needed before publishing:** both iOS IDs, once the Apple stage
  starts.

  **`preview` builds force Google's TEST ad units, real production builds
  don't** — `eas.json`'s `preview` profile sets
  `EXPO_PUBLIC_FORCE_TEST_ADS=true`, read in `src/ads/index.js`'s
  `unitIdFor()`. Found necessary the hard way: Leon tested a `preview` build
  with real unit IDs and got "no ad available" on both interstitial and
  rewarded — with no way to tell whether that meant a code bug or just "the
  AdMob app has no fill yet" (real ad serving needs the AdMob app linked to
  a live Play Store listing, which can't happen until Play Console
  identity verification clears — see the AdMob preview-build
  troubleshooting elsewhere in this doc). Test units are unconditional
  (always show, labelled "Test Ad" on screen), so forcing them for internal
  testing builds actually isolates "is the integration broken" from
  "is the account not linked yet." Same env var also unlocks the Ad
  Inspector row in Settings (`isAdInspectorAvailable()`) without needing a
  dev build.

  **`react-native-google-mobile-ads` is pinned to `16.3.4`, NOT latest —
  TWO separate incompatibilities ruled out everything from `16.4.0` up.**
  - `17.0.0`+ fails to compile: a genuine bug in the library's own native
    Kotlin (`ReactNativeGoogleMobileAdsNativeModule.kt`: `getString()`
    returns nullable but is passed to a non-null `promise.reject()` param).
    `17.x` also requires `react-native >=0.86.0`, well past what this Expo
    SDK ships, so it can't even be installed here right now regardless.
  - `16.4.0`/`16.5.0` ALSO fail to compile, for an unrelated reason: both
    pin the native `com.google.android.gms:play-services-ads` SDK at
    `25.4.0` (see `sdkVersions.android.googleMobileAds` in the library's own
    `package.json` — that's what actually selects the native dependency
    version, `android/build.gradle` just reads it), and that specific
    Google-side release was compiled with a newer Kotlin than this project's
    toolchain can read (`Module was compiled with an incompatible version of
    Kotlin. The binary version of its metadata is 2.3.0, expected version is
    2.1.0`) — nothing to do with react-native-google-mobile-ads's own code
    this time.
  - `16.0.0`-`16.3.4` pin the older `play-services-ads:25.0.0`, which
    doesn't have that Kotlin-metadata problem, and none of them carry the
    `17.x` source bug either. `16.3.4` is the newest of that safe range and
    exposes the same API this app uses.
  - Don't bump this package without checking BOTH things again for whatever
    Expo SDK / Kotlin toolchain is current by then — check
    `npm view react-native-google-mobile-ads@<version> sdkVersions.android.googleMobileAds`
    before trying a newer release.

- **One-time "Remove ads" purchase (`src/purchases/`, RevenueCat).** Removes
  the banner and the level-clear interstitials only — Leon chose to KEEP the
  rewarded continue / extra-time ads as optional (so consent + the ads SDK
  still run for buyers). Entitlement id `no_ads`; the last known value is
  cached in AsyncStorage (`overflow:iap:v1`) so offline launches still know a
  buyer, and RevenueCat overwrites it whenever reachable (handles refunds).
  `purchasesReady` is awaited before any banner/interstitial decision so a
  buyer never sees a flash of ads. Settings has the buy row (localised store
  price) + Restore purchases (Apple requires it); both hidden where purchases
  aren't configured. In `__DEV__` without keys/native module a local stub
  "buys" instantly (Settings shows a "clear test purchase" link). **To go
  live:** create the product in Play Console (needs a build uploaded first) /
  App Store Connect, add it + entitlement `no_ads` to a RevenueCat offering,
  link the Play service-account key, then paste the PUBLIC SDK keys into
  `REVENUECAT_KEYS` in `src/purchases/index.js`. Price is set in the store
  consoles, not in code (Apple only offers tiers, so £4.99 rather than £5.00).

- **Leaderboards (`src/leaderboards/`, Google Play Games Services).**
  Android-only for now — Leon explicitly chose platform-native leaderboards
  over a custom backend (no login screen to build: Play Games' own native
  account sheet IS the "sign in with Google"; free; no hosting). Game Center
  (iOS) is a deliberately deferred follow-up, once there's an actual iOS
  build — `isLeaderboardsAvailable()`/`isDailyLeaderboardAvailable()` both
  return false on iOS/web today, so the leaderboard rows in Menu/Daily Hub
  just don't render there, not a crash. Entry points: the Menu's ladder
  leaderboard card, and a trophy button per tier on the Daily Hub. NOT on
  `DailyChallengeScreen` itself (Leon: nobody's checking a leaderboard
  mid-attempt) — view the tier's board from the Hub before or after playing.
  - **Ladder:** one persistent leaderboard, submitted on every win
    (`GameScreen`) — Play Games only keeps a player's BEST score per
    leaderboard, so no "is this a new best?" check was needed on our side.
  - **Daily challenge:** one persistent leaderboard PER DIFFICULTY TIER
    (times aren't comparable across tiers — different board size/caps), lower
    ms = better, submitted on every daily win (`DailyChallengeScreen`). Play
    Games' own leaderboard UI has a built-in Today/This Week/All Time toggle,
    so a single persistent leaderboard doubles as "today's" board with zero
    extra plumbing — the one known gap is that Google's "Today" boundary is
    its own (likely UTC), not the local-midnight boundary the rest of the
    Daily Challenge already uses (see `useDailyStats.js`'s `localDateStr`),
    so a player right around midnight could see a mismatch. Accepted as
    minor, non-blocking.
  - **No custom config plugin shipped by the library** — `plugins/withPlayGames.js`
    was written from scratch (same shape as `react-native-google-mobile-ads`'s
    bundled plugin) to inject the Play Games `APP_ID` into
    `AndroidManifest.xml` via a `strings.xml` indirection, since a managed
    Expo project regenerates `android/` from scratch every build. No-ops
    entirely while `appId` is `null` in `app.json`'s plugin entry.
  - **Anti-cheat:** flagged to and accepted by Leon — a leaderboard fed by
    client-reported level/time is only as honest as the client, same
    exposure most mobile game leaderboards (including Game Center's) accept
    without extra server-side validation.
  - **To go live:** Play Games Services setup in Play Console (Grow users ->
    Play Games Services) — itself blocked right now on the pending developer
    identity verification (see the AdMob preview-build troubleshooting
    above for that whole saga) — then create the ladder leaderboard + one
    leaderboard per daily tier there, paste their IDs into
    `LEVEL_LEADERBOARD_ID`/`DAILY_LEADERBOARD_IDS` in
    `src/leaderboards/index.js`, and the real Play Games `APP_ID` into
    `app.json`'s `withPlayGames` plugin entry.

- **App launch: native splash + daily-board preload, both fixed after a real
  device showed the app launching badly (blank window, then a mis-rendered
  frame with the top/bottom cut off, then it settles).**
  - **The native splash was never actually showing, on this SDK, at all.**
    Expo SDK 54 REMOVED the legacy top-level `"splash"` key in `app.json` in
    favour of the `expo-splash-screen` config plugin — which this project
    never had installed. That top-level key had been silently doing nothing
    this whole time (not a regression from anything recent), leaving a bare
    native window for however long JS took to boot — exactly the "blank for
    a couple of seconds" gap. Fixed: `expo-splash-screen` installed, its
    plugin configured in `app.json` (dark `#1B1A17` background + the same
    splash mark), and `App.js` now explicitly holds it with
    `preventAutoHideAsync()` (called at module scope, before first render)
    until fonts finish loading, then `hideAsync()`.
  - **The daily-board preload (added right before this) was the other half
    of the bug** — Expert/Master's board generation is a genuinely heavy
    synchronous JS-thread block (exact solver, see the leaderboards/daily
    section above), and starting the staggered warm-up the instant `App`
    mounted raced React's own initial mount/layout — the thread being busy
    generating a board interrupted that layout pass mid-flight, which is
    what showed up as insets applying late (top/bottom "cut off") right
    after launch. Fixed with a second layer of deferral:
    `InteractionManager.runAfterInteractions()` now delays the WHOLE
    staggered sequence until after the app's initial mount/layout/
    animations have actually settled, on top of the existing `setTimeout(0)`
    between individual tiers (which only yielded the thread between tiers,
    not before the first one).

### Open questions (not yet decided)
- Unlimited same-level retries may make losing feel stakeless vs Arrows' fail
  limit. Possible middle grounds: a few retries before reset, or a "best level
  reached" to protect. Not yet resolved — worth playtesting.
- Retry currently gives a NEW board at the same level (skill focus), not the
  identical board (learn-from-mistake). Small change if the other is preferred.

---

## Current state of the build

**The engine is done and validated.** `src/engine/index.js` is pure, DOM-free,
framework-independent game logic: generation, exact solver, cascade resolution,
full-board packing, the level curve, and the new/next/retry lifecycle. State is a
plain serialisable object `{ n, ratio, cells[], caps[], level, lives, taps,
status }`. Every operation returns a fresh state (no mutation). `src/engine/test.js`
has 86 passing tests (`npm test`).

**The Expo app scaffold is done** (this is an Expo / React Native project, one
codebase for iOS + Android):
- `src/state/useGame.js` — the hook bridging engine → UI: frame-by-frame cascade
  animation, haptics on tap/burst, AsyncStorage persistence of level + stats,
  win advances level, loss offers Try again.
- `src/components/Board.jsx`, `Cell.jsx`, `Hud.jsx` — render from engine state.
- `src/screens/GameScreen.jsx` — assembles it.
- `src/theme.js` — the graph-paper / ink visual language, in one place.
- `App.js`, `index.js`, `package.json`, `app.json`, `babel.config.js` — config.

Verified offline: all 36 engine tests pass in-app, all imports resolve, all files
are syntactically sound. NOT yet verified: `npm install` and rendering on a real
device (the previous environment had no network). **First thing to do in Cowork:
`npm install` then `npm start`, and run it in Expo Go to confirm it renders.**

---

## Roadmap

- **Step 1 — Extract engine.** DONE.
- **Step 2 — Scaffold Expo app.** DONE (this folder).
- **Step 3 — Feel & meta (NEXT):**
  - Sound effects (tap, burst, win).
  - First-run onboarding / tutorial (level 1 full 3×3 is already the gentle
    on-ramp; wants a light guided first board).
  - Stats + achievements screen (Leon wanted this from the start; keep scope
    tight — best level, boards cleared, streaks, a handful of achievements).
- **Step 4 — Ship prep:**
  - App icon, splash, adaptive icon (the `assets/` folder is currently empty).
  - Store screenshots, privacy policy.
  - Apple Developer account ($99/yr), Google Play account ($25 one-time).
  - Change the placeholder bundle IDs in `app.json` (`com.yourname.overflow`).
  - Build + submit via Expo (EAS).

---

## Who / working style

Leon — QA / test-automation engineer, comfortable with JS/npm/React tooling,
based in Brighton UK. This whole game was designed collaboratively through
simulation-driven playtesting: propose a change, measure win rates / threat
density / fairness with quick scripts, keep what works. He values honesty about
tradeoffs over agreement, catches design flaws by playing, and has good
instincts (the fully-packed-board breakthrough was his). Match that: test claims
before asserting them, be straight about what's a real limit vs a tuning knob,
and don't over-polish or pad.
