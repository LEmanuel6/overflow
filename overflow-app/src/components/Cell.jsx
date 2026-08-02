import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { theme } from '../theme';

// One board cell. Shows its value and its cap (value/cap), styled by state:
//  - empty: dashed faint outline
//  - full (at cap): amber
//  - green (pushes nothing): green
//  - bursting: oxide red flash
function Cell({ value, cap, size, isGreen, isFull, isBursting, locked, onPress }) {
  const empty = value === 0;

  const stateStyle = empty
    ? styles.empty
    : isBursting
      ? styles.burst
      : isGreen
        ? styles.green
        : isFull
          ? styles.full
          : styles.filled;

  return (
    <Pressable
      onPress={empty || locked ? undefined : onPress}
      style={[styles.cell, { width: size, height: size }, stateStyle]}
      android_disableSound
    >
      {!empty && (
        <View style={styles.inner}>
          <Text style={[styles.num, isFull && styles.numFull, isGreen && styles.numGreen]}>
            {value}
          </Text>
          <Text style={styles.cap}>/{cap}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    borderWidth: 1.5,
    borderRadius: theme.radius,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
  },
  inner: { flexDirection: 'row', alignItems: 'flex-end' },
  filled: { backgroundColor: theme.color.vessel, borderColor: theme.color.vesselEdge },
  empty: { backgroundColor: 'transparent', borderColor: theme.color.gridLine, borderStyle: 'dashed' },
  full: { backgroundColor: theme.color.signalSoft, borderColor: theme.color.signal },
  green: { backgroundColor: theme.color.okSoft, borderColor: theme.color.ok },
  burst: { backgroundColor: theme.color.burstSoft, borderColor: theme.color.burst },
  num: { fontFamily: theme.font.mono, fontSize: 20, fontWeight: '700', color: theme.color.ink },
  numFull: { color: theme.color.signal },
  numGreen: { color: theme.color.ok },
  cap: { fontFamily: theme.font.mono, fontSize: 11, fontWeight: '600', color: theme.color.inkSoft, marginBottom: 2, opacity: 0.75 },
});

export default React.memo(Cell);
