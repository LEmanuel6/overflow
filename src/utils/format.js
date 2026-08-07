export function formatNumber(n) {
  return Number(n || 0).toLocaleString();
}

export function formatDuration(ms) {
  if (ms == null) return '—';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m ${totalSeconds % 60}s`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours}h ${totalMinutes % 60}m`;
  const days = Math.floor(totalHours / 24);
  return `${days}d ${totalHours % 24}h`;
}

export function formatPercent(part, whole) {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

// Fixed-width m:ss.cc, for a ticking countdown (formatDuration's
// variable-width "45s"/"1m 30s" output isn't ideal for a HUD digit that
// changes every tick). Centiseconds rather than a coarser rounding since the
// countdown itself ticks every 100ms — matches what's actually being shown.
export function formatClock(ms) {
  const clamped = Math.max(0, Math.floor(ms));
  const m = Math.floor(clamped / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  const cs = Math.floor((clamped % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// Full millisecond precision, e.g. "1:23.456" — for a solved-time readout
// (the daily challenge's banner and hub tile), as opposed to formatClock's
// coarser centiseconds which just match the countdown's own tick rate.
export function formatTimeMs(ms) {
  if (ms == null) return '—';
  const clamped = Math.max(0, Math.floor(ms));
  const m = Math.floor(clamped / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  const msec = clamped % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(msec).padStart(3, '0')}`;
}
