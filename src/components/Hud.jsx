import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { MAX_LIVES } from '../engine';

// `firstLabel`/`firstValue`/`danger` let the daily challenge reuse this same
// 3-stat layout with a countdown in place of the level number (e.g.
// firstLabel="Time" firstValue={formatClock(remainingMs)}) — both default to
// today's exact ladder output when omitted. `maxLives` defaults to the 3x3
// count too, but callers should pass `Engine.livesForGrid(state.n)` since
// lives now scale with grid size (5 at 4x4, 7 at 5x5, 10 at 6x6).
export default function Hud({ level, lives, streak, firstLabel = 'Level', firstValue, danger, maxLives = MAX_LIVES }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const firstV = firstValue != null ? firstValue : String(level);
  // Icon size/spacing shrink once there are more hearts than the original
  // 3x3 layout was designed for, so a 10-heart 6x6 row still fits.
  const heartSize = maxLives > 8 ? 13 : maxLives > 5 ? 16 : 20;
  const heartGap = maxLives > 8 ? 1 : 2;
  return (
    <View style={styles.row}>
      <Stat styles={styles} k={firstLabel} v={firstV} danger={danger} />
      <Stat styles={styles} k="Streak" v={String(streak)} />
      <View style={styles.stat}>
        <Text style={styles.k}>Lives</Text>
        <View style={styles.hearts}>
          {Array.from({ length: maxLives }, (_, i) => (
            <Ionicons
              key={i}
              name={i < lives ? 'heart' : 'heart-outline'}
              size={heartSize}
              color={i < lives ? theme.color.heart : theme.color.vesselEdge}
              style={[styles.heart, { marginHorizontal: heartGap }]}
            />
          ))}
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
    hearts: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 4, maxWidth: 120 },
    heart: { marginVertical: 1 },
  });
}
