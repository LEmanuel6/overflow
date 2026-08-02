// Visual language for Overflow — a calm graph-paper / ink aesthetic.
// Kept in one place so the whole app stays consistent and easy to re-skin.

export const theme = {
  color: {
    paper: '#F4F1E8',        // background
    paperEdge: '#E7E2D2',
    gridLine: '#D9D3C2',
    ink: '#2B2B28',          // primary text / strong strokes
    inkSoft: '#7A756A',      // secondary text
    vessel: '#FBFAF5',       // cell fill
    vesselEdge: '#C9C2AF',   // cell border
    signal: '#BF7215',       // amber — cell at cap
    signalSoft: '#F4E4CC',
    burst: '#A4331D',        // oxide red — bursting
    burstSoft: '#F0D6CE',
    ok: '#2E6B57',           // green — pushes nothing / safe
    okSoft: '#D8E7DF',
    heart: '#A4331D',
  },
  font: {
    // Use the platform monospace; swap for a bundled font later if desired.
    mono: 'Courier',
  },
  radius: 3,
  space: (n) => n * 4,
};

// Interpolate a cell's fill colour by how full it is (0..1). Off by default in
// the prototype's chosen identity, but available if a heat mode is added.
export function fullnessTint(fraction) {
  const f = Math.max(0, Math.min(1, fraction));
  const hue = Math.round(52 - 52 * f);
  const light = Math.round(90 - 40 * f);
  return `hsl(${hue}, 85%, ${light}%)`;
}
