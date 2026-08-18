// In-app update check against GitHub Releases.
// ponytail: CUR_VERSION must match app.json "version" — bump both on release.

export const CUR_VERSION = '1.0.3';
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