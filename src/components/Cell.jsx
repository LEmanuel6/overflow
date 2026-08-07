import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

const COUNT_TICK_MS = 26;     // interval between count-up ticks — fast, not delaying play
const COUNT_MAX_TICKS = 8;    // cap ticks so a big jump still finishes quickly
const POPUP_LIFE_MS = 650;    // how long a floating "+N" lives before it's removed
const WIPE_FADE_MS = 480;     // win-wipe per-cell fade duration
const REVEAL_FADE_MS = 360;   // board-load reveal per-cell fade duration
const POP_UP_MS = 90;         // burst pop: quick bulge...
const POP_DOWN_MS = 170;      // ...then shrink away

// One board cell. Shows its value and its cap (value/cap), styled by state:
//  - empty: faint solid outline
//  - at cap: amber
//  - over cap: oxide red — driven by the LIVE animated number, so it turns
//    red the instant the count-up actually crosses the cap, then pops
//  - green (pushes nothing): green
// Below that, a small "→N" shows how much this cell would leak to EACH
// neighbour if tapped now (floor(value*ratio/4)).
//
// Animation (self-contained, driven purely by watching the `value` prop):
//  - when value RISES within the same board, the displayed number counts up
//    (not an instant jump) and a "+N" pops up above the cell, rises, fades.
//  - when a new board loads (`boardId` changes), the number/count-up state
//    snaps instantly, but the cell itself starts hidden and sweeps in via
//    `isRevealing` (see runBoardReveal in useGame.js) rather than popping in.
//  - `isWiping` (win-sweep) fades the whole cell out for the wave-clear.
function Cell({ value, cap, push, size, boardId, isGreen, isBursting, isWiping, isRevealing, locked, onPress }) {
  const empty = value === 0;
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [displayValue, setDisplayValueState] = useState(value);
  const [popups, setPopups] = useState([]);
  const trueValueRef = useRef(value);
  const curValueRef = useRef(value);
  const boardIdRef = useRef(boardId);
  const countIntervalRef = useRef(null);
  const popupIdRef = useRef(0);
  const timeoutsRef = useRef([]);
  const fadeOpacity = useRef(new Animated.Value(1)).current;
  const revealOpacity = useRef(new Animated.Value(1)).current;
  const popScale = useRef(new Animated.Value(1)).current;

  const setDisplayValue = (v) => { curValueRef.current = v; setDisplayValueState(v); };
  const scheduleRemovePopup = (id) => {
    const t = setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), POPUP_LIFE_MS);
    timeoutsRef.current.push(t);
  };
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
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      setPopups([]);
      setDisplayValue(value);
      fadeOpacity.setValue(1);
      revealOpacity.setValue(0);
      return;
    }
    if (value === trueValueRef.current) return;
    if (value > trueValueRef.current) {
      const delta = value - trueValueRef.current;
      const id = popupIdRef.current++;
      setPopups((p) => [...p, { id, amount: delta }]);
      scheduleRemovePopup(id);
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
    timeoutsRef.current.forEach(clearTimeout);
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

  // Scale text to the cell — boards can grow well past 5x5, shrinking `size`.
  const numSize = Math.max(10, Math.min(31, size * 0.41));
  const capSize = Math.max(7, Math.min(16, size * 0.24));
  const pushSize = Math.max(7, Math.min(13, size * 0.20));
  const popupSize = Math.max(10, Math.min(17, size * 0.27));

  return (
    <Pressable
      onPress={empty || locked ? undefined : onPress}
      style={[styles.cell, { width: size, height: size }]}
      android_disableSound
    >
      <View style={[styles.outline, borderStyle]}>
        <Animated.View style={[styles.fill, fillStyle, { opacity: Animated.multiply(fadeOpacity, revealOpacity), transform: [{ scale: popScale }] }]}>
          {!empty && (
            <>
              <View style={styles.row}>
                <Text style={[styles.num, { fontSize: numSize }, atCap && styles.numFull, isGreen && styles.numGreen]}>
                  {displayValue}
                </Text>
                <Text style={[styles.cap, { fontSize: capSize }]}>/{cap}</Text>
              </View>
              {!isGreen && (
                <Text style={[styles.push, { fontSize: pushSize }]}>{'→'}{push}</Text>
              )}
            </>
          )}
          {popups.map((p) => (
            <FloatingDelta key={p.id} amount={p.amount} fontSize={popupSize} styles={styles} />
          ))}
        </Animated.View>
      </View>
    </Pressable>
  );
}

// A "+N" that appears above the cell, rises, and fades away.
function FloatingDelta({ amount, fontSize, styles }) {
  const anim = useRef(new Animated.Value(0)).current;
  const jitter = useRef((Math.random() - 0.5) * 10).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: POPUP_LIFE_MS, useNativeDriver: true }).start();
  }, [anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -24] });
  const opacity = anim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] });

  return (
    <Animated.Text
      style={[
        styles.floatDelta,
        { fontSize, opacity, transform: [{ translateX: jitter }, { translateY }] },
      ]}
    >
      +{amount}
    </Animated.Text>
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
    row: { flexDirection: 'row', alignItems: 'flex-end' },
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
    cap: { fontFamily: theme.font.bold, fontSize: 14, color: theme.color.inkSoft, marginBottom: 2, opacity: 0.75 },
    push: { fontFamily: theme.font.semiBold, color: theme.color.inkSoft, opacity: 0.65, marginTop: 1 },
    floatDelta: {
      position: 'absolute', top: 0, alignSelf: 'center',
      fontFamily: theme.font.bold, color: theme.color.signal,
      zIndex: 5, elevation: 5,
    },
  });
}

export default React.memo(Cell);
