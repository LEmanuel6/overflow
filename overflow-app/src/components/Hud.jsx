import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { MAX_LIVES } from '../engine';

export default function Hud({ level, lives, best }) {
  const hearts = '\u2665'.repeat(Math.max(0, lives)) + '\u2661'.repeat(Math.max(0, MAX_LIVES - Math.max(0, lives)));
  const heartColor = lives <= 1 ? theme.color.burst : lives === 2 ? theme.color.signal : theme.color.ok;
  return (
    <View style={styles.row}>
      <Stat k="Level" v={String(level)} />
      <Stat k="Best" v={String(best)} />
      <View style={styles.stat}>
        <Text style={styles.k}>Lives</Text>
        <Text style={[styles.v, { color: heartColor }]}>{lives > 0 ? hearts : '\u2715'}</Text>
      </View>
    </View>
  );
}

function Stat({ k, v }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', maxWidth: 420, alignSelf: 'center', marginBottom: 16 },
  stat: { alignItems: 'center', flex: 1 },
  k: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.inkSoft, textTransform: 'uppercase', letterSpacing: 1 },
  v: { fontFamily: theme.font.mono, fontSize: 22, fontWeight: '700', color: theme.color.ink, marginTop: 2 },
});
