import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getLang, setLang as setLangCore, subscribe, t as tCore, initI18n } from './index.js';

const I18nContext = createContext({
  lang: 'he',
  setLang: () => {},
  t: (key) => key,
  dir: 'rtl',
});

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => initI18n());

  useEffect(() => subscribe((next) => setLangState(next)), []);

  const setLang = useCallback((next) => {
    setLangCore(next);
    setLangState(next);
  }, []);

  const t = useCallback((key, params) => tCore(key, params), [lang]);

  const value = useMemo(
    () => ({ lang, setLang, t, dir: lang === 'he' ? 'rtl' : 'ltr' }),
    [lang, setLang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function useT() {
  return useI18n().t;
}
