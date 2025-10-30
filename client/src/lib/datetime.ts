/**
 * Timezone and DateTime Utilities
 * 
 * Provides consistent datetime formatting across the application
 * with support for dynamic timezone configuration.
 */

/**
 * Common timezones for quick selection
 */
export const COMMON_TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'Brasília (GMT-3)', country: 'Brasil' },
  { value: 'America/New_York', label: 'New York (GMT-5)', country: 'USA' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (GMT-8)', country: 'USA' },
  { value: 'America/Chicago', label: 'Chicago (GMT-6)', country: 'USA' },
  { value: 'Europe/London', label: 'London (GMT+0)', country: 'UK' },
  { value: 'Europe/Paris', label: 'Paris (GMT+1)', country: 'France' },
  { value: 'Europe/Berlin', label: 'Berlin (GMT+1)', country: 'Germany' },
  { value: 'Europe/Madrid', label: 'Madrid (GMT+1)', country: 'Spain' },
  { value: 'Europe/Moscow', label: 'Moscow (GMT+3)', country: 'Russia' },
  { value: 'Asia/Tokyo', label: 'Tokyo (GMT+9)', country: 'Japan' },
  { value: 'Asia/Shanghai', label: 'Shanghai (GMT+8)', country: 'China' },
  { value: 'Asia/Dubai', label: 'Dubai (GMT+4)', country: 'UAE' },
  { value: 'Asia/Kolkata', label: 'Mumbai (GMT+5:30)', country: 'India' },
  { value: 'Australia/Sydney', label: 'Sydney (GMT+10)', country: 'Australia' },
  { value: 'Pacific/Auckland', label: 'Auckland (GMT+12)', country: 'New Zealand' },
] as const;

/**
 * Format a date/datetime with both date AND time in the specified timezone
 * 
 * @param date - Date object, ISO string, or timestamp
 * @param timezone - IANA timezone (e.g., 'America/Sao_Paulo')
 * @param options - Custom formatting options
 * @returns Formatted date and time string
 * 
 * @example
 * formatDateTimeInTimezone(new Date(), 'America/Sao_Paulo')
 * // "30/10/2025 14:30:45"
 */
export function formatDateTimeInTimezone(
  date: Date | string | number,
  timezone: string = 'America/Sao_Paulo',
  options?: {
    includeSeconds?: boolean;
    format?: 'short' | 'medium' | 'long';
  }
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  
  if (!dateObj || isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  const { includeSeconds = true, format = 'medium' } = options || {};

  try {
    // Use Intl.DateTimeFormat for proper timezone conversion
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: includeSeconds ? '2-digit' : undefined,
      hour12: false, // Use 24-hour format
    });

    return formatter.format(dateObj);
  } catch (error) {
    console.error(`Error formatting date with timezone ${timezone}:`, error);
    return dateObj.toLocaleString('pt-BR');
  }
}

/**
 * Format a date only (no time) in the specified timezone
 * 
 * @param date - Date object, ISO string, or timestamp
 * @param timezone - IANA timezone
 * @returns Formatted date string (DD/MM/YYYY)
 */
export function formatDateInTimezone(
  date: Date | string | number,
  timezone: string = 'America/Sao_Paulo'
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  
  if (!dateObj || isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  try {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    return formatter.format(dateObj);
  } catch (error) {
    console.error(`Error formatting date with timezone ${timezone}:`, error);
    return dateObj.toLocaleDateString('pt-BR');
  }
}

/**
 * Format time only (no date) in the specified timezone
 * 
 * @param date - Date object, ISO string, or timestamp
 * @param timezone - IANA timezone
 * @param includeSeconds - Include seconds in output
 * @returns Formatted time string (HH:MM or HH:MM:SS)
 */
export function formatTimeInTimezone(
  date: Date | string | number,
  timezone: string = 'America/Sao_Paulo',
  includeSeconds: boolean = true
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  
  if (!dateObj || isNaN(dateObj.getTime())) {
    return 'Invalid Time';
  }

  try {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: includeSeconds ? '2-digit' : undefined,
      hour12: false,
    });

    return formatter.format(dateObj);
  } catch (error) {
    console.error(`Error formatting time with timezone ${timezone}:`, error);
    return dateObj.toLocaleTimeString('pt-BR', { hour12: false });
  }
}

/**
 * Get current date and time in the specified timezone
 * 
 * @param timezone - IANA timezone
 * @returns Current datetime string
 */
export function getCurrentDateTimeInTimezone(timezone: string = 'America/Sao_Paulo'): string {
  return formatDateTimeInTimezone(new Date(), timezone);
}

/**
 * Relative time formatting (e.g., "2 hours ago", "in 3 days")
 * 
 * @param date - Date object, ISO string, or timestamp
 * @param locale - Locale for relative time text
 * @returns Relative time string
 */
export function formatRelativeTime(
  date: Date | string | number,
  locale: string = 'pt-BR'
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  
  if (!dateObj || isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  const now = new Date();
  const diffMs = dateObj.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(diffSec) < 60) {
    return rtf.format(diffSec, 'second');
  } else if (Math.abs(diffMin) < 60) {
    return rtf.format(diffMin, 'minute');
  } else if (Math.abs(diffHour) < 24) {
    return rtf.format(diffHour, 'hour');
  } else if (Math.abs(diffDay) < 30) {
    return rtf.format(diffDay, 'day');
  } else {
    return formatDateInTimezone(dateObj);
  }
}

/**
 * Validate if a string is a valid IANA timezone
 * 
 * @param timezone - Timezone string to validate
 * @returns true if valid, false otherwise
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}
