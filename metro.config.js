// Metro's default asset extension list doesn't include .ogg (only
// mp3/wav/aac/m4a) — without this, `require('*.ogg')` in src/sound/index.js
// fails to bundle at all. Kenney's free SFX packs (what this app's sound
// effects are built from) ship as .ogg, so extending the list here is
// simpler than re-encoding every file to mp3/wav.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('ogg');

module.exports = config;
