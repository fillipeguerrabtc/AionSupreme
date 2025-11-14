/**
 * GPU COMPONENT UTILITIES - ENTERPRISE 2025
 * ==========================================
 * 
 * Shared utilities for GPU-related components.
 * 
 * FEATURES:
 * - Translation validation with dev-time guards
 * - Type-safe i18n helpers
 * - Enterprise error handling
 */

/**
 * Requires a translation to exist, throwing in development if missing.
 * 
 * This enforces explicit i18n coverage and surfaces missing keys during development.
 * In production, falls back to the key path to avoid runtime crashes.
 * 
 * @param value - The translation value (may be undefined)
 * @param keyPath - The key path for error messages (e.g., 'auth.authenticated')
 * @returns The translation value or key path as fallback
 * @throws {Error} In development when translation is missing
 * 
 * @example
 * ```typescript
 * const label = requireTranslation(translations.auth.authenticated, 'auth.authenticated');
 * ```
 */
export function requireTranslation(value: string | undefined, keyPath: string): string {
  if (value === undefined || value === '') {
    if (import.meta.env.DEV) {
      console.error(`[AION i18n] Missing translation for key: ${keyPath}`);
      throw new Error(`Missing translation: ${keyPath}`);
    }
    return keyPath; // graceful fallback in production
  }
  return value;
}
