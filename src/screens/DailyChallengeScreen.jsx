import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import Board from '../components/Board';
import Hud from '../components/Hud';
import ConfirmDialog from '../components/ConfirmDialog';
import { useGame } from '../state/useGame';
import { useCountdown } from '../state/useCountdown';
import { dailyDateStr } from '../state/useDailyStats';
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

// Board's onTapCell before the entrance reveal has finished — a stable
// no-op reference (not an inline arrow) so Board/Cell don't see a new prop
// identity on every render. Blocks taps mid-sweep so the first tap (which
// starts the timer) can't land before the board is actually visible.
const noop = () => {};

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

export default function DailyChallengeScreen({ difficulty, dailyStatsApi, statsApi, onBack }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // insets applied as plain padding below, not via the <SafeAreaView>
  // component — see GameScreen.jsx's identical comment for the full
  // rationale: that component does its own native-side measurement per
  // instance, and this screen fully unmounts/remounts on every navigation,
  // so it would re-pay that cost on every single entrance. useSafeAreaInsets()
  // reads straight from the already-settled context instead.
  const insets = useSafeAreaInsets();

  const config = Engine.DAILY_DIFFICULTIES[difficulty];
  const timeLimitMs = config.timeLimitMs;

  const [dateStr] = useState(() => dailyDateStr());   // captured once per mount
  const [confirmingAbort, setConfirmingAbort] = useState(false);
  const [adBusy, setAdBusy] = useState(false);
  const [adNotice, setAdNotice] = useState(null);
  // ready: the entrance reveal (see useGame's onRevealDone/runBoardReveal
  // onDone) has visually finished — taps don't register until then, so the
  // player can't start the timer mid-sweep. started: the first tap has
  // landed — ONLY then does the countdown actually run (see countdown's
  // `active` below); that same tap also counts as a real move, not just a
  // trigger (see handleCellTap). Both reset to false on every retry, so a
  // "Try again"/"Beat your time" re-entrance gets the same gate as the first
  // attempt, not a free head start on the clock.
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);

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
    // Taps/bursts/chain-reactions are lifetime SKILL stats (Taps/Chain
    // Reaction achievements) — counted here too, not just on the ladder.
    // useGame.js tracks per-attempt lives-lost/timing privately per
    // instance now, so this is safe: it can't touch the ladder's own
    // (separate, always-alive) useGame instance.
    onTapped: (info) => statsApi.tapped(info),
    // trackLadder: false keeps this out of ladder-only concepts (best
    // level, win streaks — see useStats.js's boardWon/boardLost) while
    // still feeding the general lifetime counters (boardsCleared,
    // flawlessClears, grid-size tiers, fastest clear, etc.) that most
    // achievements actually read. `info` carries livesLostThisBoard from
    // useGame.js's own per-instance tracker, for accurate flawless-clear
    // detection; elapsedMs uses the countdown's own precise figure (it
    // already accounts for rewarded bonus time) rather than useGame's
    // generic Date.now() timer, since that's the more meaningful "how fast"
    // for the Speedrunner achievement here.
    onWon: (s, info) => {
      dailyStatsApi.recordResult(dateStr, difficulty, true, countdownRef.current.elapsedMs);
      submitDailyTime(difficulty, countdownRef.current.elapsedMs);
      statsApi.boardWon({
        n: s.n, taps: s.taps, lives: s.lives,
        livesLostThisBoard: info.livesLostThisBoard,
        elapsedMs: countdownRef.current.elapsedMs,
        trackLadder: false,
      });
    },
    onLost: () => {
      dailyStatsApi.recordResult(dateStr, difficulty, false, countdownRef.current.elapsedMs);
      statsApi.boardLost({ trackLadder: false });
    },
    // Fires once the FIRST board's reveal finishes — only relevant when it's
    // the real board being revealed, not the loading placeholder (see
    // placeholderState above): when starting uncached, the placeholder has
    // no visible Board at all (the loading spinner renders instead), so
    // firing this off its reveal would flip `ready` before the real board
    // even exists. The uncached effect below passes its own onDone straight
    // to g.retry() instead, once the real board actually replaces it.
    onRevealDone: alreadyCached ? () => setReady(true) : undefined,
  });

  // Generates the real board once the placeholder has had a chance to paint.
  // retry() is reused rather than duplicated here — regenerate() above is
  // exactly Engine.newDailyGame, so this call does the identical work useGame
  // already does for an explicit "try again", just repurposed to turn the
  // placeholder into the first real board (with the same reveal-sweep
  // entrance it'd otherwise get). onDone here is this path's equivalent of
  // the onRevealDone opt above.
  useEffect(() => {
    if (alreadyCached) return;
    const t = setTimeout(() => g.retry({ onDone: () => setReady(true) }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps running through a cascade's burst animation on purpose — Leon's
  // call: a big chain reaction should cost real time off the clock as part
  // of its risk, not pause for free. But it should NOT keep running through
  // the win-wipe that follows a win — that's purely decorative presentation,
  // not part of the puzzle. g.status only flips to 'won' once the wipe
  // itself finishes (see settleWin in useGame.js — that's deliberately late,
  // so the ladder doesn't show its "cleared" banner/buttons mid-wipe), but
  // g.state.status (the engine's own board status) flips to 'won' the
  // instant the board actually resolves — right as the last burst's
  // animation concludes and the wipe is ABOUT to start, before it plays.
  // Gating on that instead stops the clock exactly at "last cell tapped",
  // not "wipe animation finished", while leaving the win banner/buttons
  // (which read g.status, not g.state.status) timed the same as before.
  // useGame's forceTimeout defers actually applying an expiry that lands
  // mid-animation until the board goes idle (see useGame.js), so this
  // doesn't cut an animation short. Gated on `started` too, not just
  // status/confirm — see the `started` state comment above.
  const countdown = useCountdown(timeLimitMs, {
    active: g.state.status === 'play' && !confirmingAbort && started,
    onExpire: g.forceTimeout,
  });
  countdownRef.current = countdown;

  const { state, display, bursting, wiping, revealing, boardId, status, tap, displayLives } = g;

  // The first tap on the board both starts the timer and counts as a real
  // move — not a separate "arm the clock" tap that gets thrown away.
  const handleCellTap = (i) => {
    if (!started) setStarted(true);
    tap(i);
  };

  const handleRetry = () => {
    setAdNotice(null);
    setReady(false);
    setStarted(false);
    g.retry({ onDone: () => setReady(true) });
    countdown.reset();
  };

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
    !started ? 'Tap a cell to start the timer' :
    'Beat the clock — clear the board before time runs out';

  const subtitle = today
    ? `Attempt ${attemptNumber} today${today.won ? ` · best ${formatTimeMs(today.bestTimeMs)}` : ''}`
    : 'First attempt today';

  return (
    <View style={[styles.safe, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
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
              lives={displayLives}
              maxLives={Engine.livesForGrid(config.n)}
              boardId={boardId}
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
              onTapCell={ready ? handleCellTap : noop}
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
    </View>
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
