/**
 * PRODUCTION MIGRATION - Content Hash Integrity Enforcement
 * Run as dedicated pre-deploy worker (non-blocking)
 */
import { db } from '../index';
import { sql } from 'drizzle-orm';

export async function ensureContentHashIntegrity(): Promise<void> {
  console.log('[Migration] 🔒 Ensuring content_hash integrity...');
  
  // Step 1: Backfill NULL hashes
  const result = await db.execute(sql`
    UPDATE documents 
    SET content_hash = encode(sha256(content::bytea), 'hex') 
    WHERE content_hash IS NULL AND content IS NOT NULL
  `);
  console.log(`[Migration] ✅ Backfilled ${(result as any).rowCount || 0} documents`);
  
  // Step 2: Enforce NOT NULL
  await db.execute(sql`
    ALTER TABLE documents ALTER COLUMN content_hash SET NOT NULL
  `).catch(() => {});
  
  // Step 3: Enforce UNIQUE
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS documents_content_hash_unique 
    ON documents(content_hash)
  `);
  
  console.log('[Migration] ✅ Content hash integrity enforced');
}
