import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Fixed (non-scrolling) header with a top-left back arrow, so sub-screens
// don't force a scroll to the bottom just to go back.
export default function ScreenHeader({ theme, title, subtitle, onBack }) {
  const styles = makeStyles(theme);
  return (
    <View style={styles.header}>
      <Pressable style={styles.backButton} onPress={onBack} hitSlop={12}>
        <Ionicons name="arrow-back" size={22} color={theme.color.ink} />
      </Pressable>
      <View style={styles.titles}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 52, paddingTop: 12, paddingBottom: 12,
      borderBottomWidth: 1, borderColor: theme.color.gridLine,
    },
    backButton: { position: 'absolute', left: 16, top: 8, padding: 6, zIndex: 1 },
    titles: { alignItems: 'center' },
    title: {
      fontFamily: theme.font.bold, fontSize: 18,
      letterSpacing: 4, color: theme.color.ink,
    },
    subtitle: { fontFamily: theme.font.regular, fontSize: 18, color: theme.color.inkSoft, marginTop: 2 },
  });
}
