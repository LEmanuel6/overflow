import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import Board from '../components/Board';
import Hud from '../components/Hud';
import ConfirmDialog from '../components/ConfirmDialog';
import { livesForGrid, continueLivesForGrid } from '../engine';
import { showRewarded, showInterstitial } from '../ads';

// An interstitial plays automatically the moment every Nth level is cleared —
// levels are quick, so every 10th keeps ads infrequent. It can't be dodged by
// tapping Menu: the win buttons stay disabled until the ad closes. Never
// mid-board.
const INTERSTITIAL_EVERY_LEVELS = 10;

export default function GameScreen({ g, stats, onMenu }) {
  const { state, display, bursting, wiping, revealing, boardId, status, tap, retry, continueNext, canContinue, reviveAfterLoss } = g;
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [confirmingAbort, setConfirmingAbort] = useState(false);
  const [adBusy, setAdBusy] = useState(false);
  const [adNotice, setAdNotice] = useState(null);

  // Fires once per cleared board. adShownForBoard guards against re-firing if
  // this screen remounts while the board is still in its 'won' state.
  const adShownForBoard = useRef(null);
  useEffect(() => {
    if (status !== 'won' || state.level % INTERSTITIAL_EVERY_LEVELS !== 0) return;
    if (adShownForBoard.current === boardId) return;
    adShownForBoard.current = boardId;
    setAdBusy(true);
    showInterstitial().then(() => setAdBusy(false)); // always resolves
  }, [status, boardId, state.level]);

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
    retry();
    onMenu();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable
        style={[styles.abortButton, { top: insets.top + 8 }]}
        onPress={() => setConfirmingAbort(true)}
        hitSlop={12}
      >
        <Ionicons name="arrow-back" size={22} color={theme.color.ink} />
      </Pressable>
      <View style={styles.container}>
        <Text style={styles.title}>OVERFLOW</Text>

        <Hud level={state.level} lives={state.lives} maxLives={livesForGrid(state.n)} streak={stats.currentStreak} />

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

        {status === 'won' && (
          <View style={styles.row}>
            <Pressable style={[styles.buttonSecondary, adBusy && styles.buttonDisabled]} onPress={() => { continueNext(); onMenu(); }} disabled={adBusy}>
              <Text style={styles.buttonSecondaryText}>Menu</Text>
            </Pressable>
            <Pressable style={[styles.button, adBusy && styles.buttonDisabled]} onPress={continueNext} disabled={adBusy}>
              <Text style={styles.buttonText}>Continue</Text>
            </Pressable>
          </View>
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
      letterSpacing: 6, color: theme.color.ink, marginBottom: 24,
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
