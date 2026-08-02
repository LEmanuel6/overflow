// Visual language for Overflow — a calm graph-paper / ink aesthetic.
// Two palettes (dark, light) share the same role names so every component
// can stay colour-agnostic and just ask for `theme.color.ink` etc. The app
// starts in dark mode; `ThemeProvider`/`useTheme` (below) make the active
// palette available anywhere and re-render consumers when it's toggled in
// Settings.

import React, { createContext, useContext, useMemo } from 'react';

const shared = {
  font: {
    // Quicksand (see App.js useFonts) — rounded geometric sans, loaded in
    // three weights since custom fonts need a distinct family per weight
    // rather than a `fontWeight` prop.
    regular: 'Quicksand_500Medium',
    semiBold: 'Quicksand_600SemiBold',
    bold: 'Quicksand_700Bold',
  },
  radius: 3,
  space: (n) => n * 4,
};

const darkColor = {
  paper: '#1B1A17',        // background
  paperEdge: '#242219',
  gridLine: '#3A362C',
  ink: '#EDE8DC',          // primary text / strong strokes
  inkSoft: '#9B9585',      // secondary text
  vessel: '#242219',       // cell fill
  vesselEdge: '#4A4536',   // cell border
  signal: '#E0A542',       // amber — cell at cap
  signalSoft: '#3D2F17',
  burst: '#E2593C',        // oxide red — bursting
  burstSoft: '#3D211A',
  ok: '#4FAE8D',           // green — pushes nothing / safe
  okSoft: '#1D3129',
  heart: '#E2593C',
};

const lightColor = {
  paper: '#F4F1E8',
  paperEdge: '#E7E2D2',
  gridLine: '#D9D3C2',
  ink: '#2B2B28',
  inkSoft: '#7A756A',
  vessel: '#FBFAF5',
  vesselEdge: '#C9C2AF',
  signal: '#BF7215',
  signalSoft: '#F4E4CC',
  burst: '#A4331D',
  burstSoft: '#F0D6CE',
  ok: '#2E6B57',
  okSoft: '#D8E7DF',
  heart: '#A4331D',
};

export const darkTheme = { ...shared, mode: 'dark', color: darkColor };
export const lightTheme = { ...shared, mode: 'light', color: lightColor };

const ThemeContext = createContext(darkTheme);

export function ThemeProvider({ darkMode, children }) {
  const value = useMemo(() => (darkMode ? darkTheme : lightTheme), [darkMode]);
  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  return useContext(ThemeContext);
}

// Interpolate a cell's fill colour by how full it is (0..1). Off by default in
// the prototype's chosen identity, but available if a heat mode is added.
export function fullnessTint(fraction) {
  const f = Math.max(0, Math.min(1, fraction));
  const hue = Math.round(52 - 52 * f);
  const light = Math.round(90 - 40 * f);
  return `hsl(${hue}, 85%, ${light}%)`;
}
