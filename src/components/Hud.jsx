import React, { useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';
import { MAX_LIVES } from '../engine';

// Tuned so a single life lost (~a 10-slot bar's smallest step) reads as a
// quick, snappy move, while a multi-burst chain (several lives at once —
// see below) takes proportionally longer rather than covering a much bigger
// distance at the same speed. Clamped at both ends: a floor so even a
// 1-life move doesn't feel instant/twitchy, a ceiling so a huge chain on a
// big grid doesn't stall the bar for a very long time.
const FILL_MS_PER_LIFE = 220;
const FILL_MIN_DURATION = 180;
const FILL_MAX_DURATION = 900;

// `streak` is omitted entirely (not just zeroed) by the daily challenge —
// Leon's call: a "consecutive wins" stat doesn't make sense there, since
// the daily challenge is one attempt-able board per difficulty per day, not
// a session of consecutive board clears the way the ladder is. Only the
// ladder (GameScreen) still passes it, so the row renders 2 stats for daily,
// 3 for the ladder.
//
// `firstLabel`/`firstValue`/`danger` let the daily challenge reuse this same
// stat-row layout with a countdown in place of the level number (e.g.
// firstLabel="Time" firstValue={formatClock(remainingMs)}) — both default to
// today's exact ladder output when omitted. `maxLives` defaults to the 3x3
// count too, but callers should pass `Engine.livesForGrid(state.n)` since
// the underlying capacity still scales with grid size (5 at 4x4, 7 at 5x5,
// 10 at 6x6) — only the visual (a fill bar, not a heart row) and its label
// changed; the mechanic underneath (lose at full) is untouched.
//
// "Lives" never really fit a game about cells overflowing their cap — this
// reads instead as the player's own overflow meter: it fills as bursts
// drain `lives`, same capacity per grid size, same lose-at-full condition,
// just framed as accumulating damage rather than depleting a pool. Leon's
// explicit redesign call, not a renaming of the underlying engine/stats
// code (`lives`, `MAX_LIVES`, `livesForGrid` etc. all keep their names —
// only this HUD's label and visual changed).
//
// The gradient is a fixed-size green->amber->red strip (theme's existing
// ok/signal/burst colours — already used elsewhere for safe/at-cap/bursting,
// so this reuses the app's own established colour meaning rather than
// inventing a new one) spanning the bar's full measured width, REVEALED by
// a clipping wrapper that grows from the left as the bar fills — not a
// gradient recomputed/stretched to the current fill. That's what makes it a
// "reveal": the colour at any given fill level always matches that
// position's true stop on the full green->red strip, rather than the
// visible portion restretching across the whole range every tick.
//
// Grows a reveal wrapper from 0 width (not a full-width gradient covered by
// a shrinking overlay, the earlier approach) — a width-0 clip can never leak
// a sliver of the gradient underneath, where two independently-sized/
// positioned elements (a plain-width gradient + an Animated-width cover)
// could round to slightly different pixel widths and leave a hairline gap
// at the empty end. This was found and fixed after exactly that: a faint
// green strip visible on the left even at zero fill.
//
// The cover's width is Animated, not a plain style number — `lives` arrives
// from useGame already post-cascade (a multi-burst chain updates it ONCE,
// after all its bursts resolve, see tap() in useGame.js), so animating
// straight from the old fill to the new one is naturally a single eased
// move covering however many lives were lost, never a hop per burst. The
// ease-in/ease-out curve (Easing.inOut) is what gives it the "speeds up,
// then slows back down" feel on approach to its new resting spot, rather
// than a constant-speed slide. `boardId` changing (or `maxLives`, e.g. a
// grid-size change) means a brand-new board — that resets the bar to empty
// instantly, never an animated "heal" back down from wherever it was.
export default function Hud({ level, lives, streak, firstLabel = 'Level', firstValue, danger, maxLives = MAX_LIVES, boardId }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const firstV = firstValue != null ? firstValue : String(level);
  const [barWidth, setBarWidth] = useState(0);
  const fillFraction = maxLives > 0 ? Math.max(0, Math.min(1, (maxLives - lives) / maxLives)) : 0;

  const fillAnim = useRef(new Animated.Value(fillFraction)).current;
  const prevRef = useRef({ fillFraction, maxLives, boardId, mounted: false });

  useEffect(() => {
    const prev = prevRef.current;
    if (!prev.mounted) {
      prevRef.current = { fillFraction, maxLives, boardId, mounted: true };
      return;
    }
    const isNewBoard = boardId !== prev.boardId || maxLives !== prev.maxLives;
    if (isNewBoard) {
      fillAnim.setValue(fillFraction);
    } else {
      const livesMoved = Math.round(Math.abs(fillFraction - prev.fillFraction) * maxLives);
      const duration = Math.min(FILL_MAX_DURATION, Math.max(FILL_MIN_DURATION, livesMoved * FILL_MS_PER_LIFE));
      Animated.timing(fillAnim, {
        toValue: fillFraction,
        duration,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false, // animating `width` — not supported by the native driver
      }).start();
    }
    prevRef.current = { fillFraction, maxLives, boardId, mounted: true };
  }, [fillFraction, maxLives, boardId, fillAnim]);

  const revealWidth = barWidth > 0
    ? fillAnim.interpolate({ inputRange: [0, 1], outputRange: [0, barWidth] })
    : 0;

  return (
    <View style={styles.row}>
      <Stat styles={styles} k={firstLabel} v={firstV} danger={danger} />
      {streak != null && <Stat styles={styles} k="Streak" v={String(streak)} />}
      <View style={styles.stat}>
        <Text style={styles.k}>Overflow</Text>
        <View style={styles.track} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
          {barWidth > 0 && (
            <Animated.View
              style={{
                position: 'absolute', left: 0, top: 0, height: '100%',
                width: revealWidth, overflow: 'hidden',
              }}
            >
              <LinearGradient
                colors={[theme.color.ok, theme.color.signal, theme.color.burst]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: barWidth, height: '100%' }}
              />
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
}

function Stat({ styles, k, v, danger }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.k}>{k}</Text>
      <Text style={[styles.v, danger && styles.vDanger]}>{v}</Text>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', maxWidth: 420, alignSelf: 'center', marginBottom: 16 },
    stat: { alignItems: 'center', flex: 1 },
    k: { fontFamily: theme.font.semiBold, fontSize: 14, color: theme.color.inkSoft, textTransform: 'uppercase', letterSpacing: 1 },
    v: { fontFamily: theme.font.bold, fontSize: 22, color: theme.color.ink, marginTop: 2 },
    vDanger: { color: theme.color.burst },
    track: {
      width: '100%', maxWidth: 110, height: 14, marginTop: 6,
      borderRadius: theme.radius, overflow: 'hidden',
      backgroundColor: theme.color.vesselEdge,
    },
  });
}
