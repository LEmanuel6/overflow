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
import { useGame } from './src/state/useGame';
import { useSettings } from './src/state/useSettings';
import { useStats } from './src/state/useStats';
import { useDailyStats } from './src/state/useDailyStats';
import { ThemeProvider, darkTheme } from './src/theme';

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

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: darkTheme.color.paper }} />;
  }

  const goMenu = () => setScreen('menu');
  const goStats = () => setScreen('stats');
  const goAchievements = () => setScreen('achievements');
  const goSettings = () => setScreen('settings');
  const goDailyHub = () => setScreen('dailyHub');
  const goDailyPlay = (difficulty) => { setDailyDifficulty(difficulty); setScreen('dailyPlay'); };
  const tabNav = { onHome: goMenu, onStats: goStats, onAchievements: goAchievements, onSettings: goSettings };

  const onReset = () => {
    g.restart();
    statsApi.reset();
    dailyStatsApi.reset();
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider darkMode={settings.darkMode}>
        <StatusBar style={settings.darkMode ? 'light' : 'dark'} />
        {screen === 'menu' && (
          <MenuScreen
            level={g.state.level}
            stats={statsApi.stats}
            onPlay={() => setScreen('game')}
            onReset={onReset}
            dailyStats={dailyStatsApi.dailyStats}
            onDaily={goDailyHub}
            {...tabNav}
          />
        )}
        {screen === 'game' && <GameScreen g={g} stats={statsApi.stats} onMenu={goMenu} />}
        {screen === 'dailyHub' && (
          <DailyHubScreen dailyStatsApi={dailyStatsApi} onBack={goMenu} onSelectDifficulty={goDailyPlay} {...tabNav} />
        )}
        {screen === 'dailyPlay' && (
          <DailyChallengeScreen difficulty={dailyDifficulty} dailyStatsApi={dailyStatsApi} onBack={goDailyHub} />
        )}
        {screen === 'stats' && (
          <StatsScreen stats={statsApi.stats} dailyStats={dailyStatsApi.dailyStats} onBack={goMenu} {...tabNav} />
        )}
        {screen === 'achievements' && (
          <AchievementsScreen stats={statsApi.stats} dailyStats={dailyStatsApi.dailyStats} onBack={goMenu} {...tabNav} />
        )}
        {screen === 'settings' && (
          <SettingsScreen
            darkMode={settings.darkMode}
            setDarkMode={settings.setDarkMode}
            sound={settings.sound}
            setSound={settings.setSound}
            onBack={goMenu}
            {...tabNav}
          />
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
