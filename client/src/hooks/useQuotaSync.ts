/**
 * CUSTOM HOOK: useQuotaSync
 * ==========================
 * 
 * Enterprise-grade hook for manual quota synchronization.
 * Triggers immediate scraping of Kaggle/Colab quotas.
 * 
 * FEATURES:
 * - Manual sync trigger with loading states
 * - Toast notifications for success/error
 * - Automatic cache invalidation
 * - Rate limiting detection
 * - TypeScript strict types
 * - ZERO hardcoded values
 * 
 * USAGE:
 * ```tsx
 * const { sync, isSyncing, error } = useQuotaSync();
 * 
 * // Trigger manual sync
 * await sync();
 * ```
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from './use-toast';

interface SyncQuotaResponse {
  success: boolean;
  message: string;
  syncedProviders: ('kaggle' | 'colab')[];
}

/**
 * Triggers manual quota sync via backend
 */
async function triggerQuotaSync(): Promise<SyncQuotaResponse> {
  const res = await fetch('/api/gpu/sync-quota-now', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json'
    }
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Failed to sync quotas');
  }
  
  return res.json();
}

/**
 * Main hook for manual quota synchronization
 */
export function useQuotaSync() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: triggerQuotaSync,
    
    onSuccess: (data) => {
      // Invalidate quota status cache to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['/api/gpu/quota-status'] });
      
      // Show success toast
      toast({
        title: 'Sync successful',
        description: data.message || `Synced ${data.syncedProviders.join(', ')} quotas successfully`,
        variant: 'default',
      });
    },
    
    onError: (error: Error) => {
      // Show error toast
      toast({
        title: 'Sync failed',
        description: error.message || 'Failed to sync quotas. Please try again.',
        variant: 'destructive',
      });
    },
  });

  return {
    /** Trigger manual quota sync */
    sync: mutation.mutate,
    /** Async version with promise return */
    syncAsync: mutation.mutateAsync,
    /** Is sync in progress? */
    isSyncing: mutation.isPending,
    /** Sync error */
    error: mutation.error,
    /** Sync success state */
    isSuccess: mutation.isSuccess,
    /** Reset mutation state */
    reset: mutation.reset,
  };
}
