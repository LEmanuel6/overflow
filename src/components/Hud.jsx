import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { MAX_LIVES } from '../engine';

export default function Hud({ level, lives, streak }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.row}>
      <Stat styles={styles} k="Level" v={String(level)} />
      <Stat styles={styles} k="Streak" v={String(streak)} />
      <View style={styles.stat}>
        <Text style={styles.k}>Lives</Text>
        <View style={styles.hearts}>
          {Array.from({ length: MAX_LIVES }, (_, i) => (
            <Ionicons
              key={i}
              name={i < lives ? 'heart' : 'heart-outline'}
              size={20}
              color={i < lives ? theme.color.heart : theme.color.vesselEdge}
              style={styles.heart}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function Stat({ styles, k, v }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v}>{v}</Text>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', maxWidth: 420, alignSelf: 'center', marginBottom: 16 },
    stat: { alignItems: 'center', flex: 1 },
    k: { fontFamily: theme.font.semiBold, fontSize: 14, color: theme.color.inkSoft, textTransform: 'uppercase', letterSpacing: 1 },
    v: { fontFamily: theme.font.bold, fontSize: 22, color: theme.color.ink, marginTop: 2 },
    hearts: { flexDirection: 'row', marginTop: 4 },
    heart: { marginHorizontal: 2 },
  });
}
