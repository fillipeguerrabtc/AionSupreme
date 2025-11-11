/**
 * Enterprise-Grade i18n System
 * Type-safe translations with PT-BR/EN-US/ES-ES support
 * 
 * Generated from AST analysis of codebase
 */

import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import type { Locale } from '@/types/i18n';

// Import locale files
import ptBR from '@/locales/pt-BR.json';
import enUS from '@/locales/en-US.json';
import esES from '@/locales/es-ES.json';

const locales = {
  'pt-BR': ptBR,
  'en-US': enUS,
  'es-ES': esES,
} as const;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    // Load from localStorage or default to PT-BR
    const saved = localStorage.getItem('aion-locale');
    return (saved as Locale) || 'pt-BR';
  });

  useEffect(() => {
    localStorage.setItem('aion-locale', locale);
  }, [locale]);

  const t = (key: string, fallback?: string): string => {
    const translations = locales[locale];
    const keys = key.split('.');
    
    let value: any = translations;
    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) break;
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    // Fallback chain: provided fallback → key itself → error marker
    return fallback || key || '[MISSING]';
  };

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}

// Convenience hook for just the translation function
export function useTranslation() {
  const { t } = useI18n();
  return { t };
}
