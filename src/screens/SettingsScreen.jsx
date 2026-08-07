import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import Switch from '../components/Switch';

// Tray is rendered once, persistently, by App.js — not here (see Tray.jsx).
export default function SettingsScreen({ darkMode, setDarkMode, sound, setSound, onBack }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

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
        </View>

        <Pressable style={styles.button} onPress={onBack}>
          <Text style={styles.buttonText}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
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
    button: {
      marginTop: 32, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.color.ink,
      paddingVertical: 12, paddingHorizontal: 32, borderRadius: theme.radius,
    },
    buttonText: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.ink, letterSpacing: 1 },
  });
}
