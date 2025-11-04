/**
 * I18N Middleware for Express
 * Detects locale from Accept-Language header or query parameter
 */

import type { Request, Response, NextFunction } from 'express';
import { type Locale, isLocaleSupported, createTranslator, getLocale as getDefaultLocale } from './index';

declare global {
  namespace Express {
    interface Request {
      locale: Locale;
      t: (key: string, variables?: Record<string, string | number>) => string;
    }
  }
}

/**
 * Normalize locale string to match supported format
 * Example: "en-us" → "en-US", "pt-br" → "pt-BR"
 */
function normalizeLocale(locale: string): string {
  const parts = locale.split('-');
  if (parts.length === 2) {
    return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
  }
  return locale;
}

/**
 * Parse Accept-Language header to extract preferred locale
 * Example: "en-US,en;q=0.9,pt-BR;q=0.8" → "en-US"
 */
function parseAcceptLanguage(acceptLanguage?: string): Locale | null {
  if (!acceptLanguage) return null;
  
  const languages = acceptLanguage
    .split(',')
    .map(lang => {
      const [locale, qPart] = lang.trim().split(';');
      const q = qPart ? parseFloat(qPart.split('=')[1]) : 1.0;
      return { locale: normalizeLocale(locale.trim()), q };
    })
    .sort((a, b) => b.q - a.q);
  
  for (const { locale } of languages) {
    if (isLocaleSupported(locale)) {
      return locale as Locale;
    }
  }
  
  return null;
}

/**
 * I18N middleware
 * Attaches locale and translator to request object
 */
export function i18nMiddleware(req: Request, res: Response, next: NextFunction): void {
  const localeFromQuery = req.query.locale as string | undefined;
  const localeFromHeader = parseAcceptLanguage(req.headers['accept-language']);
  
  let locale: Locale;
  
  if (localeFromQuery) {
    const normalized = normalizeLocale(localeFromQuery);
    if (isLocaleSupported(normalized)) {
      locale = normalized as Locale;
    } else {
      locale = localeFromHeader || getDefaultLocale();
    }
  } else if (localeFromHeader) {
    locale = localeFromHeader;
  } else {
    locale = getDefaultLocale();
  }
  
  req.locale = locale;
  req.t = createTranslator(locale);
  
  next();
}
