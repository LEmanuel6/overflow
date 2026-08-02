import React, { useMemo } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';

// In-app confirmation dialog — styled like the rest of the app, rather than
// relying on the native Alert (which react-native-web doesn't implement) or
// window.confirm (which looks like the browser, not the game).
export default function ConfirmDialog({ theme, visible, title, message, confirmLabel, onConfirm, onCancel }) {
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.row}>
            <Pressable style={styles.buttonSecondary} onPress={onCancel}>
              <Text style={styles.buttonSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={onConfirm}>
              <Text style={styles.buttonText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    },
    card: {
      width: '100%', maxWidth: 340,
      backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.vesselEdge,
      borderRadius: theme.radius, padding: 20,
    },
    title: {
      fontFamily: theme.font.bold, fontSize: 18, color: theme.color.ink, marginBottom: 8,
    },
    message: {
      fontFamily: theme.font.regular, fontSize: 14, color: theme.color.inkSoft, lineHeight: 20, marginBottom: 20,
    },
    row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    button: {
      backgroundColor: theme.color.burst,
      paddingVertical: 10, paddingHorizontal: 20, borderRadius: theme.radius,
    },
    buttonText: { fontFamily: theme.font.bold, fontSize: 14, color: theme.color.paper, letterSpacing: 0.5 },
    buttonSecondary: {
      backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.color.vesselEdge,
      paddingVertical: 10, paddingHorizontal: 20, borderRadius: theme.radius,
    },
    buttonSecondaryText: { fontFamily: theme.font.bold, fontSize: 14, color: theme.color.ink, letterSpacing: 0.5 },
  });
}
