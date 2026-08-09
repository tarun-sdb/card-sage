// Config plugin: let other apps share text/links INTO Card Sage.
// Adds an ACTION_SEND intent-filter to MainActivity so the app appears in
// Android's share sheet. The shared text is read by the share-receiver
// native module (getSharedContent).
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withShareIntent(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const activity = manifest.manifest.application?.[0]?.activity?.find(
      (a) => a.$['android:name'] === '.MainActivity'
    );
    if (!activity) return config;

    const filter = {
      $: { 'android:label': 'Card Sage' },
      action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [{ $: { 'android:mimeType': 'text/plain' } }],
    };

    const filters = activity['intent-filter'] || [];
    // Avoid duplicates if the plugin runs twice.
    const exists = filters.some(
      (f) =>
        f.action?.[0]?.$?.['android:name'] === 'android.intent.action.SEND'
    );
    if (!exists) filters.push(filter);
    activity['intent-filter'] = filters;

    return config;
  });
};
