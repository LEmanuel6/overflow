// Custom Expo config plugin for react-native-google-play-games — the
// library itself ships no config plugin, but Play Games Services needs the
// game's APP_ID declared in AndroidManifest.xml (via a strings.xml
// indirection), same requirement/shape as the react-native-google-mobile-ads
// plugin bundled with that library (see app.json).
//
// A managed Expo project regenerates android/ from scratch on every prebuild
// (EAS Build), so this can't just be a one-time manual edit to
// AndroidManifest.xml — it has to be a plugin that runs every build.
//
// No-ops entirely when `appId` isn't provided, same "safe until the real ID
// exists" pattern as REAL_UNIT_IDS in src/ads and REVENUECAT_KEYS in
// src/purchases — leave app.json's plugin entry with appId left out (or
// null) until Play Games Services is set up in Play Console.
const { withAndroidManifest, withStringsXml, AndroidConfig } = require('@expo/config-plugins');

const META_DATA_NAME = 'com.google.android.gms.games.APP_ID';
const STRING_NAME = 'play_games_app_id';

function withPlayGamesStrings(config, appId) {
  return withStringsXml(config, (config) => {
    config.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: STRING_NAME, translatable: 'false' }, _: appId }],
      config.modResults,
    );
    return config;
  });
}

function withPlayGamesManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    AndroidConfig.Manifest.ensureToolsAvailable(manifest);
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    mainApplication['meta-data'] = mainApplication['meta-data'] ?? [];

    const existing = mainApplication['meta-data'].find(
      (item) => item.$['android:name'] === META_DATA_NAME,
    );
    const value = `@string/${STRING_NAME}`;
    if (existing) {
      existing.$['android:value'] = value;
    } else {
      mainApplication['meta-data'].push({
        $: { 'android:name': META_DATA_NAME, 'android:value': value },
      });
    }
    return config;
  });
}

const withPlayGames = (config, { appId } = {}) => {
  if (!appId) return config; // no Play Games Services APP_ID yet — leave native config untouched
  config = withPlayGamesStrings(config, appId);
  config = withPlayGamesManifest(config);
  return config;
};

module.exports = withPlayGames;
