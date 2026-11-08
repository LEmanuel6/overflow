// Reexport the native module. On web, it will be resolved to ExpoGameSfxModule.web.ts
// and on native platforms to ExpoGameSfxModule.ts
export { default } from './src/ExpoGameSfxModule';
export * from './src/ExpoGameSfx.types';
