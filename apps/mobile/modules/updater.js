// In-app update check against GitHub Releases.
// Version comes from the APK itself (set from app.json at build) — no
// second copy to drift. expo-constants is registered in the app already;
// expoConfig.version is the app.json "version" embedded at build.
import Constants from 'expo-constants';
import SmsReader from './sms-reader';
import ApkInstaller from './apk-installer';
import * as FileSystem from 'expo-file-system';

export const CUR_VERSION =
  Constants.expoConfig?.version || Constants.nativeApplicationVersion || '0.0.0';

// Per-ABI release APKs (Play split format). Device picks its own arch.
export const ABI = () => {
  try {
    const a = SmsReader.getAbi();
    return ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'].includes(a) ? a : 'arm64-v8a';
  } catch {
    return 'arm64-v8a';
  }
};
export const APK_NAME = () => `app-${ABI()}-release.apk`;
export const APK_URL = () =>
  `https://github.com/tarun-sdb/card-sage/releases/latest/download/${APK_NAME()}`;

export async function checkUpdate(timeoutMs = 6000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch('https://api.github.com/repos/tarun-sdb/card-sage/releases/latest', {
      signal: ctl.signal,
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!r.ok) return null;
    const j = await r.json();
    // Resolve the real asset URL instead of guessing: exact per-ABI match,
    // universal fallback, blind latest/download URL last (may 404).
    const assets = Array.isArray(j.assets) ? j.assets : [];
    const byName = (n) => assets.find((a) => a.name === n)?.browser_download_url || null;
    const url =
      byName(APK_NAME()) || byName('app-universal-release.apk') || APK_URL();
    return {
      tag: j.tag_name,
      version: j.tag_name.replace(/^v/, ''),
      url,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const APK_DIR = `${FileSystem.documentDirectory}apk_downloads/`;
const APK_FILENAME = 'card-sage-update.apk';

export async function downloadAndInstallApk(url, onProgress) {
  // Ensure directory exists
  await FileSystem.makeDirectoryAsync(APK_DIR, { intermediates: true });
  const destPath = `${APK_DIR}${APK_FILENAME}`;

  // Remove any existing file
  await FileSystem.deleteAsync(destPath, { idempotent: true });

  // Download with progress
  const downloadResumable = FileSystem.createDownloadResumable(
    url,
    destPath,
    {},
    (res) => {
      if (onProgress && res.totalBytesWritten && res.totalBytesExpectedToWrite) {
        onProgress(res.totalBytesWritten / res.totalBytesExpectedToWrite);
      }
    }
  );

  const result = await downloadResumable.downloadAsync();

  if (!result || result.status !== 200) {
    throw new Error(`Download failed: ${result?.status ?? 'unknown'}`);
  }

  // Install via native module (FileProvider + ACTION_VIEW)
  const installResult = await ApkInstaller.installApk(result.uri);
  if (!installResult.success) {
    throw new Error(installResult.error || 'Install failed');
  }
}