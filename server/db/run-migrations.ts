/**
 * PRODUCTION-GRADE MIGRATION RUNNER
 * 
 * Executes all database migrations in order.
 * Safe to run multiple times (idempotent).
 * 
 * Usage:
 *   tsx server/db/run-migrations.ts
 */

import { ensureContentHashIntegrity } from './migrations/content-hash-integrity';

export async function runAllMigrations(): Promise<void> {
  console.log('\n🔄 [Migration Runner] Starting database migrations...\n');
  
  const migrations = [
    {
      name: 'content-hash-integrity',
      run: ensureContentHashIntegrity,
    },
    // Add more migrations here as needed
  ];
  
  for (const migration of migrations) {
    try {
      console.log(`📦 Running migration: ${migration.name}...`);
      await migration.run();
      console.log(`✅ Migration ${migration.name} completed successfully\n`);
    } catch (error: any) {
      console.error(`❌ Migration ${migration.name} failed:`, error.message);
      throw error; // Fail fast - don't continue if migration fails
    }
  }
  
  console.log('✅ [Migration Runner] All migrations completed successfully\n');
}

// CLI execution (ES module compatible)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runAllMigrations()
    .then(() => {
      console.log('🎉 Migration runner finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration runner failed:', error);
      process.exit(1);
    });
}
