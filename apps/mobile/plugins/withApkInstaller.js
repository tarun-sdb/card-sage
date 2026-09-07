const { withAndroidManifest } = require('@expo/config-plugins');

const FILE_PROVIDER_AUTHORITY = 'in.cardsage.app.fileprovider';

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

  return config;
};