import { I18nService, syncLocaleSelect } from '../i18n/I18nService.js';

async function main() {
  const i18n = new I18nService({
    translationsUrl: new URL('../../data/i18n/index.json', import.meta.url).href,
  });

  await i18n.initialize();

  const localeSelect = document.querySelector('[data-locale-select]');
  if (!(localeSelect instanceof HTMLSelectElement)) {
    i18n.applyTo(document);
    return;
  }

  const applyTranslations = () => {
    syncLocaleSelect(localeSelect, i18n);
    i18n.applyTo(document);
  };

  localeSelect.addEventListener('change', () => {
    i18n.setLocale(localeSelect.value);
  });

  i18n.addEventListener('change', applyTranslations);
  applyTranslations();
}

main().catch((error) => {
  console.error(error);
});
