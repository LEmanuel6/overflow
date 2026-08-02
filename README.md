# Overflow

A minimal, tactile puzzle game. Clear a fully-packed grid by tapping cells —
each tap empties a cell and pushes its value onto its neighbours. Push a cell
over its cap and it bursts, chaining into a cascade that costs lives. Difficulty
scales by level: bigger grids and wider cap ranges, never mindless.

This is an [Expo](https://expo.dev) (React Native) app, so one codebase runs on
both iOS and Android.

## Structure

```
src/
  engine/        The pure game logic (no UI). The validated core.
    index.js       generation, exact solver, cascade, level curve, lifecycle
    test.js        standalone tests — run with `npm test`
  state/
    useGame.js     React hook bridging the engine to the UI: animation,
                   haptics, persistence, win/loss flow
  components/
    Board.jsx      renders the grid from engine state
    Cell.jsx       one cell (value / cap, styled by state)
    Hud.jsx        level, best, lives
  screens/
    GameScreen.jsx ties it together
  theme.js         colours, fonts, spacing (the graph-paper / ink look)
App.js             app entry
```

The engine is deliberately UI-free and framework-independent. It's the asset
everything else is built on; the front-end could be swapped without touching it.

## Running it

You need [Node.js](https://nodejs.org) installed. Then:

```bash
npm install            # install dependencies
npm start              # start the Expo dev server
```

Then either:
- Install **Expo Go** on your phone and scan the QR code (fastest way to see it
  on a real device), or
- press `i` for the iOS simulator / `a` for the Android emulator (requires
  Xcode / Android Studio).

Run the engine tests any time with:

```bash
npm test
```

## What's done / what's next

Done (this scaffold):
- Engine wired into a real, runnable RN app
- Board renders from engine state; taps drive `engine.tap()`
- Cascade animation steps through the engine's per-burst frames
- Haptics on tap and burst
- Lives + level HUD, win advances the level, loss offers "Try again"
- Progress + stats persisted across sessions (AsyncStorage)

Next:
- Sound
- Onboarding / first-run flow
- Stats + achievements screen
- App icon, splash, store screenshots
- Store submission (Apple Developer $99/yr, Google Play $25 one-time)

## Notes

- Bundle identifiers in `app.json` are placeholders (`com.yourname.overflow`) —
  change them to your own before building for the stores.
- `assets/` needs an `icon.png`, `splash.png`, `adaptive-icon.png`, and
  `favicon.png` before a store build; Expo generates sensible defaults during
  development if they're absent.
