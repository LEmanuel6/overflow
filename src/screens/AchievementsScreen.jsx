import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import Tray from '../components/Tray';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from '../data/achievements';

export default function AchievementsScreen({ stats, onBack, onHome, onStats, onAchievements, onSettings }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const unlockedCount = ACHIEVEMENTS.filter((a) => a.check(stats)).length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        theme={theme}
        title="ACHIEVEMENTS"
        subtitle={`${unlockedCount} / ${ACHIEVEMENTS.length} unlocked`}
        onBack={onBack}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        {ACHIEVEMENT_CATEGORIES.map((category) => (
          <View key={category} style={styles.section}>
            <Text style={styles.sectionTitle}>{category}</Text>
            {ACHIEVEMENTS.filter((a) => a.category === category).map((a) => (
              <Achievement key={a.id} styles={styles} theme={theme} achievement={a} unlocked={a.check(stats)} stats={stats} />
            ))}
          </View>
        ))}
      </ScrollView>
      <Tray theme={theme} active="achievements" onHome={onHome} onStats={onStats} onAchievements={onAchievements} onSettings={onSettings} />
    </SafeAreaView>
  );
}

function Achievement({ styles, theme, achievement, unlocked, stats }) {
  const progress = !unlocked && achievement.progress ? achievement.progress(stats) : null;
  const fraction = progress ? Math.min(1, progress.current / progress.target) : 0;

  return (
    <View style={[styles.card, unlocked && styles.cardUnlocked]}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, unlocked && styles.badgeUnlocked]}>
          <Ionicons name={achievement.icon} size={17} color={unlocked ? theme.color.ok : theme.color.inkSoft} />
        </View>
        <Text style={[styles.cardTitle, !unlocked && styles.dim]}>{achievement.title}</Text>
      </View>
      <Text style={[styles.cardDesc, !unlocked && styles.dim]}>{achievement.description}</Text>
      {progress && (
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>{progress.current}/{progress.target}</Text>
        </View>
      )}
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
      textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8,
    },
    card: {
      backgroundColor: theme.color.vessel, borderWidth: 1, borderColor: theme.color.vesselEdge,
      borderRadius: theme.radius, padding: 12, marginBottom: 8,
    },
    cardUnlocked: { borderColor: theme.color.ok },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    badge: {
      width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.vesselEdge,
    },
    badgeUnlocked: { backgroundColor: theme.color.okSoft, borderColor: theme.color.ok },
    cardTitle: { fontFamily: theme.font.bold, fontSize: 18, color: theme.color.ink },
    cardDesc: { fontFamily: theme.font.regular, fontSize: 18, color: theme.color.inkSoft, marginTop: 4, marginLeft: 42 },
    dim: { opacity: 0.65 },
    progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 42, gap: 8 },
    progressTrack: {
      flex: 1, height: 5, borderRadius: 3, backgroundColor: theme.color.gridLine, overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: theme.color.signal },
    progressText: { fontFamily: theme.font.regular, fontSize: 18, color: theme.color.inkSoft },
  });
}
