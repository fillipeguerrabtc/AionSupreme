# 🔧 GPU UI FIX PLAN - 12 LSP ERRORS

## PHASE 1-1: DOCUMENTATION COMPLETE ✅

**File:** `client/src/pages/admin/GPUManagementTab.tsx`  
**Total Errors:** 12 LSP diagnostics  
**Status:** ROOT CAUSE IDENTIFIED  

---

## 📋 ERROR MAPPING & SOLUTIONS

### ERROR 1: Line 129 - useGoogleAuth destructuring
```typescript
// ❌ CURRENT (WRONG):
const { authStatus, isLoading: authLoading } = useGoogleAuth();

// ✅ FIX:
const googleAuth = useGoogleAuth();
// Access: googleAuth.hasKaggle, googleAuth.hasColab, googleAuth.sessions, etc
```
**Root Cause:** Hook returns `{ sessions, hasKaggle, hasColab, isAuthenticated, hasExpiredSessions, expiringSessionsCount, isLoading, error, refetch }`, NOT `authStatus`

---

### ERROR 2-3: Lines 132-133 - useQuotaStatus destructuring
```typescript
// ❌ CURRENT (WRONG):
const { quotaStatus, isStale, alertLevel } = useQuotaStatus({
  pollingInterval: refreshInterval * 1000,
});

// ✅ FIX:
const quotaQuery = useQuotaStatus({
  refreshInterval: refreshInterval * 1000, // NOT pollingInterval
});
// Access: quotaQuery.data (QuotaStatus | undefined)
// quotaQuery.data contains: { kaggle, colab, kaggleAlert, colabAlert, isStale, lastSync, nextSync }
```
**Root Causes:**
- Hook returns `{ ...query, data }` where `data` is QuotaStatus
- Property is `refreshInterval` NOT `pollingInterval`
- `isStale` is inside `data`, not top-level
- `alertLevel` doesn't exist - use `kaggleAlert`/`colabAlert` from `data`

---

### ERROR 4: Line 137 - useQuotaSync destructuring
```typescript
// ❌ CURRENT (WRONG):
const { syncNow, isSyncing } = useQuotaSync();

// ✅ FIX:
const { sync, isSyncing } = useQuotaSync();
// Use sync() to trigger manual sync
```
**Root Cause:** Hook returns `sync` NOT `syncNow`

---

### ERROR 5-6: Lines 265, 273 - QuotaAlertBanner props
```typescript
// ❌ CURRENT (WRONG):
<QuotaAlertBanner
  provider="kaggle"
  quotaStatus={quotaStatus.kaggle} // ❌ doesn't exist
  onSync={() => syncNow()}
  data-testid="alert-kaggle"
/>

// ✅ FIX:
{quotaQuery.data?.kaggleAlert && quotaQuery.data.kaggleAlert.level !== 'normal' && (
  <QuotaAlertBanner
    level={quotaQuery.data.kaggleAlert.level as 'warning' | 'critical' | 'emergency'}
    provider="kaggle"
    percentage={quotaQuery.data.kaggleAlert.percentage}
    message={quotaQuery.data.kaggleAlert.message}
    onSync={sync}
    t={t}
    data-testid="alert-kaggle"
  />
)}
```
**Root Cause:** QuotaAlertBannerProps requires `{ level, provider, percentage, message, onSync?, t }`, NOT `quotaStatus`

---

### ERROR 7: Line 407 - AuthStatusBadge props
```typescript
// ❌ CURRENT (WRONG):
<AuthStatusBadge
  hasKaggle={authStatus?.hasKaggle || false}  // ❌ wrong props
  hasColab={authStatus?.hasColab || false}
  isLoading={authLoading}
  data-testid="auth-status-badge"
/>

// ✅ FIX:
<AuthStatusBadge
  status={
    googleAuth.hasKaggle || googleAuth.hasColab
      ? 'authenticated'
      : 'not_authenticated'
  }
  email={googleAuth.sessions[0]?.accountEmail}
  t={t}
  data-testid="auth-status-badge"
/>
```
**Root Cause:** AuthStatusBadgeProps requires `{ status, email?, daysUntilExpiration?, t }`, NOT `hasKaggle/hasColab/isLoading`

