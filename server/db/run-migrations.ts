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
  
  let failedMigrations: string[] = [];
  
  for (const migration of migrations) {
    try {
      console.log(`📦 Running migration: ${migration.name}...`);
      await migration.run();
      console.log(`✅ Migration ${migration.name} completed successfully\n`);
    } catch (error: any) {
      console.error('\n╔════════════════════════════════════════════════════════════╗');
      console.error('║  ⚠️  MIGRATION FAILURE - MANUAL INTERVENTION REQUIRED     ║');
      console.error('╚════════════════════════════════════════════════════════════╝\n');
      console.error(`❌ Migration: ${migration.name}`);
      console.error(`❌ Error: ${error.message}`);
      console.error(`❌ Stack: ${error.stack}\n`);
      console.error('🔧 ACTION REQUIRED:');
      console.error('   1. Review the error above');
      console.error('   2. Fix the migration file if needed');
      console.error('   3. Check database schema for conflicts');
      console.error('   4. Re-run migrations manually\n');
      
      failedMigrations.push(migration.name);
      throw error; // Fail fast - don't continue if migration fails
    }
  }
  
  if (failedMigrations.length > 0) {
    console.error(`\n❌ [Migration Runner] ${failedMigrations.length} migration(s) failed: ${failedMigrations.join(', ')}\n`);
  } else {
    console.log('✅ [Migration Runner] All migrations completed successfully\n');
  }
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
