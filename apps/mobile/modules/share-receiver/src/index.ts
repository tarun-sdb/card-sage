import { requireNativeModule } from 'expo-modules-core';

// Reads the ACTION_SEND intent this app was opened with (user shared a link
// or text from another app into Card Sage). Returns { text, subject } or null.
let module: any | null = null;

export default {
  getSharedContent(): Promise<{ text: string; subject: string } | null> {
    if (!module) {
      module = requireNativeModule('ShareReceiver');
    }
    return module.getSharedContent();
  },
};
