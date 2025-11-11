# String Inventory Summary
Generated: 2025-11-11T18:02:14.096Z
Analysis Time: 8.78s

## Overview
- **Total Strings**: 22796
- **Files with Strings**: 341
- **Excluded Files**: 1

## By Category
- **unknown**: 18223 (79.9%)
- **ui**: 2015 (8.8%)
- **error**: 1405 (6.2%)
- **validation**: 650 (2.9%)
- **config**: 503 (2.2%)

## Top 10 Files by String Count
1. `/home/runner/workspace/client/src/lib/i18n.tsx`: 3233 strings
2. `/home/runner/workspace/shared/schema.ts`: 1341 strings
3. `/home/runner/workspace/server/routes.ts`: 968 strings
4. `/home/runner/workspace/client/src/pages/admin/TokenMonitoring.tsx`: 638 strings
5. `/home/runner/workspace/client/src/pages/admin/CurationQueuePage.tsx`: 494 strings
6. `/home/runner/workspace/client/src/pages/admin/AdminDashboard.tsx`: 447 strings
7. `/home/runner/workspace/server/i18n/translations/meta-learning.ts`: 435 strings
8. `/home/runner/workspace/client/src/pages/admin/DatasetsTab.tsx`: 371 strings
9. `/home/runner/workspace/server/seed-rbac.ts`: 361 strings
10. `/home/runner/workspace/client/src/components/IconPicker.tsx`: 358 strings

## Next Steps
1. Review `string-inventory.json` for detailed occurrences
2. Create shared translation registry with type-safe keys
3. Build codemod to transform strings to i18n calls
4. Populate PT-BR/EN-US/ES-ES locales
5. Add ESLint rule to prevent new hardcoded strings

## Sample Occurrences
- `/home/runner/workspace/server/db.ts:1` [unknown] "@neondatabase/serverless..." → `unknown.db.neondatabaseserverless`
- `/home/runner/workspace/server/db.ts:2` [unknown] "drizzle-orm/neon-serverless..." → `unknown.db.drizzleormneonserverless`
- `/home/runner/workspace/server/db.ts:3` [unknown] "ws..." → `unknown.db.ws`
- `/home/runner/workspace/server/db.ts:4` [unknown] "@shared/schema..." → `unknown.db.sharedschema`
- `/home/runner/workspace/server/db.ts:10` [error] "DATABASE_URL must be set. Did you forget to provis..." → `error.db.databaseurl_must_be_set`
