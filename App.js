import React, { useState, useRef } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from '@expo-google-fonts/quicksand';
import MenuScreen from './src/screens/MenuScreen';
import GameScreen from './src/screens/GameScreen';
import DailyHubScreen from './src/screens/DailyHubScreen';
import DailyChallengeScreen from './src/screens/DailyChallengeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import StatsScreen from './src/screens/StatsScreen';
import AchievementsScreen from './src/screens/AchievementsScreen';
import Tray from './src/components/Tray';
import { useGame } from './src/state/useGame';
import { useSettings } from './src/state/useSettings';
import { useStats } from './src/state/useStats';
import { useDailyStats } from './src/state/useDailyStats';
import { ThemeProvider, darkTheme, lightTheme } from './src/theme';

// Screens that show the bottom tab bar. Tray itself is rendered exactly
// once, as a sibling of the swapped screen content, so switching tabs
// doesn't tear the tray down and rebuild it. That alone wasn't enough,
// though: each screen's CONTENT was still conditionally mounted/unmounted
// on every switch, which is its own source of a transition-frame flicker
// independent of the tray. See visitedRef below for the actual fix.
const TRAY_SCREENS = new Set(['menu', 'stats', 'achievements', 'settings', 'dailyHub']);

const FULL = { flex: 1 };
const HIDDEN = { display: 'none' };

export default function App() {
  const [screen, setScreen] = useState('menu');
  const [dailyDifficulty, setDailyDifficulty] = useState(null);
  const settings = useSettings();
  const statsApi = useStats();
  const dailyStatsApi = useDailyStats();
  const g = useGame(statsApi);
  const [fontsLoaded] = useFonts({
    Quicksand_500Medium,
    Quicksand_600SemiBold,
    Quicksand_700Bold,
  });

  // Tracks which tray-screens have ever been visited this session. Each one
  // mounts once, lazily, on first visit, then stays mounted for the rest of
  // the session — switching tabs afterward is a pure display:none/flex
  // toggle on an already-painted tree, never an unmount+remount. That's what
  // actually eliminates the transition flicker (a persistent Tray alone only
  // fixed the tray's own flicker, not the content area's).
  const visitedRef = useRef(new Set());
  if (TRAY_SCREENS.has(screen)) visitedRef.current.add(screen);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: darkTheme.color.paper }} />;
  }

  const goMenu = () => setScreen('menu');
  const goStats = () => setScreen('stats');
  const goAchievements = () => setScreen('achievements');
  const goSettings = () => setScreen('settings');
  const goDailyHub = () => setScreen('dailyHub');
  const goDailyPlay = (difficulty) => { setDailyDifficulty(difficulty); setScreen('dailyPlay'); };

  const onReset = () => {
    g.restart();
    statsApi.reset();
    dailyStatsApi.reset();
  };

  // App itself renders ThemeProvider, so it can't call useTheme() (that only
  // works in a descendant) — derive the same paper colour directly for the
  // persistent wrapper's background.
  const theme = settings.darkMode ? darkTheme : lightTheme;

  return (
    <SafeAreaProvider>
      <ThemeProvider darkMode={settings.darkMode}>
        <StatusBar style={settings.darkMode ? 'light' : 'dark'} />
        <View style={{ flex: 1, backgroundColor: theme.color.paper }}>
          <View style={{ flex: 1 }}>
            {visitedRef.current.has('menu') && (
              <View style={screen === 'menu' ? FULL : HIDDEN}>
                <MenuScreen
                  level={g.state.level}
                  stats={statsApi.stats}
                  onPlay={() => setScreen('game')}
                  onReset={onReset}
                  dailyStats={dailyStatsApi.dailyStats}
                  onDaily={goDailyHub}
                  onAchievements={goAchievements}
                />
              </View>
            )}
            {screen === 'game' && <GameScreen g={g} stats={statsApi.stats} onMenu={goMenu} />}
            {visitedRef.current.has('dailyHub') && (
              <View style={screen === 'dailyHub' ? FULL : HIDDEN}>
                <DailyHubScreen dailyStatsApi={dailyStatsApi} onBack={goMenu} onSelectDifficulty={goDailyPlay} />
              </View>
            )}
            {screen === 'dailyPlay' && (
              <DailyChallengeScreen difficulty={dailyDifficulty} dailyStatsApi={dailyStatsApi} onBack={goDailyHub} />
            )}
            {visitedRef.current.has('stats') && (
              <View style={screen === 'stats' ? FULL : HIDDEN}>
                <StatsScreen stats={statsApi.stats} dailyStats={dailyStatsApi.dailyStats} onBack={goMenu} />
              </View>
            )}
            {visitedRef.current.has('achievements') && (
              <View style={screen === 'achievements' ? FULL : HIDDEN}>
                <AchievementsScreen stats={statsApi.stats} dailyStats={dailyStatsApi.dailyStats} onBack={goMenu} />
              </View>
            )}
            {visitedRef.current.has('settings') && (
              <View style={screen === 'settings' ? FULL : HIDDEN}>
                <SettingsScreen
                  darkMode={settings.darkMode}
                  setDarkMode={settings.setDarkMode}
                  sound={settings.sound}
                  setSound={settings.setSound}
                  onBack={goMenu}
                />
              </View>
            )}
          </View>
          {TRAY_SCREENS.has(screen) && (
            <Tray
              theme={theme}
              active={screen}
              onHome={goMenu}
              onStats={goStats}
              onAchievements={goAchievements}
              onSettings={goSettings}
            />
          )}
        </View>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
