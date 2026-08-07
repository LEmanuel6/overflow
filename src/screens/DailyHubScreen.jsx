import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import Tray from '../components/Tray';
import * as Engine from '../engine';
import { localDateStr, totalAttemptsForDay } from '../state/useDailyStats';
import { formatTimeMs } from '../utils/format';

const DIFFICULTY_ICONS = {
  beginner: 'footsteps-outline',
  intermediate: 'flag-outline',
  expert: 'flame-outline',
  master: 'skull-outline',
};

// The difficulty-selection screen between the menu's "Daily Challenge" card
// and an actual DailyChallengeScreen(difficulty) attempt — Beginner through
// Master are effectively four separate daily puzzles (see useDailyStats.js).
export default function DailyHubScreen({ dailyStatsApi, onBack, onSelectDifficulty, onHome, onStats, onAchievements, onSettings }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const today = localDateStr();
  const totalToday = totalAttemptsForDay(dailyStatsApi.dailyStats, today);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        theme={theme}
        title="DAILY CHALLENGES"
        subtitle={totalToday > 0 ? `${totalToday} attempt${totalToday === 1 ? '' : 's'} today` : 'Not played yet today'}
        onBack={onBack}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        {Engine.DAILY_DIFFICULTY_ORDER.map((id) => {
          const config = Engine.DAILY_DIFFICULTIES[id];
          const day = dailyStatsApi.dailyStats.difficulties[id].days[today];

          return (
            <Pressable key={id} style={styles.card} onPress={() => onSelectDifficulty(id)}>
              <View style={[styles.badge, day?.won && styles.badgeWon]}>
                <Ionicons name={DIFFICULTY_ICONS[id]} size={22} color={day?.won ? theme.color.ok : theme.color.inkSoft} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{config.label}</Text>
                <Text style={styles.cardMeta}>{config.n}×{config.n}</Text>
                {!day ? (
                  <Text style={styles.cardSubtitle}>Not played yet today</Text>
                ) : day.won ? (
                  <>
                    <Text style={styles.cardSubtitle}>Solved in {day.winAttempt} attempt{day.winAttempt === 1 ? '' : 's'}</Text>
                    <Text style={styles.cardSubtitle}>Best Time: {formatTimeMs(day.bestTimeMs)}</Text>
                    <Text style={styles.cardSubtitle}>Total Attempts: {day.attempts}</Text>
                  </>
                ) : (
                  <Text style={styles.cardSubtitle}>{day.attempts} attempt{day.attempts === 1 ? '' : 's'} today — keep going</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.color.inkSoft} />
            </Pressable>
          );
        })}
      </ScrollView>
      <Tray theme={theme} onHome={onHome} onStats={onStats} onAchievements={onAchievements} onSettings={onSettings} />
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.color.paper },
    scroll: { flex: 1 },
    container: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 24 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      width: '100%', maxWidth: 420, marginBottom: 12, padding: 14,
      backgroundColor: theme.color.vessel, borderWidth: 1, borderColor: theme.color.vesselEdge,
      borderRadius: theme.radius,
    },
    badge: {
      width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.vesselEdge,
    },
    badgeWon: { backgroundColor: theme.color.okSoft, borderColor: theme.color.ok },
    cardText: { flex: 1 },
    cardTitle: { fontFamily: theme.font.bold, fontSize: 17, color: theme.color.ink },
    cardMeta: {
      fontFamily: theme.font.semiBold, fontSize: 13, color: theme.color.inkSoft,
      textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2,
    },
    cardSubtitle: { fontFamily: theme.font.regular, fontSize: 13, color: theme.color.inkSoft, marginTop: 4 },
  });
}
