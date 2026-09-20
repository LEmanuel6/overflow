import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import Switch from '../components/Switch';
import { initAds, isPrivacyOptionsRequired, showPrivacyOptions } from '../ads';

// Tray is rendered once, persistently, by App.js — not here (see Tray.jsx).
export default function SettingsScreen({ darkMode, setDarkMode, sound, setSound, onDevJumpToLevel, onBack }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Only shown where the consent form was required (EEA/UK etc.) — known
  // once the ads consent flow has run.
  const [privacyRequired, setPrivacyRequired] = useState(false);
  useEffect(() => {
    let alive = true;
    initAds().then(() => { if (alive) setPrivacyRequired(isPrivacyOptionsRequired()); });
    return () => { alive = false; };
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <Text style={styles.title}>SETTINGS</Text>

        <View style={styles.list}>
          <Row theme={theme} styles={styles} label="Dark mode">
            <Switch theme={theme} value={darkMode} onValueChange={setDarkMode} />
          </Row>
          <Row theme={theme} styles={styles} label="Sound" note="Coming soon">
            <Switch theme={theme} value={sound} onValueChange={setSound} />
          </Row>
          {privacyRequired && (
            <Row theme={theme} styles={styles} label="Ad privacy">
              <Pressable onPress={showPrivacyOptions} hitSlop={8}>
                <Text style={styles.rowAction}>Manage</Text>
              </Pressable>
            </Row>
          )}
        </View>

        {__DEV__ && <DevLevelJump styles={styles} theme={theme} onJump={onDevJumpToLevel} />}

        <Pressable style={styles.button} onPress={onBack}>
          <Text style={styles.buttonText}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// Dev-only (stripped from production builds via __DEV__): jump straight to
// an arbitrary level, to test a specific difficulty band (e.g. the 3x3->4x4
// handoff at 100/101, or a 5x5 wall past 500) without grinding there.
function DevLevelJump({ styles, theme, onJump }) {
  const [text, setText] = useState('');

  const jump = () => {
    const level = Math.max(1, parseInt(text, 10) || 0);
    if (level < 1) return;
    onJump(level);
  };

  return (
    <View style={styles.devSection}>
      <Text style={styles.devLabel}>Dev: jump to level</Text>
      <View style={styles.devRow}>
        <TextInput
          style={styles.devInput}
          value={text}
          onChangeText={setText}
          placeholder="e.g. 101"
          placeholderTextColor={theme.color.inkSoft}
          keyboardType="number-pad"
          returnKeyType="go"
          onSubmitEditing={jump}
        />
        <Pressable style={styles.devButton} onPress={jump}>
          <Text style={styles.devButtonText}>Go</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({ styles, label, note, children }) {
  return (
    <View style={styles.row}>
      <View>
        <Text style={styles.rowLabel}>{label}</Text>
        {note && <Text style={styles.rowNote}>{note}</Text>}
      </View>
      {children}
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.color.paper },
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    title: {
      fontFamily: theme.font.bold, fontSize: 22,
      letterSpacing: 6, color: theme.color.ink, marginBottom: 32,
    },
    list: {
      width: '100%', maxWidth: 360,
      borderTopWidth: 1, borderColor: theme.color.gridLine,
    },
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 16,
      borderBottomWidth: 1, borderColor: theme.color.gridLine,
    },
    rowLabel: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.ink },
    rowNote: { fontFamily: theme.font.regular, fontSize: 14, color: theme.color.inkSoft, marginTop: 2, opacity: 0.75 },
    rowAction: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.ink, textDecorationLine: 'underline' },
    devSection: { width: '100%', maxWidth: 360, marginTop: 24 },
    devLabel: {
      fontFamily: theme.font.regular, fontSize: 13, color: theme.color.inkSoft,
      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
    },
    devRow: { flexDirection: 'row', gap: 10 },
    devInput: {
      flex: 1, fontFamily: theme.font.regular, fontSize: 15, color: theme.color.ink,
      borderWidth: 1, borderColor: theme.color.gridLine, borderRadius: theme.radius,
      paddingVertical: 10, paddingHorizontal: 14,
    },
    devButton: {
      backgroundColor: theme.color.ink, borderRadius: theme.radius,
      paddingVertical: 10, paddingHorizontal: 20, justifyContent: 'center',
    },
    devButtonText: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.paper, letterSpacing: 1 },
    button: {
      marginTop: 32, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.color.ink,
      paddingVertical: 12, paddingHorizontal: 32, borderRadius: theme.radius,
    },
    buttonText: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.ink, letterSpacing: 1 },
  });
}
