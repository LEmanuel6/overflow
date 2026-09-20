import React, { useState } from 'react';
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
import { isRewardedAvailable } from './src/ads';
import { ThemeProvider, darkTheme, lightTheme } from './src/theme';

// Screens that show the bottom tab bar. Tray itself is rendered exactly
// once, as a sibling of the swapped screen content, so switching tabs
// doesn't tear the tray down and rebuild it. That alone wasn't enough,
// though: each screen's CONTENT was still conditionally mounted/unmounted on
// every switch — its own source of a transition-frame flicker. All five are
// now mounted unconditionally from the very first render (hidden via
// display:none except the active one) rather than lazily on first visit, so
// even the FIRST navigation to a given tab is just a visibility toggle on an
// already-painted tree, not a fresh mount — the one-time mount/layout cost
// happens once, up front, during app launch, where a brief delay is already
// expected (it's covered by the font-loading gate below).
const TRAY_SCREENS = new Set(['menu', 'stats', 'achievements', 'settings', 'dailyHub']);

const FULL = { flex: 1 };
const HIDDEN = { display: 'none' };

export default function App() {
  const [screen, setScreen] = useState('menu');
  const [dailyDifficulty, setDailyDifficulty] = useState(null);
  const settings = useSettings();
  const statsApi = useStats();
  const dailyStatsApi = useDailyStats();
  const g = useGame(statsApi, { offerContinue: isRewardedAvailable() });
  const [fontsLoaded] = useFonts({
    Quicksand_500Medium,
    Quicksand_600SemiBold,
    Quicksand_700Bold,
  });

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

  // Dev-only: jump straight to a level from Settings, to test a specific
  // difficulty band without grinding there.
  const onDevJumpToLevel = (level) => { g.goToLevel(level); setScreen('game'); };

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
            {screen === 'game' && <GameScreen g={g} stats={statsApi.stats} onMenu={goMenu} />}
            <View style={screen === 'dailyHub' ? FULL : HIDDEN}>
              <DailyHubScreen dailyStatsApi={dailyStatsApi} onBack={goMenu} onSelectDifficulty={goDailyPlay} />
            </View>
            {screen === 'dailyPlay' && (
              <DailyChallengeScreen difficulty={dailyDifficulty} dailyStatsApi={dailyStatsApi} onBack={goDailyHub} />
            )}
            <View style={screen === 'stats' ? FULL : HIDDEN}>
              <StatsScreen stats={statsApi.stats} dailyStats={dailyStatsApi.dailyStats} onBack={goMenu} />
            </View>
            <View style={screen === 'achievements' ? FULL : HIDDEN}>
              <AchievementsScreen stats={statsApi.stats} dailyStats={dailyStatsApi.dailyStats} onBack={goMenu} />
            </View>
            <View style={screen === 'settings' ? FULL : HIDDEN}>
              <SettingsScreen
                darkMode={settings.darkMode}
                setDarkMode={settings.setDarkMode}
                sound={settings.sound}
                setSound={settings.setSound}
                onDevJumpToLevel={onDevJumpToLevel}
                onBack={goMenu}
              />
            </View>
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
