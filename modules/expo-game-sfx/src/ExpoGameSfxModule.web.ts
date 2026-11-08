import { registerWebModule, NativeModule } from 'expo';

import { ExpoGameSfxModuleEvents } from './ExpoGameSfx.types';

// No native SoundPool/AVAudioPlayer latency problem to solve on web — this
// module is never used there (src/sound/index.js keeps using expo-audio on
// web). Present only so importing this module doesn't crash a web bundle.
class ExpoGameSfxModule extends NativeModule<ExpoGameSfxModuleEvents> {
  async loadSound(_key: string, _uri: string): Promise<void> {}
  play(_key: string): void {}
}

export default registerWebModule(ExpoGameSfxModule, 'ExpoGameSfxModule');
