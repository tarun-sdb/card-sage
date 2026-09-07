import { requireNativeModule } from 'expo-modules-core';

let module: any | null = null;

export default {
  async installApk(filePath: string): Promise<{ success: boolean; error?: string }> {
    if (!module) {
      module = requireNativeModule('ApkInstaller');
    }
    return module.installApk(filePath);
  },
};