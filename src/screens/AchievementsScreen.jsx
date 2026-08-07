import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import Tray from '../components/Tray';
import { ACHIEVEMENTS, groupForDisplay, progressLabel } from '../data/achievements';

export default function AchievementsScreen({ stats, dailyStats, onBack, onHome, onStats, onAchievements, onSettings }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [openTrack, setOpenTrack] = useState(null);

  // Daily-sourced achievements (source: 'daily') are checked against the
  // separate dailyStats blob, not the ladder stats blob — see achievements.js.
  const blobFor = (a) => (a.source === 'daily' ? dailyStats : stats);

  const unlockedCount = ACHIEVEMENTS.filter((a) => a.check(blobFor(a))).length;
  const grouped = useMemo(() => groupForDisplay(), []);
  const openGroup = openTrack
    ? grouped.flatMap((c) => c.groups).find((g) => g.type === 'track' && g.id === openTrack)
    : null;

  const trayProps = { theme, active: 'achievements', onHome, onStats, onAchievements, onSettings };

  if (openGroup) {
    const groupBlob = blobFor(openGroup.items[0]);
    const unlockedInTrack = openGroup.items.filter((a) => a.check(groupBlob)).length;
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader
          theme={theme}
          title={openGroup.meta.title.toUpperCase()}
          subtitle={`${unlockedInTrack} / ${openGroup.items.length} unlocked`}
          onBack={() => setOpenTrack(null)}
        />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
          <View style={styles.section}>
            {openGroup.items.map((a) => (
              <Achievement key={a.id} styles={styles} theme={theme} achievement={a} unlocked={a.check(groupBlob)} stats={groupBlob} />
            ))}
          </View>
        </ScrollView>
        <Tray {...trayProps} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        theme={theme}
        title="ACHIEVEMENTS"
        subtitle={`${unlockedCount} / ${ACHIEVEMENTS.length} unlocked`}
        onBack={onBack}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        {grouped.map(({ category, groups }) => (
          <View key={category} style={styles.section}>
            <Text style={styles.sectionTitle}>{category}</Text>
            {groups.map((g) => g.type === 'track' ? (
              <TrackRow
                key={g.id}
                styles={styles}
                theme={theme}
                group={g}
                stats={blobFor(g.items[0])}
                onPress={() => setOpenTrack(g.id)}
              />
            ) : (
              <Achievement
                key={g.achievement.id}
                styles={styles}
                theme={theme}
                achievement={g.achievement}
                unlocked={g.achievement.check(blobFor(g.achievement))}
                stats={blobFor(g.achievement)}
              />
            ))}
          </View>
        ))}
      </ScrollView>
      <Tray {...trayProps} />
    </SafeAreaView>
  );
}

// One row per track on the summary list — collapses a whole ladder (e.g.
// the six level-milestone achievements) into progress toward its next
// un-cleared tier. Tapping drills into the full ladder via onPress.
function TrackRow({ styles, theme, group, stats, onPress }) {
  const { meta, items } = group;
  const unlockedCount = items.filter((a) => a.check(stats)).length;
  const nextLocked = items.find((a) => !a.check(stats));
  const complete = !nextLocked;
  const activeItem = nextLocked || items[items.length - 1];
  const progress = activeItem.progress(stats);
  const fraction = Math.min(1, progress.current / progress.target);

  return (
    <Pressable style={[styles.card, complete && styles.cardUnlocked]} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, complete && styles.badgeUnlocked]}>
          <Ionicons name={activeItem.icon} size={17} color={complete ? theme.color.ok : theme.color.inkSoft} />
        </View>
        <Text style={[styles.cardTitle, styles.cardTitleGrow, !complete && styles.dim]}>{meta.title}</Text>
        <Text style={styles.trackCount}>{unlockedCount}/{items.length}</Text>
        <Ionicons name="chevron-forward" size={18} color={theme.color.inkSoft} />
      </View>
      <Text style={[styles.cardDesc, !complete && styles.dim]}>
        {complete ? 'All milestones reached' : activeItem.description}
      </Text>
      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>{progressLabel(activeItem, progress)}</Text>
      </View>
    </Pressable>
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
          <Text style={styles.progressText}>{progressLabel(achievement, progress)}</Text>
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
    cardTitleGrow: { flex: 1 },
    trackCount: { fontFamily: theme.font.regular, fontSize: 14, color: theme.color.inkSoft },
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
