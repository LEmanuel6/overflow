import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Cell from './Cell';
import * as Engine from '../engine';

// Renders the n x n grid from the current display cells + caps. Greens are
// "locked" (non-tappable) while any non-green cell remains, matching the rule.
export default function Board({ state, display, bursting, onTapCell }) {
  const { width } = useWindowDimensions();
  const n = state.n;
  const boardSize = Math.min(width - 32, 420);
  const cellSize = boardSize / n - 4;

  // are greens currently locked? (some non-green cell still on the board)
  const anyNonGreen = display.some((v, i) => v > 0 && !Engine.isGreen(v, state.ratio));

  return (
    <View style={[styles.board, { width: boardSize, height: boardSize }]}>
      {display.map((v, i) => {
        const green = v > 0 && Engine.isGreen(v, state.ratio);
        return (
          <Cell
            key={i}
            value={v}
            cap={state.caps[i]}
            size={cellSize}
            isGreen={green}
            isFull={v > 0 && v >= state.caps[i]}
            isBursting={bursting.includes(i)}
            locked={green && anyNonGreen}
            onPress={() => onTapCell(i)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
});
