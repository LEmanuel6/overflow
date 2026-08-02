import React from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { theme } from '../theme';
import { useGame } from '../state/useGame';
import Board from '../components/Board';
import Hud from '../components/Hud';

export default function GameScreen() {
  const g = useGame();
  const { state, display, bursting, status, stats, tap, retry } = g;

  const banner =
    status === 'won' ? `Level ${state.level} cleared` :
    status === 'lost' ? 'Chain wiped you out' :
    'Tap a cell — it empties and pushes onto its neighbours';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>OVERFLOW</Text>

        <Hud level={state.level} lives={state.lives} best={stats.best} />

        <Board
          state={state}
          display={display}
          bursting={bursting}
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
          <Pressable style={styles.button} onPress={retry}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.paper },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  title: {
    fontFamily: theme.font.mono, fontSize: 26, fontWeight: '700',
    letterSpacing: 6, color: theme.color.ink, marginBottom: 24,
  },
  banner: {
    fontFamily: theme.font.mono, fontSize: 14, color: theme.color.inkSoft,
    textAlign: 'center', marginTop: 24, minHeight: 20, paddingHorizontal: 12,
  },
  bannerWin: { color: theme.color.ok },
  bannerLose: { color: theme.color.burst },
  button: {
    marginTop: 20, backgroundColor: theme.color.ink,
    paddingVertical: 12, paddingHorizontal: 32, borderRadius: theme.radius,
  },
  buttonText: { fontFamily: theme.font.mono, fontSize: 15, fontWeight: '700', color: theme.color.paper, letterSpacing: 1 },
});
