import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Cell from './Cell';
import * as Engine from '../engine';

// The board (and Hud's matching stat row above it, see Hud.jsx) was capped
// at a phone-only width — fine on a phone, but on a tablet/large window the
// board just stayed small and pinned in place while the rest of the screen
// went to dead space. Raised from 420 so it actually grows on a bigger
// screen instead of just sitting there; still clamped (not uncapped) so a
// 3x3 tutorial board doesn't become absurdly huge on a big tablet. Exported
// so Hud's own stat row above the board can match this exact width rather
// than drifting out of alignment with it.
export const BOARD_MAX_WIDTH = 560;

// Renders the n x n grid from the current display cells + caps. Greens are
// "locked" (non-tappable) while any non-green cell remains, matching the rule.
//
// Wrapped in React.memo so a parent re-render that doesn't actually change
// any of these props is a no-op here — matters most on DailyChallengeScreen,
// whose countdown re-renders the whole screen via requestAnimationFrame
// (~60/sec) for the entire length of the challenge. Without this, Board's
// full render (re-mapping every cell, rebuilding the grid) ran on literally
// every animation frame for minutes at a time, not just when the board
// actually changed — the "timer feels heavy" symptom. onTapCell must stay a
// STABLE reference for this to actually pay off (see DailyChallengeScreen's
// useCallback-wrapped handleCellTap and useGame's already-memoized tap).
function Board({ state, display, bursting, wiping, revealing, boardId, onTapCell }) {
  const { width } = useWindowDimensions();
  const n = state.n;
  const boardSize = Math.min(width - 32, BOARD_MAX_WIDTH);
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
            push={v > 0 ? Engine.shareEach(v, state.ratio) : 0}
            size={cellSize}
            boardId={boardId}
            isGreen={green}
            isBursting={bursting.includes(i)}
            isWiping={wiping.includes(i)}
            isRevealing={revealing.includes(i)}
            locked={green && anyNonGreen}
            index={i}
            onTapCell={onTapCell}
          />
        );
      })}
    </View>
  );
}

export default React.memo(Board);

const styles = StyleSheet.create({
  board: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
});
