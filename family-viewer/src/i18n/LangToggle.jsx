import React from 'react';
import { useI18n } from './I18nContext.jsx';

/** Compact language switch control for sidebar / topbar. */
export default function LangToggle({ className = '' }) {
  const { lang, setLang, t } = useI18n();
  const next = lang === 'he' ? 'en' : 'he';
  const label = lang === 'he' ? t('lang.switchToEn') : t('lang.switchToHe');
  const short = lang === 'he' ? t('lang.en') : t('lang.he');

  return (
    <button
      type="button"
      className={`lang-toggle ${className}`.trim()}
      onClick={() => setLang(next)}
      aria-label={label}
      title={label}
    >
      <span className="lang-toggle-code" aria-hidden="true">{short}</span>
    </button>
  );
}
