import { requireNativeModule } from 'expo-modules-core';

// Lazily resolve so a missing native module (e.g. wrong build) shows a
// graceful error on tap instead of crashing at import time.
let module: any | null = null;

export default {
  readSms(limit: number) {
    if (!module) {
      module = requireNativeModule('SmsReader');
    }
    return module.readSms(limit);
  },
};
