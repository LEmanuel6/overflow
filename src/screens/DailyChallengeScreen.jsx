import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import Board from '../components/Board';
import Hud from '../components/Hud';
import ConfirmDialog from '../components/ConfirmDialog';
import { useGame } from '../state/useGame';
import { useCountdown } from '../state/useCountdown';
import { localDateStr } from '../state/useDailyStats';
import { formatClock, formatTimeMs } from '../utils/format';
import * as Engine from '../engine';

// Danger zone scales with the time limit rather than a flat 15s — for
// Beginner's 20s sprint that would mean "danger" for 3/4 of the whole
// attempt, which isn't a meaningful signal.
function dangerThresholdMs(timeLimitMs) {
  return Math.min(15000, Math.round(timeLimitMs * 0.25));
}

export default function DailyChallengeScreen({ difficulty, dailyStatsApi, onBack }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const config = Engine.DAILY_DIFFICULTIES[difficulty];
  const timeLimitMs = config.timeLimitMs;

  const [dateStr] = useState(() => localDateStr());   // captured once per mount
  const [confirmingAbort, setConfirmingAbort] = useState(false);

  // countdownRef breaks the circular dependency between the two hooks below:
  // useGame's onWon/onLost need the elapsed time, but useCountdown needs
  // g.status/g.busy/g.forceTimeout. Declaring g first (closing over the ref,
  // not over `countdown` itself) then countdown, then refreshing the ref
  // every render, resolves the ordering without either hook needing to exist
  // before the other is constructed.
  const countdownRef = useRef({ remainingMs: timeLimitMs });

  const g = useGame(null, {
    initialState: () => Engine.newDailyGame(dateStr, difficulty),
    persistProgress: false,
    regenerate: () => Engine.newDailyGame(dateStr, difficulty),
    onWon: () => dailyStatsApi.recordResult(dateStr, difficulty, true, timeLimitMs - countdownRef.current.remainingMs),
    onLost: () => dailyStatsApi.recordResult(dateStr, difficulty, false, timeLimitMs - countdownRef.current.remainingMs),
  });

  const countdown = useCountdown(timeLimitMs, {
    active: g.status === 'play' && !g.busy && !confirmingAbort,
    onExpire: g.forceTimeout,
  });
  countdownRef.current = countdown;

  const { state, display, bursting, wiping, revealing, boardId, status, tap } = g;

  const handleRetry = () => { g.retry(); countdown.reset(); };
  const handleAbort = () => { setConfirmingAbort(false); onBack(); };
  const onAbortPress = () => {
    // No progress to lose once the attempt has resolved — skip the confirm.
    if (status === 'play') setConfirmingAbort(true);
    else onBack();
  };

  const diffStats = dailyStatsApi.dailyStats.difficulties[difficulty];
  const today = diffStats.days[dateStr];
  const attemptNumber = (today?.attempts || 0) + (status === 'play' ? 1 : 0);

  const banner =
    status === 'won' ? `Solved in ${formatTimeMs(timeLimitMs - countdown.remainingMs)}` :
    status === 'lost' ? (countdown.remainingMs === 0 ? "Time's up" : 'Chain wiped you out') :
    'Beat the clock — clear the board before time runs out';

  const subtitle = today
    ? `Attempt ${attemptNumber} today${today.won ? ` · best ${formatTimeMs(today.bestTimeMs)}` : ''}`
    : 'First attempt today';

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable
        style={[styles.abortButton, { top: insets.top + 8 }]}
        onPress={onAbortPress}
        hitSlop={12}
      >
        <Ionicons name="arrow-back" size={22} color={theme.color.ink} />
      </Pressable>
      <View style={styles.container}>
        <Text style={styles.title}>{config.label.toUpperCase()}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <Hud
          lives={state.lives}
          streak={diffStats.currentStreak}
          firstLabel="Time"
          firstValue={formatClock(countdown.remainingMs)}
          danger={countdown.remainingMs <= dangerThresholdMs(timeLimitMs)}
        />

        <Board
          state={state}
          display={display}
          bursting={bursting}
          wiping={wiping}
          revealing={revealing}
          boardId={boardId}
          onTapCell={tap}
        />

        <Text style={[
          styles.banner,
          status === 'won' && styles.bannerWin,
          status === 'lost' && styles.bannerLose,
        ]}>
          {banner}
        </Text>

        {status !== 'play' && (
          <View style={styles.row}>
            <Pressable style={styles.buttonSecondary} onPress={onBack}>
              <Text style={styles.buttonSecondaryText}>Menu</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={handleRetry}>
              <Text style={styles.buttonText}>{status === 'won' ? 'Beat your time' : 'Try again'}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <ConfirmDialog
        theme={theme}
        visible={confirmingAbort}
        title="Quit this attempt?"
        message="This attempt won't be scored — come back any time today to try again."
        confirmLabel="Yes"
        onCancel={() => setConfirmingAbort(false)}
        onConfirm={handleAbort}
      />
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.color.paper },
    abortButton: { position: 'absolute', left: 16, padding: 6, zIndex: 1 },
    container: { flex: 1, alignItems: 'center', paddingHorizontal: 16, paddingTop: 32 },
    title: {
      fontFamily: theme.font.bold, fontSize: 26,
      letterSpacing: 4, color: theme.color.ink, marginBottom: 4,
    },
    subtitle: {
      fontFamily: theme.font.regular, fontSize: 14, color: theme.color.inkSoft,
      marginBottom: 20,
    },
    banner: {
      fontFamily: theme.font.regular, fontSize: 14, color: theme.color.inkSoft,
      textAlign: 'center', marginTop: 24, minHeight: 20, paddingHorizontal: 12,
    },
    bannerWin: { color: theme.color.ok },
    bannerLose: { color: theme.color.burst },
    row: { flexDirection: 'row', gap: 12 },
    button: {
      marginTop: 20, backgroundColor: theme.color.ink,
      paddingVertical: 12, paddingHorizontal: 32, borderRadius: theme.radius,
    },
    buttonText: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.paper, letterSpacing: 1 },
    buttonSecondary: {
      marginTop: 20, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.color.ink,
      paddingVertical: 12, paddingHorizontal: 32, borderRadius: theme.radius,
    },
    buttonSecondaryText: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.ink, letterSpacing: 1 },
  });
}
