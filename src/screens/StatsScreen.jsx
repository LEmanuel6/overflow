import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import Tray from '../components/Tray';
import { formatNumber, formatDuration, formatPercent } from '../utils/format';

export default function StatsScreen({ stats, onBack, onHome, onStats, onAchievements, onSettings }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const tierRows = Object.keys(stats.clearedByTier)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => ({ k: `${n}×${n} cleared`, v: formatNumber(stats.clearedByTier[n]) }));

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader theme={theme} title="STATS" onBack={onBack} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Section styles={styles} title="Progress" rows={[
          { k: 'Best level', v: formatNumber(stats.best) },
          { k: 'Boards cleared', v: formatNumber(stats.boardsCleared) },
          { k: 'Boards lost', v: formatNumber(stats.boardsLost) },
          { k: 'Win rate', v: formatPercent(stats.boardsCleared, stats.gamesPlayed) },
          { k: 'Current streak', v: formatNumber(stats.currentStreak) },
          { k: 'Best streak', v: formatNumber(stats.bestStreak) },
        ]} />

        <Section styles={styles} title="Grid sizes" rows={[
          { k: 'Highest grid reached', v: `${stats.highestGridSize}×${stats.highestGridSize}` },
          ...tierRows,
        ]} />

        <Section styles={styles} title="Skill" rows={[
          { k: 'Flawless clears', v: formatNumber(stats.flawlessClears) },
          { k: 'Best flawless streak', v: formatNumber(stats.bestFlawlessStreak) },
          { k: 'Longest chain', v: formatNumber(stats.longestChain) },
          { k: 'Fewest taps to clear', v: stats.fewestTapsToClear == null ? '—' : formatNumber(stats.fewestTapsToClear) },
          { k: 'Most lives kept on a clear', v: formatNumber(stats.mostLivesRemainingOnClear) },
          { k: 'Narrowest win (lives left)', v: stats.narrowestWinLives == null ? '—' : formatNumber(stats.narrowestWinLives) },
        ]} />

        <Section styles={styles} title="Volume" rows={[
          { k: 'Total taps', v: formatNumber(stats.totalTaps) },
          { k: 'Total bursts', v: formatNumber(stats.totalBursts) },
          { k: 'Total cascades', v: formatNumber(stats.totalCascades) },
          { k: 'Total lives lost', v: formatNumber(stats.totalLivesLost) },
        ]} />

        <Section styles={styles} title="Time & sessions" rows={[
          { k: 'Total playtime', v: formatDuration(stats.totalPlaytimeMs) },
          { k: 'Sessions played', v: formatNumber(stats.sessionsPlayed) },
          { k: 'Days played', v: formatNumber(stats.daysPlayed.length) },
          { k: 'Day streak', v: formatNumber(stats.dayStreak) },
          { k: 'Best day streak', v: formatNumber(stats.bestDayStreak) },
          { k: 'Fastest clear', v: formatDuration(stats.bestClearTimeMs) },
        ]} />

        <Section styles={styles} title="Flavor" rows={[
          { k: 'Comeback wins', v: formatNumber(stats.comebackWins) },
          { k: 'Green-thumb clears', v: formatNumber(stats.greenThumbClears) },
        ]} />
      </ScrollView>
      <Tray theme={theme} active="stats" onHome={onHome} onStats={onStats} onAchievements={onAchievements} onSettings={onSettings} />
    </SafeAreaView>
  );
}

function Section({ styles, title, rows }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.list}>
        {rows.map((r) => (
          <View key={r.k} style={styles.row}>
            <Text style={styles.k}>{r.k}</Text>
            <Text style={styles.v}>{r.v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.color.paper },
    scroll: { flex: 1 },
    container: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 24 },
    section: { width: '100%', maxWidth: 420, marginBottom: 20 },
    sectionTitle: {
      fontFamily: theme.font.bold, fontSize: 18, color: theme.color.inkSoft,
      textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6,
    },
    list: { borderTopWidth: 1, borderColor: theme.color.gridLine },
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1, borderColor: theme.color.gridLine,
    },
    k: { fontFamily: theme.font.regular, fontSize: 18, color: theme.color.inkSoft, flexShrink: 1, paddingRight: 12 },
    v: { fontFamily: theme.font.bold, fontSize: 18, color: theme.color.ink },
  });
}
