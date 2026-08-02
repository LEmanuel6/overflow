import React, { useEffect, useRef } from 'react';
import { Pressable, Animated, StyleSheet } from 'react-native';

const WIDTH = 46;
const HEIGHT = 26;
const KNOB = 20;
const PAD = 3;

// Small themed on/off switch (colour swaps between vesselEdge/ok via the
// theme, not a native OS toggle — keeps the graph-paper/ink identity).
export default function Switch({ value, onValueChange, theme, disabled }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [value, anim]);

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.color.vesselEdge, theme.color.ok],
  });
  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, WIDTH - KNOB - PAD * 2],
  });

  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      hitSlop={8}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor, opacity: disabled ? 0.5 : 1 }]}>
        <Animated.View style={[styles.knob, { transform: [{ translateX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: WIDTH, height: HEIGHT, borderRadius: HEIGHT / 2, padding: PAD, justifyContent: 'center' },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: '#FBFAF5' },
});