---

### ERROR 8-9: Lines 469, 477 - QuotaProviderCard missing props
```typescript
// ❌ CURRENT (WRONG):
<QuotaProviderCard
  provider="kaggle"
  quotaData={quotaStatus.kaggle}  // ❌ quotaStatus doesn't exist
  isStale={isStale}  // ❌ isStale not top-level
  data-testid="card-quota-kaggle"
/>

// ✅ FIX:
<QuotaProviderCard
  provider="kaggle"
  quotaData={quotaQuery.data?.kaggle || null}
  alertLevel={quotaQuery.data?.kaggleAlert?.level || 'normal'}
  isStale={quotaQuery.data?.isStale || false}
  t={t}
  data-testid="card-quota-kaggle"
/>
```
**Root Cause:** QuotaProviderCardProps requires `{ provider, quotaData, alertLevel, isStale, t }` - missing `alertLevel` and `t`

---

### ERROR 10: Line 517 - UsageChart props
```typescript
// ❌ CURRENT (WRONG):
<UsageChart
  provider="kaggle"  // ❌ doesn't exist in props
  data-testid="chart-usage"
/>

// ✅ FIX:
<UsageChart
  data={[]} // DataPoint[] - needs historical data (TODO: implement endpoint)
  t={t}
  data-testid="chart-usage"
/>
```
**Root Cause:** UsageChartProps requires `{ data, t }`, NOT `provider`

---

### ERROR 11: Line 538 - SessionTimeline props
```typescript
// ❌ CURRENT (WRONG):
<SessionTimeline
  kaggleQuota={quotaStatus.kaggle}  // ❌ wrong props
  colabQuota={quotaStatus.colab}
  data-testid="timeline-sessions"
/>

// ✅ FIX:
<SessionTimeline
  sessions={[
    quotaQuery.data?.kaggle && {
      provider: 'kaggle' as const,
      status: quotaQuery.data.kaggle.quotaData?.canStart ? 'available' : 'cooldown',
      sessionRemaining: quotaQuery.data.kaggle.quotaData?.sessionRemainingHours,
      cooldownRemaining: quotaQuery.data.kaggle.quotaData?.cooldownRemainingHours,
      canStart: quotaQuery.data.kaggle.quotaData?.canStart,
      shouldStop: quotaQuery.data.kaggle.quotaData?.shouldStop,
    },
    quotaQuery.data?.colab && {
      provider: 'colab' as const,
      status: quotaQuery.data.colab.quotaData?.canStart ? 'available' : 'cooldown',
      sessionRemaining: quotaQuery.data.colab.quotaData?.sessionRemainingHours,
      cooldownRemaining: quotaQuery.data.colab.quotaData?.cooldownRemainingHours,
      canStart: quotaQuery.data.colab.quotaData?.canStart,
      shouldStop: quotaQuery.data.colab.quotaData?.shouldStop,
    },
  ].filter(Boolean) as SessionState[]}
  t={t}
  data-testid="timeline-sessions"
/>
```
**Root Cause:** SessionTimelineProps requires `{ sessions, t }`, NOT `kaggleQuota/colabQuota`

---

## 🔄 DATA TRANSFORMATION DETAILS

### SessionTimeline Data Shaping
**Input:** `QuotaStatus.kaggle` and `QuotaStatus.colab` (QuotaScrapingResult | null)  
**Output:** `SessionState[]`

