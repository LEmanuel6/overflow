import { NativeModule, requireNativeModule } from 'expo';

import { ExpoGameSfxModuleEvents } from './ExpoGameSfx.types';

declare class ExpoGameSfxModule extends NativeModule<ExpoGameSfxModuleEvents> {
  loadSound(key: string, uri: string): Promise<void>;
  play(key: string): void;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoGameSfxModule>('ExpoGameSfx');
