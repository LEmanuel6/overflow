import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import Tray from '../components/Tray';
import { formatNumber, formatDuration, formatPercent } from '../utils/format';
import { DAILY_DIFFICULTY_ORDER, DAILY_DIFFICULTIES } from '../engine';

export default function StatsScreen({ stats, dailyStats, onBack, onHome, onStats, onAchievements, onSettings }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const dailyCompletedTotal = dailyStats
    ? DAILY_DIFFICULTY_ORDER.reduce((sum, id) => sum + dailyStats.difficulties[id].daysWon, 0)
    : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader theme={theme} title="STATS" onBack={onBack} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Section styles={styles} title="Progress" rows={[
          { k: 'Boards cleared', v: formatNumber(stats.boardsCleared) },
          { k: 'Boards lost', v: formatNumber(stats.boardsLost) },
          { k: 'Win rate', v: formatPercent(stats.boardsCleared, stats.gamesPlayed) },
          { k: 'Current streak', v: formatNumber(stats.currentStreak) },
          { k: 'Best streak', v: formatNumber(stats.bestStreak) },
        ]} />

        <Section styles={styles} title="Skill" rows={[
          { k: 'Flawless clears', v: formatNumber(stats.flawlessClears) },
          { k: 'Best flawless streak', v: formatNumber(stats.bestFlawlessStreak) },
          { k: 'Fewest taps to clear', v: stats.fewestTapsToClear == null ? '—' : formatNumber(stats.fewestTapsToClear) },
          { k: 'Most lives kept on a clear', v: formatNumber(stats.mostLivesRemainingOnClear) },
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
          { k: 'Most boards cleared in a day', v: formatNumber(stats.bestDayClears) },
          { k: 'Longest session', v: formatDuration(stats.bestSessionMs) },
        ]} />

        {dailyStats && (
          <Section styles={styles} title="Daily Challenges" rows={[
            { k: 'Daily challenges completed', v: formatNumber(dailyCompletedTotal) },
            ...DAILY_DIFFICULTY_ORDER.map((id) => ({
              k: `${DAILY_DIFFICULTIES[id].label} challenges completed`,
              v: formatNumber(dailyStats.difficulties[id].daysWon),
            })),
          ]} />
        )}
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
