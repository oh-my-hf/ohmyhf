/** i18next-parser: extracts/syncs translation keys from the renderer sources. */
module.exports = {
  locales: ['en', 'zh-CN'],
  output: 'src/renderer/src/i18n/locales/$LOCALE/$NAMESPACE.json',
  input: ['src/renderer/src/**/*.{ts,tsx}'],
  defaultNamespace: 'common',
  keySeparator: '.',
  namespaceSeparator: ':',
  createOldCatalogs: false,
  // Some keys are looked up dynamically (sort options, status names); keep them.
  keepRemoved: true,
  sort: true
}
