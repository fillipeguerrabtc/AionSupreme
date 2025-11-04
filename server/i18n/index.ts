/**
 * I18N (Internationalization) System
 * Supports PT-BR, EN-US, ES-ES
 * Production-ready with type-safe string interpolation
 */

import ptBR from './locales/pt-BR.json';
import enUS from './locales/en-US.json';
import esES from './locales/es-ES.json';

export type Locale = 'pt-BR' | 'en-US' | 'es-ES';

type TranslationObject = typeof ptBR;

const translations: Record<Locale, TranslationObject> = {
  'pt-BR': ptBR,
  'en-US': enUS,
  'es-ES': esES,
};

const defaultLocale: Locale = 'pt-BR';

/**
 * Get current locale from environment or default
 */
export function getLocale(): Locale {
  const envLocale = process.env.LOCALE || process.env.LANG;
  if (envLocale && envLocale in translations) {
    return envLocale as Locale;
  }
  return defaultLocale;
}

/**
 * Get translation by key path (e.g., "health.healthy")
 * Supports nested keys with dot notation
 */
function getByPath(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  
  return typeof current === 'string' ? current : undefined;
}

/**
 * Interpolate variables in string (e.g., "Hello {{name}}" → "Hello John")
 */
function interpolate(str: string, variables?: Record<string, string | number>): string {
  if (!variables) return str;
  
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return key in variables ? String(variables[key]) : match;
  });
}

/**
 * Translate a key with optional variable interpolation
 * 
 * @param key - Translation key (e.g., "health.healthy")
 * @param variables - Variables for interpolation (e.g., { count: 5 })
 * @param locale - Optional locale override
 * @returns Translated string
 * 
 * @example
 * t('health.healthy') // → "saudável" (PT-BR default)
 * t('chat.received_messages', { count: 5 }) // → "Recebidas 5 mensagens no histórico"
 * t('health.healthy', {}, 'en-US') // → "healthy"
 */
export function t(
  key: string,
  variables?: Record<string, string | number>,
  locale?: Locale
): string {
  const currentLocale = locale || getLocale();
  const translation = translations[currentLocale];
  
  if (!translation) {
    console.warn(`[I18N] Locale not found: ${currentLocale}, falling back to ${defaultLocale}`);
    return getByPath(translations[defaultLocale], key) || key;
  }
  
  const value = getByPath(translation, key);
  
  if (!value) {
    console.warn(`[I18N] Translation key not found: ${key} for locale: ${currentLocale}`);
    return key; // Return key itself if translation not found
  }
  
  return interpolate(value, variables);
}

/**
 * Create a translator function bound to a specific locale
 * Useful for request-scoped translations
 */
export function createTranslator(locale: Locale) {
  return (key: string, variables?: Record<string, string | number>) => 
    t(key, variables, locale);
}

/**
 * Get all available locales
 */
export function getAvailableLocales(): Locale[] {
  return Object.keys(translations) as Locale[];
}

/**
 * Check if a locale is supported
 */
export function isLocaleSupported(locale: string): locale is Locale {
  return locale in translations;
}
