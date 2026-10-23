import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import Board from '../components/Board';
import Hud from '../components/Hud';
import ConfirmDialog from '../components/ConfirmDialog';
import { livesForGrid, continueLivesForGrid } from '../engine';
import { showRewarded, showInterstitial } from '../ads';

// An interstitial plays automatically the moment every Nth level is cleared.
// Asymmetric cadence, Leon's call: every 10th through the L1-100 tutorial
// band (TIER1_LEVELS in the engine) — levels there are fast, and the first
// ad shouldn't land before a player's formed a good first impression —
// tightening to every 7th from L101 on, once a player's demonstrably
// engaged and later levels take longer anyway. It can't be dodged by
// backing out: auto-advance (below) waits for the ad to resolve before
// moving to the next board. Never mid-board.
const INTERSTITIAL_TUTORIAL_BAND_END = 100;
const INTERSTITIAL_EVERY_LEVELS_EARLY = 10;
const INTERSTITIAL_EVERY_LEVELS_LATE = 7;

function isInterstitialLevel(level) {
  const every = level <= INTERSTITIAL_TUTORIAL_BAND_END ? INTERSTITIAL_EVERY_LEVELS_EARLY : INTERSTITIAL_EVERY_LEVELS_LATE;
  return level % every === 0;
}

export default function GameScreen({ g, stats, onMenu }) {
  const { state, display, bursting, wiping, revealing, boardId, status, tap, retry, continueNext, canContinue, reviveAfterLoss, displayLives, replayReveal } = g;
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // insets applied as plain padding below, not via the <SafeAreaView>
  // component — that component (react-native-safe-area-context 5.x) is a
  // true native view that does its OWN native-side inset measurement per
  // instance, separate from this hook's already-settled JS context value.
  // GameScreen fully unmounts/remounts on every navigation (see below), so a
  // <SafeAreaView> here would re-trigger that native round-trip on every
  // single entrance — a plausible source of the brief top/bottom-cut-off
  // jump reported right as a board loads in. useSafeAreaInsets() reads
  // straight from the context, correct on the very first render, no native
  // round-trip needed. MenuScreen etc. don't have this problem since they're
  // mounted once at launch and never remount, so their own <SafeAreaView>
  // only ever pays that cost once.
  const insets = useSafeAreaInsets();
  const [confirmingAbort, setConfirmingAbort] = useState(false);
  const [adBusy, setAdBusy] = useState(false);
  const [adNotice, setAdNotice] = useState(null);

  // GameScreen itself unmounts/remounts on every navigation away from and
  // back to this tab (it's conditionally rendered in App.js, not kept
  // mounted via display:none like Menu/Stats/etc.) — so this is the one
  // moment that reliably means "the player just navigated here." Replays
  // the board's entrance sweep (+ sound) for whatever's already sitting in
  // `g`, which persists across that unmount since it's lifted to App.js.
  //
  // useLayoutEffect, not useEffect — this needs to hide the board (via the
  // boardId bump inside replayReveal, see useGame.js) BEFORE the browser/
  // native paints the first frame. A plain useEffect runs AFTER that first
  // paint, so the already-fully-visible board would flash on screen for one
  // frame, THEN snap blank, THEN sweep back in — exactly the "goes blank to
  // re-appear" glitch this was built to fix. useLayoutEffect applies the
  // hide before anything is actually painted, so the very first frame the
  // player sees is already hidden, with only the intended sweep-in visible.
  useLayoutEffect(() => { replayReveal(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fires once per cleared board. adShownForBoard guards against re-firing if
  // this screen remounts while the board is still in its 'won' state.
  const adShownForBoard = useRef(null);
  // Synchronous mirror of adBusy — the auto-advance effect below needs to
  // know an interstitial has been claimed for THIS board the instant this
  // effect runs, not one render later (state updates from setAdBusy(true)
  // aren't visible to a same-commit effect declared after this one; a ref
  // write is). Without this, auto-advance could race ahead of the ad on the
  // very first 'won' render, before adBusy has actually flipped to true.
  const adBusyRef = useRef(false);
  useEffect(() => {
    if (status !== 'won' || !isInterstitialLevel(state.level)) return;
    if (adShownForBoard.current === boardId) return;
    adShownForBoard.current = boardId;
    adBusyRef.current = true;
    setAdBusy(true);
    showInterstitial().then(() => { adBusyRef.current = false; setAdBusy(false); }); // always resolves
  }, [status, boardId, state.level]);

  // Auto-advance on a win — Leon's call: tapping Continue every single
  // board felt like an interruption, not a deliberate checkpoint. Reuses
  // the exact sweep-out (runWinWipe) / sweep-in (runBoardReveal) animations
  // that already existed for the manual Continue flow, just chained
  // automatically instead of waiting on a tap. Declared AFTER the ad effect
  // above (effect order = declaration order within a commit) so adBusyRef
  // is already up to date by the time this one reads it.
  const autoAdvancedForBoard = useRef(null);
  useEffect(() => {
    if (status !== 'won') return;
    if (autoAdvancedForBoard.current === boardId) return;
    if (adBusyRef.current) return; // interstitial claimed this board — the adBusy->false render re-runs this
    autoAdvancedForBoard.current = boardId;
    continueNext();
  }, [status, adBusy, boardId, continueNext]);

  const banner =
    status === 'won' ? `Level ${state.level} cleared` :
    status === 'lost' ? (adNotice || 'Chain wiped you out') :
    'Tap a cell — it empties and pushes onto its neighbours';

  const handleRetry = () => { setAdNotice(null); retry(); };

  // Rewarded continue: same board, some lives back. See useGame.reviveAfterLoss.
  const handleWatchContinue = async () => {
    setAdBusy(true);
    setAdNotice(null);
    const result = await showRewarded();
    setAdBusy(false);
    if (result === 'earned') reviveAfterLoss();
    else setAdNotice(result === 'unavailable' ? 'No ad available right now — try again shortly' : 'Watch the whole ad to continue');
  };

  const handleAbort = () => {
    setConfirmingAbort(false);
    retry({ silent: true }); // resetting as a side effect of leaving, not an in-view retry — no sweep sound for an animation nobody's watching
    onMenu();
  };

  // Once the board's already resolved there's nothing left to lose, so the
  // "you'll lose progress" confirm doesn't apply. For a win, retry() would
  // actually have DISCARDED the win (it regenerates the SAME level rather
  // than advancing) — mirrors what auto-advance would do anyway (advance to
  // the next level in the background, then leave); marking
  // autoAdvancedForBoard first stops the auto-advance effect from ALSO
  // firing for this boardId and double-advancing past an extra level. For a
  // loss, silently retry the same level in the background before leaving —
  // Leon's call: coming back later should land on a fresh attempt, not the
  // stale "Chain wiped you out / Try again" screen from whatever attempt
  // was abandoned.
  const onAbortPress = () => {
    if (status === 'won') {
      if (autoAdvancedForBoard.current !== boardId) { autoAdvancedForBoard.current = boardId; continueNext({ silent: true }); }
      onMenu();
      return;
    }
    if (status === 'lost') { retry({ silent: true }); onMenu(); return; }
    setConfirmingAbort(true);
  };

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
        <Text style={styles.title}>OVERFLOW</Text>

        <Hud level={state.level} lives={displayLives} maxLives={livesForGrid(state.n)} streak={stats.currentStreak} boardId={boardId} />

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

        {status === 'lost' && (
          <>
            {canContinue && (
              <Pressable style={[styles.button, adBusy && styles.buttonDisabled]} onPress={handleWatchContinue} disabled={adBusy}>
                <Text style={styles.buttonText}>Watch ad · +{continueLivesForGrid(state.n)} lives</Text>
              </Pressable>
            )}
            <Pressable style={canContinue ? styles.buttonSecondary : styles.button} onPress={handleRetry} disabled={adBusy}>
              <Text style={canContinue ? styles.buttonSecondaryText : styles.buttonText}>Try again</Text>
            </Pressable>
          </>
        )}

      </View>

      <ConfirmDialog
        theme={theme}
        visible={confirmingAbort}
        title="Quit to menu?"
        message="You'll lose progress on this board — your best level is safe either way."
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
      letterSpacing: 6, color: theme.color.ink, marginBottom: 24,
    },
    banner: {
      fontFamily: theme.font.regular, fontSize: 14, color: theme.color.inkSoft,
      textAlign: 'center', marginTop: 24, minHeight: 20, paddingHorizontal: 12,
    },
    bannerWin: { color: theme.color.ok },
    bannerLose: { color: theme.color.burst },
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