```typescript
interface SessionState {
  provider: 'kaggle' | 'colab';
  status: 'idle' | 'active' | 'cooldown' | 'available';
  sessionRemaining?: number;
  cooldownRemaining?: number;
  canStart?: boolean;
  shouldStop?: boolean;
}

// Transformation logic:
const sessions: SessionState[] = [
  // Kaggle session
  quotaQuery.data?.kaggle && {
    provider: 'kaggle' as const,
    status: (() => {
      const q = quotaQuery.data.kaggle.quotaData;
      if (!q) return 'idle';
      if (q.inCooldown) return 'cooldown';
      if (q.sessionRemainingHours && q.sessionRemainingHours > 0) return 'active';
      if (q.canStart) return 'available';
      return 'idle';
    })(),
    sessionRemaining: quotaQuery.data.kaggle.quotaData?.sessionRemainingHours,
    cooldownRemaining: quotaQuery.data.kaggle.quotaData?.cooldownRemainingHours,
    canStart: quotaQuery.data.kaggle.quotaData?.canStart,
    shouldStop: quotaQuery.data.kaggle.quotaData?.shouldStop,
  },
  
  // Colab session
  quotaQuery.data?.colab && {
    provider: 'colab' as const,
    status: (() => {
      const q = quotaQuery.data.colab.quotaData;
      if (!q) return 'idle';
      if (q.inCooldown) return 'cooldown';
      if (q.sessionRemainingHours && q.sessionRemainingHours > 0) return 'active';
      if (q.canStart) return 'available';
      return 'idle';
    })(),
    sessionRemaining: quotaQuery.data.colab.quotaData?.sessionRemainingHours,
    cooldownRemaining: quotaQuery.data.colab.quotaData?.cooldownRemainingHours,
    canStart: quotaQuery.data.colab.quotaData?.canStart,
    shouldStop: quotaQuery.data.colab.quotaData?.shouldStop,
  },
].filter(Boolean) as SessionState[];
```

**Status Mapping Rules:**
- `inCooldown === true` → status = 'cooldown'
- `sessionRemainingHours > 0` → status = 'active'
- `canStart === true` → status = 'available'
- Otherwise → status = 'idle'

---

### UsageChart Data Shaping
**Input:** Historical quota data (TODO: backend endpoint needed)  
**Output:** `DataPoint[]`

```typescript
interface DataPoint {
  timestamp: Date;
  kaggleUsage?: number; // percentage 0-100
  colabUsage?: number; // percentage 0-100
}

// For now: Empty array until historical endpoint exists
// Future: GET /api/gpu/quota-history?range=24h
const usageData: DataPoint[] = [];

// When backend ready:
const usageData: DataPoint[] = historicalData.map(entry => ({
  timestamp: new Date(entry.timestamp),
  kaggleUsage: entry.kaggle 
    ? (entry.kaggle.weeklyUsedHours / entry.kaggle.weeklyMaxHours) * 100 
    : undefined,
  colabUsage: entry.colab
    ? (entry.colab.computeUnitsUsed / entry.colab.computeUnitsTotal) * 100
    : undefined,
}));
```

**Note:** UsageChart will show "No data available" until historical endpoint is implemented. Component already handles empty array gracefully.

---

## 🎯 FIX STRATEGY

### Step 1: Update Hook Destructuring (Lines 129, 132-133, 137)
- Change `authStatus` → `googleAuth`
- Change `{ quotaStatus, isStale, alertLevel }` → `quotaQuery`
- Change `pollingInterval` → `refreshInterval`
- Change `syncNow` → `sync`

### Step 2: Update Component Props (Lines 265, 273, 407, 469, 477, 517, 538)
- QuotaAlertBanner: Extract level/percentage/message from `quotaQuery.data.kaggleAlert`
- AuthStatusBadge: Calculate status from `googleAuth.hasKaggle/hasColab`
- QuotaProviderCard: Add `alertLevel` and `t` props
- UsageChart: Provide empty array `[]` + `t` (historical data TODO)
- SessionTimeline: Transform quotas into `SessionState[]` using status mapping logic above

### Step 3: Validate 100% Enterprise
- ✅ All strings i18n (use `t()` function)
- ✅ All components have `data-testid`
- ✅ ZERO hardcoded values
- ✅ Error handling with try-catch
- ✅ Loading states implemented

### Step 4: Test
- Verify ZERO LSP errors
- Test runtime functionality
- E2E test with run_test

---

## ✅ ACCEPTANCE CRITERIA (100% ENTERPRISE)

