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
