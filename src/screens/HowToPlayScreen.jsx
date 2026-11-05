import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';
import ScreenHeader from '../components/ScreenHeader';

// Mirrors Cell.jsx's current real display (a bare number plus a fill bar
// along the bottom showing how close to cap it is — no "/cap" fraction or
// "→push" text anymore, see Cell.jsx) and its border/fill/number colours
// per state, so these demos actually look like the board rather than
// inventing a second visual language. `cleared` renders nothing inside —
// same as a real empty cell (value 0). `cap` is still a prop (needed to
// compute the fill bar's fraction) but is never shown as text.
function DemoCell({ theme, value, cap, state }) {
  const styles = demoCellStyles(theme);
  if (state === 'cleared') return <View style={[styles.cell, styles.borderEmpty]} />;
  const variant = {
    filled: { border: styles.borderFilled, fill: styles.fillFilled, num: styles.numFilled, bar: styles.fullnessFilled },
    atCap: { border: styles.borderFull, fill: styles.fillFull, num: styles.numFull, bar: styles.fullnessFull },
    bursting: { border: styles.borderBurst, fill: styles.fillBurst, num: styles.numBurst, bar: styles.fullnessBurst },
    green: { border: styles.borderGreen, fill: styles.fillGreen, num: styles.numGreen, bar: styles.fullnessGreen },
  }[state];
  return (
    <View style={[styles.cell, variant.border, variant.fill]}>
      <Text style={[styles.num, variant.num]}>{value}</Text>
      <View style={styles.fullnessTrack}>
        <View style={[styles.fullnessFill, variant.bar, { width: `${Math.min(1, value / cap) * 100}%` }]} />
      </View>
    </View>
  );
}

function demoCellStyles(theme) {
  return StyleSheet.create({
    cell: {
      width: 52, height: 52, borderRadius: theme.radius, borderWidth: 2,
      alignItems: 'center', justifyContent: 'center',
    },
    num: { fontFamily: theme.font.bold, fontSize: 18 },
    borderEmpty: { borderColor: theme.color.gridLine, backgroundColor: 'transparent' },
    borderFilled: { borderColor: theme.color.vesselEdge },
    borderFull: { borderColor: theme.color.signal },
    borderGreen: { borderColor: theme.color.ok },
    borderBurst: { borderColor: theme.color.burst },
    fillFilled: { backgroundColor: theme.color.vessel },
    fillFull: { backgroundColor: theme.color.signalSoft },
    fillGreen: { backgroundColor: theme.color.okSoft },
    fillBurst: { backgroundColor: theme.color.burstSoft },
    numFilled: { color: theme.color.ink },
    numFull: { color: theme.color.signal },
    numGreen: { color: theme.color.ok },
    numBurst: { color: theme.color.burst },
    fullnessTrack: {
      position: 'absolute', left: 4, right: 4, bottom: 4, height: 6,
      borderRadius: 3, backgroundColor: theme.color.gridLine, overflow: 'hidden',
    },
    fullnessFill: { height: '100%', borderRadius: 3 },
    fullnessFilled: { backgroundColor: theme.color.inkSoft },
    fullnessFull: { backgroundColor: theme.color.signal },
    fullnessGreen: { backgroundColor: theme.color.ok },
    fullnessBurst: { backgroundColor: theme.color.burst },
  });
}

// Every position in the plus-shaped grid below — blank corner, chip, or
// the center cell — sits in a Slot of the same fixed size, so the 3 rows
// (which mix different-sized children) still line up into an actual plus
// rather than drifting based on each row's own content width.
function Slot({ children }) {
  return <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}

function Chip({ theme, label }) {
  return (
    <View style={{
      width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.color.okSoft, borderWidth: 1, borderColor: theme.color.ok,
    }}>
      <Text style={{ fontFamily: theme.font.bold, fontSize: 12, color: theme.color.ok }}>+{label}</Text>
    </View>
  );
}

function Arrow({ theme }) {
  return <Text style={{ fontSize: 18, color: theme.color.inkSoft, marginHorizontal: 4 }}>→</Text>;
}