### A1: TypeScript Validation
- [ ] **ZERO LSP errors** in `GPUManagementTab.tsx` (verified with `get_latest_lsp_diagnostics`)
- [ ] All hook destructuring matches actual return types
- [ ] All component props match interface definitions
- [ ] No `any` types used (strict TypeScript)

### A2: Alert Gating Logic
- [ ] QuotaAlertBanner only renders when `level !== 'normal'`
- [ ] Kaggle alert: `quotaQuery.data?.kaggleAlert && quotaQuery.data.kaggleAlert.level !== 'normal'`
- [ ] Colab alert: `quotaQuery.data?.colabAlert && quotaQuery.data.colabAlert.level !== 'normal'`
- [ ] No alerts shown for unauthenticated users

### A3: Manual Sync Cache Invalidation
- [ ] `sync()` function correctly triggers mutation
- [ ] TanStack Query cache invalidated: `queryClient.invalidateQueries({ queryKey: ['/api/gpu/quota-status'] })`
- [ ] Success toast shows after sync completes
- [ ] Error toast shows on sync failure
- [ ] QuotaProviderCard updates automatically after sync

### A4: i18n Validation (PT/EN/ES)
- [ ] ALL user-facing strings use `t()` function
- [ ] AuthStatusBadge: `t('gpu.auth.*')` keys
- [ ] QuotaProviderCard: `t('gpu.quota.*')` keys
- [ ] QuotaAlertBanner: `t('gpu.alerts.*')` keys
- [ ] SessionTimeline: `t('gpu.session.*')` keys
- [ ] UsageChart: `t('gpu.chart.*')` keys
- [ ] ZERO hardcoded English/Portuguese/Spanish strings

### A5: Test ID Coverage
- [ ] All interactive elements have `data-testid`
- [ ] Pattern: `button-*`, `input-*`, `card-*`, `badge-*`
- [ ] Dynamic elements: `card-quota-${provider}`, `alert-${level}`
- [ ] Testable with Playwright E2E

### A6: Loading & Error States
- [ ] `quotaQuery.isLoading` shows skeleton/spinner
- [ ] `googleAuth.isLoading` shows loading badge
- [ ] `isSyncing` disables sync button + shows spinner
- [ ] Error states display user-friendly messages
- [ ] Retry mechanisms for failed requests

### A7: Data Transformation Correctness
- [ ] SessionState status mapping follows rules (idle/active/cooldown/available)
- [ ] DataPoint conversion calculates percentages correctly
- [ ] null/undefined values handled gracefully
- [ ] filter(Boolean) removes falsy entries from arrays

### A8: Runtime Validation
- [ ] No console errors in browser
- [ ] Components render without crashes
- [ ] Auto-refresh works (30s default)
- [ ] Manual sync updates UI immediately
- [ ] Dark mode works correctly
- [ ] Responsive layout (mobile/tablet/desktop)

---

## 📊 IMPLEMENTATION CHECKLIST

### Phase 1: Hook Fixes
- [ ] Fix ERROR 1: `useGoogleAuth` → `googleAuth`
- [ ] Fix ERROR 2-3: `useQuotaStatus` → `quotaQuery` + `refreshInterval`
- [ ] Fix ERROR 4: `useQuotaSync` → `sync`

### Phase 2: Component Props
- [ ] Fix ERROR 5-6: QuotaAlertBanner (extract level/percentage/message)
- [ ] Fix ERROR 7: AuthStatusBadge (calculate status)
- [ ] Fix ERROR 8-9: QuotaProviderCard (add alertLevel + t)
- [ ] Fix ERROR 10: UsageChart (remove provider, add data + t)
- [ ] Fix ERROR 11: SessionTimeline (transform to SessionState[])

### Phase 3: Validation
- [ ] Run `get_latest_lsp_diagnostics` → ZERO errors
- [ ] Test in browser → no runtime errors
- [ ] Verify all acceptance criteria A1-A8

### Phase 4: Review & Complete
- [ ] Architect review (include_git_diff=true)
- [ ] Fix any issues from review
- [ ] Mark PHASE1-1 completed
- [ ] Proceed to PHASE1-2
