// Config plugin: emit per-ABI APKs (Play Store split delivery) on every
// prebuild. ABI splits live here (not hand-edited gradle) so CI + local both
// get them. universalApk keeps app-universal-release.apk as the updater's
// fallback when a per-ABI asset is missing from a release.
const { withAppBuildGradle } = require('@expo/config-plugins');

const SPLITS_BLOCK = `
    splits {
        abi {
            reset()
            enable true
            universalApk true
            include "arm64-v8a", "armeabi-v7a", "x86", "x86_64"
        }
    }`;

module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, (c) => {
    const contents = c.modResults.contents;
    if (!contents.includes('splits {')) {
      // Insert after the packagingOptions/jniLibs block, before androidResources.
      const marker = `    androidResources {`;
      if (!contents.includes(marker)) return c;
      c.modResults.contents = contents.replace(
        marker,
        `${SPLITS_BLOCK}\n${marker}`
      );
    }
    return c;
  });
};
