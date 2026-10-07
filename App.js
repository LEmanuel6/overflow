import React, { useEffect, useState } from 'react';
import { View, InteractionManager } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Ionicons } from '@expo/vector-icons';
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
import { useDailyStats, localDateStr } from './src/state/useDailyStats';
import { isRewardedAvailable, initAds } from './src/ads';
import { DAILY_DIFFICULTY_ORDER, isDailyBoardCached, newDailyGame } from './src/engine';
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

// Keep the native splash (icon + dark background, see app.json's
// expo-splash-screen plugin) up until fonts have actually loaded, instead of
// Expo's default of auto-hiding the instant the JS root view mounts — that
// default left a bare, uncovered native window for however long fonts took,
// which is exactly the "blank for a couple of seconds" launch gap this was
// covering for. Call this at module scope (not inside the component) so it
// runs before first render, the one time it matters.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [screen, setScreen] = useState('menu');
  const [dailyDifficulty, setDailyDifficulty] = useState(null);
  const settings = useSettings();
  const statsApi = useStats();
  const dailyStatsApi = useDailyStats();
  const g = useGame(statsApi, { offerContinue: isRewardedAvailable() });
  // Ionicons (Tray, Menu, Daily Hub, ...) is a separate font from these three
  // and loads through its own internal mechanism — it was never actually
  // covered by this gate, so the splash could hide (and the Menu screen
  // appear) before Ionicons had finished loading, showing blank icons in
  // the Tray for a moment. Explicitly included here so fontsLoaded means
  // "every font this app uses," not just the custom text ones.
  const [fontsLoaded] = useFonts({
    Quicksand_500Medium,
    Quicksand_600SemiBold,
    Quicksand_700Bold,
    ...Ionicons.font,
  });

  // Starts the ads SDK (consent + init + preloading the interstitial and
  // rewarded ad) as early as possible. This used to happen implicitly via
  // AdBanner mounting on the Menu screen; removing the banner (Leon's call)
  // also removed that free head start, and showInterstitial() gives the
  // FIRST-ever interstitial request zero wait time for a load in progress
  // (by design — gameplay should never stall on a slow ad), so without an
  // early trigger the level-10 interstitial would reliably find nothing
  // loaded yet and silently show nothing. Firing it here instead gives
  // consent + init + the first ad request the whole rest of the session to
  // finish before it's actually needed.
  useEffect(() => { initAds(); }, []);

  // Hides the native splash once fonts are actually ready — the counterpart
  // to preventAutoHideAsync() above. Runs every render but hideAsync() is a
  // no-op once the splash is already gone, so this is safe to leave
  // unguarded rather than threading a "have I called this yet" ref through.
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // Pre-generates today's daily-challenge boards, so by the time a player
  // actually opens the Daily Hub every tier is already cached (see
  // Engine.isDailyBoardCached) and DailyChallengeScreen skips straight past
  // its loading placeholder. Two layers of deferral, not just one:
  //  - InteractionManager.runAfterInteractions delays the whole thing until
  //    AFTER the app's initial mount/layout/animations have actually
  //    settled, rather than racing them — starting this the instant the
  //    component mounts was blocking the JS thread while React was still
  //    mid-layout, which showed up as a transient mis-rendered frame (safe-
  //    area insets applied late, top/bottom looking "cut off") right after
  //    launch.
  //  - setTimeout(0) between EACH tier still yields the thread every step —
  //    Expert/Master each run the exact solver once to generate (~200-450ms
  //    on desktop, worse on a phone's JS engine, see engine/index.js), and
  //    those are still real, individually-blocking chunks of work no matter
  //    how long the whole sequence is delayed by the first point.
  useEffect(() => {
    let cancelled = false;
    const handle = InteractionManager.runAfterInteractions(() => {
      const today = localDateStr();
      let i = 0;
      const warmNext = () => {
        if (cancelled || i >= DAILY_DIFFICULTY_ORDER.length) return;
        const difficulty = DAILY_DIFFICULTY_ORDER[i++];
        if (!isDailyBoardCached(today, difficulty)) newDailyGame(today, difficulty);
        setTimeout(warmNext, 0);
      };
      warmNext();
    });
    return () => { cancelled = true; handle.cancel(); };
  }, []);

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

  // initialWindowMetrics is a synchronously-available native constant (no
  // async round-trip) — without it, SafeAreaProvider reports zero insets for
  // the first render or two after launch, so content that should sit below
  // the status bar (e.g. Menu's "Recent achievements") briefly renders too
  // high/overflowing before snapping into place once the real measurement
  // arrives. This is react-native-safe-area-context's own documented fix.
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
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
