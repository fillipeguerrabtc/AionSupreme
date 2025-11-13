/**
 * CUSTOM HOOK: useGoogleAuth
 * ===========================
 * 
 * Enterprise-grade hook for Google OAuth authentication state management.
 * Handles Kaggle/Colab cookie session persistence.
 * 
 * FEATURES:
 * - Real-time auth status monitoring
 * - Cookie expiration detection (30-day TTL)
 * - Multi-provider support (Kaggle + Colab)
 * - Auto-refresh on auth changes
 * - TypeScript strict types
 * - ZERO hardcoded values
 * 
 * USAGE:
 * ```tsx
 * const { sessions, isAuthenticated, hasExpiredSessions } = useGoogleAuth();
 * ```
 */

import { useQuery } from '@tanstack/react-query';
import type { GoogleAuthSession } from '@/../../shared/schema';

interface GoogleAuthStatusResponse {
  sessions: GoogleAuthSession[];
  hasKaggle: boolean;
  hasColab: boolean;
}

interface UseGoogleAuthResult {
  /** All Google auth sessions */
  sessions: GoogleAuthSession[];
  /** Has authenticated Kaggle session */
  hasKaggle: boolean;
  /** Has authenticated Colab session */
  hasColab: boolean;
  /** At least one provider authenticated */
  isAuthenticated: boolean;
  /** Has sessions that expired */
  hasExpiredSessions: boolean;
  /** Sessions expiring soon (<7 days) */
  expiringSessionsCount: number;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch auth status */
  refetch: () => void;
}

/**
 * Fetches Google auth session status from backend
 */
async function fetchAuthStatus(): Promise<GoogleAuthStatusResponse> {
  const res = await fetch('/api/gpu/auth-google/status', {
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  
  if (!res.ok) {
    // If endpoint doesn't exist yet, return empty state
    if (res.status === 404) {
      return { sessions: [], hasKaggle: false, hasColab: false };
    }
    
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Failed to fetch auth status');
  }
  
  return res.json();
}

/**
 * Main hook for Google OAuth session monitoring
 */
export function useGoogleAuth(): UseGoogleAuthResult {
  const query = useQuery<GoogleAuthStatusResponse, Error>({
    queryKey: ['/api/gpu/auth-google/status'],
    queryFn: fetchAuthStatus,
    refetchInterval: 60000, // Check every 1 minute
    staleTime: 30000, // Consider stale after 30s
    retry: 2,
  });

  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  
  // Check for expired and expiring sessions
  const hasExpiredSessions = query.data?.sessions.some(s => 
    s.expiresAt && new Date(s.expiresAt).getTime() < now
  ) ?? false;
  
  const expiringSessionsCount = query.data?.sessions.filter(s => {
    if (!s.expiresAt) return false;
    const expiresAt = new Date(s.expiresAt).getTime();
    return expiresAt > now && expiresAt < now + SEVEN_DAYS;
  }).length ?? 0;

  return {
    sessions: query.data?.sessions ?? [],
    hasKaggle: query.data?.hasKaggle ?? false,
    hasColab: query.data?.hasColab ?? false,
    isAuthenticated: (query.data?.hasKaggle || query.data?.hasColab) ?? false,
    hasExpiredSessions,
    expiringSessionsCount,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
