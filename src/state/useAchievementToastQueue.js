// useAchievementToastQueue — tracks which achievement ids are currently
// shown as toasts, decoupled from useStats/useDailyStats (each of which only
// knows about its own unlockedAt map — see their justUnlocked/
// clearJustUnlocked). App.js feeds ids from either source into push(), so a
// ladder unlock and a daily unlock both land in the same visible list.
//
// Unlike a strict one-at-a-time queue, every pushed id becomes visible
// immediately — several achievements unlocking at once (e.g. a single win
// crossing two thresholds together) stack on screen rather than waiting in
// line. Each toast's own animate-in/hold/animate-out lifecycle lives in
// AchievementToast.jsx; this hook just owns the list and removes an id when
// that component reports it's done (onDone/remove).

import { useState, useCallback } from 'react';

export function useAchievementToastQueue() {
  const [visible, setVisible] = useState([]); // achievement ids, oldest first

  const push = useCallback((ids) => {
    if (!ids || !ids.length) return;
    setVisible((v) => [...v, ...ids]);
  }, []);

  const remove = useCallback((id) => {
    setVisible((v) => v.filter((x) => x !== id));
  }, []);

  return { visible, push, remove };
}
