import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

const COUNT_TICK_MS = 26;     // interval between count-up ticks — fast, not delaying play
const COUNT_MAX_TICKS = 8;    // cap ticks so a big jump still finishes quickly
const WIPE_FADE_MS = 480;     // win-wipe per-cell fade duration
const REVEAL_FADE_MS = 420;   // board-load reveal per-cell fade duration
const POP_UP_MS = 90;         // burst pop: quick bulge...
const POP_DOWN_MS = 170;      // ...then shrink away

// One board cell. Shows its value, styled by state:
//  - empty: faint solid outline
//  - at cap: amber
//  - over cap: oxide red — driven by the LIVE animated number, so it turns
//    red the instant the count-up actually crosses the cap, then pops
//  - green (pushes nothing): green
// A thin fill bar along the bottom shows how close value is to cap — this
// replaced a literal "/cap" fraction + a "→push" readout (how much this
// cell would leak to each neighbour if tapped now): three numbers per cell
// read as clutter, so cap became a visual fill level instead, and push
// was dropped outright (the floating "+N" popup already shows it live
// when a neighbour actually receives it).
//
// Animation (self-contained, driven purely by watching the `value` prop):
//  - when value RISES within the same board, the displayed number counts up
//    (not an instant jump) and a "+N" pops up above the cell, rises, fades.
//  - when a new board loads (`boardId` changes), the number/count-up state
//    snaps instantly, but the cell itself starts hidden and sweeps in via
//    `isRevealing` (see runBoardReveal in useGame.js) rather than popping in.
//  - `isWiping` (win-sweep) fades the whole cell out for the wave-clear.
function Cell({ value, cap, push, size, boardId, isGreen, isBursting, isWiping, isRevealing, locked, index, onTapCell }) {
  // Bound here (not by Board passing a pre-bound onPress) so Board can hand
  // every Cell the SAME onTapCell reference instead of a fresh `() =>
  // onTapCell(i)` closure per cell per render — that per-cell closure would
  // have a new identity every single Board render, defeating this
  // component's own React.memo below every time Board re-rendered (e.g. the
  // Daily Challenge's per-frame countdown tick re-rendering the whole screen
  // — see DailyChallengeScreen.jsx).
  const handlePress = useCallback(() => onTapCell(index), [onTapCell, index]);
  const empty = value === 0;
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [displayValue, setDisplayValueState] = useState(value);
  const trueValueRef = useRef(value);
  const curValueRef = useRef(value);
  const boardIdRef = useRef(boardId);
  const countIntervalRef = useRef(null);
  const fadeOpacity = useRef(new Animated.Value(1)).current;
  // Starts HIDDEN (0), not 1 — a fresh board entrance (GameScreen/
  // DailyChallengeScreen both fully unmount+remount on every navigation,
  // unlike the ladder's level-to-level continueNext, which updates an
  // already-mounted tree) used to rely on a useLayoutEffect reactively
  // setting this to 0 before the first paint, racing the boardId bump
  // against React Native's native view-mounting commit. Mounting brand-new
  // native views is heavier than updating existing ones, so that race could
  // lose specifically on a fresh mount — the board would flash fully visible
  // for a frame before snapping hidden and sweeping in. Starting hidden by
  // default removes the race entirely: there's nothing to "catch up" on the
  // first frame. The existing isRevealing-driven fade-in below still brings
  // it to 1 on its own, independent of any boardId timing.
  const revealOpacity = useRef(new Animated.Value(0)).current;
  const popScale = useRef(new Animated.Value(1)).current;
  // Brief highlight when this cell RECEIVES value (from a tap or a
  // neighbour's burst) — replaced a floating "+N" popup. Quick up, slower
  // fade down, same shape as the burst pop below but on fill/border
  // brightness rather than scale, so "something changed here" reads as
  // part of the board's own visual language instead of another number.
  const receiveGlow = useRef(new Animated.Value(0)).current;

  const setDisplayValue = (v) => { curValueRef.current = v; setDisplayValueState(v); };
  const startCountUp = (from, to) => {
    if (countIntervalRef.current) clearInterval(countIntervalRef.current);
    const delta = to - from;
    if (delta <= 0) { setDisplayValue(to); return; }
    const steps = Math.min(delta, COUNT_MAX_TICKS);
    const stepSize = delta / steps;
    let i = 0;
    countIntervalRef.current = setInterval(() => {
      i++;
      if (i >= steps) {
        clearInterval(countIntervalRef.current);
        countIntervalRef.current = null;
        setDisplayValue(to);
      } else {
        setDisplayValue(Math.round(from + stepSize * i));
      }
    }, COUNT_TICK_MS);
  };

  // useLayoutEffect (not useEffect) so the fresh-board correction below lands
  // before the browser/native paints — otherwise the old displayValue (e.g.
  // "0" from the just-cleared board) and old revealOpacity briefly render
  // against the NEW value/isGreen props for one frame: a flash of stray
  // numbers before the sweep-in fixes it.
  useLayoutEffect(() => {
    if (boardId !== boardIdRef.current) {
      // fresh board — the number/count-up state snaps instantly (nothing here
      // is a "transfer"), but the cell itself starts hidden and sweeps in via
      // isRevealing below, rather than popping straight into view.
      boardIdRef.current = boardId;
      trueValueRef.current = value;
      if (countIntervalRef.current) { clearInterval(countIntervalRef.current); countIntervalRef.current = null; }
      setDisplayValue(value);
      fadeOpacity.setValue(1);
      revealOpacity.setValue(0);
      receiveGlow.setValue(0);
      return;
    }
    if (value === trueValueRef.current) return;
    if (value > trueValueRef.current) {
      Animated.sequence([
        Animated.timing(receiveGlow, { toValue: 0.18, duration: 80, useNativeDriver: true }),
        Animated.timing(receiveGlow, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
      startCountUp(curValueRef.current, value);
    } else {
      setDisplayValue(value); // drained/emptied — snap, no animation
    }
    trueValueRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, boardId]);

  useEffect(() => {
    if (isWiping) {
      Animated.timing(fadeOpacity, { toValue: 0, duration: WIPE_FADE_MS, useNativeDriver: true }).start();
    }
    // No "else, reset to 1" here on purpose: every cell goes through the wipe
    // now (see runWinWipe), so by the time isWiping flips back to false the
    // cell's value is already 0 and its fill is already transparent in that
    // same render. Snapping fadeOpacity back to 1 imperatively raced the
    // (JS-thread, non-native-driven) backgroundColor-to-transparent update on
    // real devices — the opacity jump landed before the colour caught up,
    // flashing the cell's old fill at full opacity for a frame. The next
    // board's boardId effect below resets fadeOpacity when one actually loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWiping]);

  // Board-load sweep-in — a separate Animated.Value from the wipe's, so the
  // two never fight over the same one; the render below multiplies them.
  useEffect(() => {
    if (isRevealing) {
      Animated.timing(revealOpacity, { toValue: 1, duration: REVEAL_FADE_MS, useNativeDriver: true }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRevealing]);

  // Burst pop: a quick bulge then a shrink-away, timed to land once the
  // over-the-cap number has already had a moment to be read (see the
  // rise-then-pop pacing in useGame.js).
  useEffect(() => {
    if (isBursting) {
      popScale.setValue(1);
      Animated.sequence([
        Animated.timing(popScale, { toValue: 1.22, duration: POP_UP_MS, useNativeDriver: true }),
        Animated.timing(popScale, { toValue: 0, duration: POP_DOWN_MS, useNativeDriver: true }),
      ]).start();
    } else {
      popScale.setValue(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBursting]);

  useEffect(() => () => {
    if (countIntervalRef.current) clearInterval(countIntervalRef.current);
  }, []);

  // Colour tracks the LIVE animated number, not the final target value — so a
  // cell goes red the instant its rising count-up actually crosses the cap,
  // ahead of (and independent from) the burst pop that follows it.
  const over = !empty && displayValue > cap;
  const atCap = !empty && !over && displayValue >= cap;
  // Border and fill are split across two layers (see render) so the grid
  // outline is a permanent fixture — visible in play, mid-wipe, or waiting on
  // the next board — while only the fill/content fades for those animations.
  // The outline itself also sweeps back to the default grid colour rather
  // than holding its old state colour throughout: it's neutral while wiping
  // out and while waiting for the reveal wave to reach it, only showing the
  // real state colour once settled.
  const settled = !isWiping && isRevealing;
  const borderStyle = (empty || !settled)
    ? styles.borderEmpty
    : over
      ? styles.borderBurst
      : isGreen
        ? styles.borderGreen
        : atCap
          ? styles.borderFull
          : styles.borderFilled;
  const fillStyle = empty
    ? styles.fillEmpty
    : over
      ? styles.fillBurst
      : isGreen
        ? styles.fillGreen
        : atCap
          ? styles.fillFull
          : styles.fillFilled;

  // Scale text to the cell — boards can grow well past 5x5, shrinking `size`,
  // or well past a phone's old 420-wide cap on a tablet, growing it. Ceilings
  // raised to match (were tuned for a 420-wide board's largest cell; the
  // board can now reach 560 — see Board.jsx's BOARD_MAX_WIDTH) so a bigger
  // cell gets bigger text instead of the same small number floating in a
  // larger empty box.
  const numSize = Math.max(10, Math.min(38, size * 0.41));

  return (
    <Pressable
      onPress={empty || locked ? undefined : handlePress}
      style={[styles.cell, { width: size, height: size }]}
      android_disableSound
    >
      <View style={[styles.outline, borderStyle]}>
        <Animated.View style={[styles.fill, fillStyle, { opacity: Animated.multiply(fadeOpacity, revealOpacity), transform: [{ scale: popScale }] }]}>
          {!empty && (
            <>
              <Text style={[styles.num, { fontSize: numSize }, atCap && styles.numFull, isGreen && styles.numGreen, over && styles.numBurst]}>
                {displayValue}
              </Text>
              <View style={styles.fullnessTrack}>
                <View
                  style={[
                    styles.fullnessFill,
                    over ? styles.fullnessBurst : atCap ? styles.fullnessFull : isGreen ? styles.fullnessGreen : styles.fullnessFilled,
                    { width: `${Math.min(1, displayValue / cap) * 100}%` },
                  ]}
                />
              </View>
            </>
          )}
          <Animated.View style={[styles.receiveGlow, { opacity: receiveGlow }]} pointerEvents="none" />
        </Animated.View>
      </View>
    </Pressable>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    cell: {
      margin: 2,
    },
    // Outline is a permanent, non-animated frame — always drawn, regardless of
    // play/wipe/reveal state (see borderStyle above). Fill is the animated
    // layer inside it that actually fades for the wipe/reveal.
    outline: {
      flex: 1,
      borderWidth: 1.5,
      borderRadius: theme.radius,
      overflow: 'hidden',
    },
    fill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    borderFilled: { borderColor: theme.color.vesselEdge },
    borderEmpty: { borderColor: theme.color.gridLine },
    borderFull: { borderColor: theme.color.signal },
    borderGreen: { borderColor: theme.color.ok },
    borderBurst: { borderColor: theme.color.burst },
    fillFilled: { backgroundColor: theme.color.vessel },
    fillEmpty: { backgroundColor: 'transparent' },
    fillFull: { backgroundColor: theme.color.signalSoft },
    fillGreen: { backgroundColor: theme.color.okSoft },
    fillBurst: { backgroundColor: theme.color.burstSoft },
    num: { fontFamily: theme.font.bold, fontSize: 20, color: theme.color.ink },
    numFull: { color: theme.color.signal },
    numGreen: { color: theme.color.ok },
    numBurst: { color: theme.color.burst },
    // Replaces the old "/cap" + "→push" text — how close a cell is to
    // bursting now reads as a fill level (colour already carries state;
    // this adds "how far along," without a second number to parse).
    fullnessTrack: {
      position: 'absolute', left: 4, right: 4, bottom: 4, height: 6,
      borderRadius: 3, backgroundColor: theme.color.gridLine, overflow: 'hidden',
    },
    fullnessFill: { height: '100%', borderRadius: 3 },
    fullnessFilled: { backgroundColor: theme.color.inkSoft },
    fullnessFull: { backgroundColor: theme.color.signal },
    fullnessGreen: { backgroundColor: theme.color.ok },
    fullnessBurst: { backgroundColor: theme.color.burst },
    // Covers the whole cell, fully transparent at rest — receiveGlow (above)
    // animates its opacity for a quick brightening flash.
    receiveGlow: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: theme.color.signal,
    },
  });
}

export default React.memo(Cell);
