const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const FILE_PROVIDER_AUTHORITY = 'in.cardsage.app.fileprovider';

// FileProvider paths must cover FileSystem.documentDirectory (filesDir).
const FILE_PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths>
  <files-path name="apk_downloads" path="apk_downloads/" />
  <cache-path name="apk_downloads" path="apk_downloads/" />
  <external-files-path name="apk_downloads" path="apk_downloads/" />
  <external-cache-path name="apk_downloads" path="apk_downloads/" />
  <!-- Canonical-path fallback: /data/data vs /data/user/0 differ per OEM.
       Private provider (exported=false), per-intent grants only. -->
  <root-path name="root" path="." />
</paths>`;


module.exports = function withApkInstaller(config) {
  // Add FileProvider to AndroidManifest
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];
    if (!application) return config;

    // Add REQUEST_INSTALL_PACKAGES permission
    const permissions = manifest.manifest['uses-permission'] || [];
    const hasInstallPerm = permissions.some(
      (p) => p.$['android:name'] === 'android.permission.REQUEST_INSTALL_PACKAGES'
    );
    if (!hasInstallPerm) {
      permissions.push({ $: { 'android:name': 'android.permission.REQUEST_INSTALL_PACKAGES' } });
      manifest.manifest['uses-permission'] = permissions;
    }

    // Add FileProvider
    const providers = application.provider || [];
    const hasProvider = providers.some(
      (p) => p.$?.['android:name'] === 'androidx.core.content.FileProvider'
    );
    if (!hasProvider) {
      providers.push({
        $: {
          'android:name': 'androidx.core.content.FileProvider',
          'android:authorities': FILE_PROVIDER_AUTHORITY,
          'android:exported': 'false',
          'android:grantUriPermissions': 'true',
        },
        'meta-data': [{
          $: {
            'android:name': 'android.support.FILE_PROVIDER_PATHS',
            'android:resource': '@xml/apk_installer_file_paths',
          },
        }],
      });
      application.provider = providers;
    }

    return config;
  });

  // The manifest references @xml/apk_installer_file_paths — actually emit it,
  // otherwise resource linking fails on clean prebuilds (CI).
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const dir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res/xml'
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'apk_installer_file_paths.xml'), FILE_PATHS_XML);
      return config;
    },
  ]);

  return config;
};