// Shows a tapped/burst cell clearing to empty, with its share landing on
// each of its 4 on-grid neighbours (up/down/left/right) — the actual shape
// of a tap, not just "the cell next to it."
function SpreadDemo({ theme, share }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row' }}>
        <Slot /><Slot><Chip theme={theme} label={share} /></Slot><Slot />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Slot><Chip theme={theme} label={share} /></Slot>
        <Slot><DemoCell theme={theme} state="cleared" /></Slot>
        <Slot><Chip theme={theme} label={share} /></Slot>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Slot /><Slot><Chip theme={theme} label={share} /></Slot><Slot />
      </View>
    </View>
  );
}

function Section({ styles, title, children, demo }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {demo && <View style={styles.demoRow}>{demo}</View>}
      <Text style={styles.cardBody}>{children}</Text>
    </View>
  );
}

// A static echo of Hud.jsx's own Overflow bar (same gradient, same colour
// order) rather than a plain description — the real bar fills left-to-right
// from ok to burst as lives are spent, so showing that directly here is more
// legible than explaining it in words.
function LivesBarDemo({ theme }) {
  return (
    <View style={{ width: 160, height: 10, borderRadius: 5, overflow: 'hidden' }}>
      <LinearGradient
        colors={[theme.color.ok, theme.color.signal, theme.color.burst]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}

export default function HowToPlayScreen({ onBack }) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader theme={theme} title="HOW TO PLAY" onBack={onBack} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Section
          theme={theme}
          styles={styles}
          title="Tap to clear and spread"
          demo={(
            <>
              <DemoCell theme={theme} value={6} cap={8} state="filled" />
              <Arrow theme={theme} />
              <SpreadDemo theme={theme} share={2} />
            </>
          )}
        >
          Tap a cell to clear it. Part of its value spreads out to each of its 4 neighbours: up, down, left, and right.
        </Section>

        <Section
          theme={theme}
          styles={styles}
          title="Push a neighbour too far, it bursts"
          demo={(
            <>
              <DemoCell theme={theme} value={5} cap={6} state="atCap" />
              <Arrow theme={theme} />
              <DemoCell theme={theme} value={8} cap={6} state="bursting" />
            </>
          )}
        >
          Every cell has its own cap, shown by the fill bar beneath it. A share landing on a cell that's already near full can push it over, and it bursts too, clearing and spreading onward.
        </Section>

        <Section
          theme={theme}
          styles={styles}
          title="Chain reactions"
          demo={(
            <>
              <DemoCell theme={theme} value={4} cap={6} state="atCap" />
              <DemoCell theme={theme} value={8} cap={6} state="bursting" />
              <DemoCell theme={theme} value={5} cap={7} state="atCap" />
            </>
          )}
        >
          One burst can push another neighbour over its own cap, setting off a chain: the longer it runs, the bigger the risk and the reward.
        </Section>

        <Section theme={theme} styles={styles} title="Lives" demo={<LivesBarDemo theme={theme} />}>
          Each cell that bursts in a chain costs one life. Run out, and the board is lost, but a fresh attempt is always just a tap away.
        </Section>

        <Section
          theme={theme}
          styles={styles}
          title="Clear the board, climb the ladder"
          demo={(
            <>
              <DemoCell theme={theme} value={3} cap={9} state="green" />
              <DemoCell theme={theme} value={2} cap={6} state="green" />
              <DemoCell theme={theme} value={4} cap={11} state="green" />
            </>
          )}
        >
          Turn every remaining cell green (safe) to win the level; any leftover greens clear themselves automatically. Boards grow bigger and tighter as you climb. Overflow is built to get harder forever.
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.color.paper },
    scroll: { flex: 1 },
    container: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 24 },
    card: {
      width: '100%', maxWidth: 560,
      backgroundColor: theme.color.vessel, borderWidth: 1, borderColor: theme.color.vesselEdge,
      borderRadius: theme.radius, padding: 16, marginBottom: 14,
    },
    cardTitle: {
      fontFamily: theme.font.bold, fontSize: 17, color: theme.color.ink, marginBottom: 10,
    },
    cardBody: {
      fontFamily: theme.font.regular, fontSize: 15, color: theme.color.inkSoft, lineHeight: 21,
    },
    demoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, justifyContent: 'center' },
  });
}
