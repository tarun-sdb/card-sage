// In-app update check against GitHub Releases.
// Version comes from the APK itself (set from app.json at build) — no
// second copy to drift.
import { Application } from 'expo-application';

export const CUR_VERSION = Application.nativeApplicationVersion || '0.0.0';
export const APK_URL = 'https://github.com/tarun-sdb/card-sage/releases/latest/download/app-release.apk';

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
    return {
      tag: j.tag_name,
      version: j.tag_name.replace(/^v/, ''),
      url: APK_URL,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}