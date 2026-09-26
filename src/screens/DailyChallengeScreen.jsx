import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
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
import { isRewardedAvailable, showRewarded } from '../ads';
import { submitDailyTime } from '../leaderboards';
import * as Engine from '../engine';

// Danger zone scales with the time limit rather than a flat 15s — for
// Beginner's 20s sprint that would mean "danger" for 3/4 of the whole
// attempt, which isn't a meaningful signal.
function dangerThresholdMs(timeLimitMs) {
  return Math.min(15000, Math.round(timeLimitMs * 0.25));
}

// A rewarded ad's time bonus is proportional to the mode's limit — a flat 30s
// would more than double Beginner's 20s sprint but barely dent Master's 5 min.
const CONTINUE_TIME_FRACTION = 0.5;

// A blank, harmless placeholder board — used only while the real one is
// still generating (see the loading-state effect below). Its cells are all
// empty so nothing is tappable even if it briefly reaches the screen; status
// 'loading' also isn't 'play', so useGame's tap()/countdown both already
// treat it as fully inert without needing any special-casing.
function placeholderState(config) {
  const size = config.n * config.n;
  return {
    n: config.n, ratio: config.ratio,
    cells: new Array(size).fill(0), caps: new Array(size).fill(1),
    level: 'daily', lives: Engine.livesForGrid(config.n), taps: 0, status: 'loading',
  };
}

export default function DailyChallengeScreen({ difficulty, dailyStatsApi, onBack }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const config = Engine.DAILY_DIFFICULTIES[difficulty];
  const timeLimitMs = config.timeLimitMs;

  const [dateStr] = useState(() => localDateStr());   // captured once per mount
  const [confirmingAbort, setConfirmingAbort] = useState(false);
  const [adBusy, setAdBusy] = useState(false);
  const [adNotice, setAdNotice] = useState(null);

  // Board generation for Expert/Master runs the exact solver once on a
  // full 5x5/6x6 board to prove it's clearable — a genuinely heavy call
  // (see engine's newDailyGame), not something to run synchronously during
  // the first render (that would freeze the whole screen with nothing on
  // screen to show why). If this (date, difficulty) was already generated
  // this session — cached by the engine — skip straight to the real board;
  // otherwise mount with an instant placeholder and generate for real in an
  // effect below, so a loading state gets a chance to actually paint first.
  const alreadyCached = useRef(Engine.isDailyBoardCached(dateStr, difficulty)).current;

  // countdownRef breaks the circular dependency between the two hooks below:
  // useGame's onWon/onLost need the elapsed time, but useCountdown needs
  // g.status/g.busy/g.forceTimeout. Declaring g first (closing over the ref,
  // not over `countdown` itself) then countdown, then refreshing the ref
  // every render, resolves the ordering without either hook needing to exist
  // before the other is constructed.
  const countdownRef = useRef({ remainingMs: timeLimitMs, elapsedMs: 0 });

  const g = useGame(null, {
    initialState: () => (alreadyCached ? Engine.newDailyGame(dateStr, difficulty) : placeholderState(config)),
    persistProgress: false,
    offerContinue: isRewardedAvailable(),
    regenerate: () => Engine.newDailyGame(dateStr, difficulty),
    onWon: () => {
      dailyStatsApi.recordResult(dateStr, difficulty, true, countdownRef.current.elapsedMs);
      submitDailyTime(difficulty, countdownRef.current.elapsedMs);
    },
    onLost: () => dailyStatsApi.recordResult(dateStr, difficulty, false, countdownRef.current.elapsedMs),
  });

  // Generates the real board once the placeholder has had a chance to paint.
  // retry() is reused rather than duplicated here — regenerate() above is
  // exactly Engine.newDailyGame, so this call does the identical work useGame
  // already does for an explicit "try again", just repurposed to turn the
  // placeholder into the first real board (with the same reveal-sweep
  // entrance it'd otherwise get).
  useEffect(() => {
    if (alreadyCached) return;
    const t = setTimeout(() => g.retry(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const countdown = useCountdown(timeLimitMs, {
    active: g.status === 'play' && !g.busy && !confirmingAbort,
    onExpire: g.forceTimeout,
  });
  countdownRef.current = countdown;

  const { state, display, bursting, wiping, revealing, boardId, status, tap } = g;

  const handleRetry = () => { setAdNotice(null); g.retry(); countdown.reset(); };

  // Rewarded continue. A timeout gets bonus time; a loss by lives gets lives
  // back (see useGame.reviveAfterLoss). Either way the loss is never recorded.
  const timedOut = countdown.remainingMs === 0;
  const extraTimeMs = Math.round(timeLimitMs * CONTINUE_TIME_FRACTION);
  const handleWatchContinue = async () => {
    setAdBusy(true);
    setAdNotice(null);
    const result = await showRewarded();
    setAdBusy(false);
    if (result === 'earned') {
      if (timedOut) countdown.addTime(extraTimeMs);
      g.reviveAfterLoss();
    } else {
      setAdNotice(result === 'unavailable' ? 'No ad available right now — try again shortly' : 'Watch the whole ad to continue');
    }
  };
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
    status === 'lost' ? (adNotice || (timedOut ? "Time's up" : 'Chain wiped you out')) :
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

        {status === 'loading' ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={theme.color.ink} />
            <Text style={styles.loadingText}>Generating today's {config.label} puzzle…</Text>
          </View>
        ) : (
          <>
            <Hud
              lives={state.lives}
              maxLives={Engine.livesForGrid(config.n)}
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

            {g.canContinue && (
              <Pressable style={[styles.button, adBusy && styles.buttonDisabled]} onPress={handleWatchContinue} disabled={adBusy}>
                <Text style={styles.buttonText}>
                  {timedOut
                    ? `Watch ad · +${Math.round(extraTimeMs / 1000)}s`
                    : `Watch ad · +${Engine.continueLivesForGrid(config.n)} lives`}
                </Text>
              </Pressable>
            )}

            {(status === 'won' || status === 'lost') && (
              <View style={styles.row}>
                <Pressable style={styles.buttonSecondary} onPress={onBack}>
                  <Text style={styles.buttonSecondaryText}>Menu</Text>
                </Pressable>
                <Pressable style={styles.button} onPress={handleRetry}>
                  <Text style={styles.buttonText}>{status === 'won' ? 'Beat your time' : 'Try again'}</Text>
                </Pressable>
              </View>
            )}
          </>
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
    loadingBox: {
      flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 80,
    },
    loadingText: {
      fontFamily: theme.font.regular, fontSize: 14, color: theme.color.inkSoft, textAlign: 'center',
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
    buttonDisabled: { opacity: 0.5 },
    buttonSecondary: {
      marginTop: 20, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.color.ink,
      paddingVertical: 12, paddingHorizontal: 32, borderRadius: theme.radius,
    },
    buttonSecondaryText: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.ink, letterSpacing: 1 },
  });
}
