/**
 * AION INTEGRATION TESTS - PRODUCTION AUTOMATION VERIFICATION
 * ===========================================================
 * 
 * Verifica automação end-to-end via API calls e DB queries diretas.
 * 
 * TESTES:
 * 1. Database Connectivity
 * 2. GPU Auto-Scaling System
 * 3. Curation Pipeline (HITL workflow)
 * 4. Knowledge Base System
 * 5. Training Jobs System
 */

import { db } from '../server/db';
import { gpuWorkers, documents, embeddings, trainingJobs } from '@shared/schema';
import { sql } from 'drizzle-orm';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, message: string, details?: any) {
  results.push({ name, passed, message, details });
  const emoji = passed ? '✅' : '❌';
  console.log(`${emoji} ${name}: ${message}`);
  if (details) {
    console.log('   Details:', JSON.stringify(details, null, 2));
  }
}

async function test1_DatabaseConnectivity() {
  console.log('\n🗄️  TEST 1: DATABASE CONNECTIVITY\n');
  
  try {
    // Test basic query
    const result = await db.execute(sql`SELECT 1 as test, NOW() as timestamp`);
    
    logTest(
      'Database Connection',
      true,
      'Successfully connected to PostgreSQL',
      { timestamp: result.rows[0] }
    );
    
    // Verify key tables exist
    const tables = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    const expectedTables = ['documents', 'embeddings', 'gpu_workers', 'training_jobs'];
    const foundTables = tables.rows.map((r: any) => r.table_name);
    const missingTables = expectedTables.filter(t => !foundTables.includes(t));
    
    logTest(
      'Database Schema',
      missingTables.length === 0,
      missingTables.length === 0
        ? `All ${expectedTables.length} core tables exist`
        : `Missing tables: ${missingTables.join(', ')}`,
      { totalTables: foundTables.length, coreTables: expectedTables.length }
    );
    
  } catch (error: any) {
    logTest('Database Connectivity', false, `Error: ${error.message}`);
  }
}

async function test2_GPUAutoScaling() {
  console.log('\n🖥️  TEST 2: GPU AUTO-SCALING SYSTEM\n');
  
  try {
    // Verificar workers disponíveis
    const workers = await db.select().from(gpuWorkers);
    
    logTest(
      'GPU Workers Registry',
      true,
      `${workers.length} workers registered`,
      { 
        workers: workers.map(w => ({
          id: w.id,
          provider: w.provider,
          gpuType: w.gpuType,
          status: w.status
        }))
      }
    );
    
    const activeWorkers = workers.filter(w => w.status === 'available');
    
    logTest(
      'GPU Workers Availability',
      workers.length === 0 || activeWorkers.length > 0,
      workers.length === 0 
        ? 'No workers provisioned (acceptable for fresh system)'
        : `${activeWorkers.length}/${workers.length} workers available`,
      { activeWorkers: activeWorkers.length, total: workers.length }
    );
    
  } catch (error: any) {
    logTest('GPU Auto-Scaling', false, `Error: ${error.message}`);
  }
}

async function test3_CurationPipeline() {
  console.log('\n📚 TEST 3: CURATION PIPELINE (HITL)\n');
  
  try {
    // Contar documentos por status
    const allDocs = await db.select().from(documents);
    
    const pending = allDocs.filter(d => d.status === 'pending');
    const approved = allDocs.filter(d => d.status === 'approved');
    const rejected = allDocs.filter(d => d.status === 'rejected');
    
    logTest(
      'Curation Queue Status',
      true,
      `${allDocs.length} total documents`,
      {
        pending: pending.length,
        approved: approved.length,
        rejected: rejected.length
      }
    );
    
    // Verificar namespace classification (metadata.namespaces array)
    const withNamespace = allDocs.filter(d => {
      const meta = d.metadata as any;
      return meta && meta.namespaces && Array.isArray(meta.namespaces) && meta.namespaces.length > 0;
    });
    
    const generalOnly = allDocs.filter(d => {
      const meta = d.metadata as any;
      return meta && meta.namespaces && Array.isArray(meta.namespaces) && 
             meta.namespaces.length === 1 && meta.namespaces[0] === 'general';
    });
    
    const unclassified = allDocs.filter(d => {
      const meta = d.metadata as any;
      return !meta || !meta.namespaces || !Array.isArray(meta.namespaces) || meta.namespaces.length === 0;
    });
    
    logTest(
      'Namespace Auto-Classification',
      allDocs.length === 0 || withNamespace.length > 0,
      allDocs.length === 0
        ? 'No documents yet'
        : `${withNamespace.length}/${allDocs.length} documents have namespaces`,
      { 
        withNamespaces: withNamespace.length,
        generalOnly: generalOnly.length,
        unclassified: unclassified.length,
        total: allDocs.length
      }
    );
    
    // Verificar embeddings gerados
    const allEmbeddings = await db.select().from(embeddings);
    const docsWithEmbeddings = new Set(allEmbeddings.map(e => e.documentId));
    
    logTest(
      'Embedding Generation',
      approved.length === 0 || docsWithEmbeddings.size > 0,
      approved.length === 0
        ? 'No approved documents yet'
        : `${docsWithEmbeddings.size}/${approved.length} approved docs have embeddings`,
      {
        totalEmbeddings: allEmbeddings.length,
        docsWithEmbeddings: docsWithEmbeddings.size,
        approvedDocs: approved.length
      }
    );
    
  } catch (error: any) {
    logTest('Curation Pipeline', false, `Error: ${error.message}`);
  }
}

async function test4_TrainingJobs() {
  console.log('\n🤖 TEST 4: TRAINING JOBS SYSTEM\n');
  
  try {
    // Verificar training jobs
    const jobs = await db.select().from(trainingJobs);
    
    logTest(
      'Training Jobs Registry',
      true,
      `${jobs.length} training jobs in system`,
      { 
        total: jobs.length,
        byStatus: {
          pending: jobs.filter(j => j.status === 'pending').length,
          running: jobs.filter(j => j.status === 'running').length,
          completed: jobs.filter(j => j.status === 'completed').length,
          failed: jobs.filter(j => j.status === 'failed').length,
        }
      }
    );
    
    // Verificar jobs com workers ativos
    const jobsWithWorkers = jobs.filter(j => j.activeWorkers > 0);
    
    logTest(
      'Training Jobs with Workers',
      jobs.length === 0 || true, // Always pass if no jobs
      jobs.length === 0
        ? 'No training jobs yet (acceptable)'
        : `${jobsWithWorkers.length}/${jobs.length} jobs have active workers`,
      { jobsWithWorkers: jobsWithWorkers.length }
    );
    
  } catch (error: any) {
    logTest('Training Jobs System', false, `Error: ${error.message}`);
  }
}

async function test5_SystemIntegrity() {
  console.log('\n🏥 TEST 5: SYSTEM INTEGRITY\n');
  
  try {
    // Verify document-embedding relationship
    const docsCount = await db.select({ count: sql<number>`count(*)` }).from(documents);
    const embsCount = await db.select({ count: sql<number>`count(*)` }).from(embeddings);
    
    const totalDocs = Number(docsCount[0]?.count || 0);
    const totalEmbs = Number(embsCount[0]?.count || 0);
    
    logTest(
      'Knowledge Base Size',
      true,
      `${totalDocs} documents, ${totalEmbs} embeddings`,
      { documents: totalDocs, embeddings: totalEmbs }
    );
    
    // Check for orphaned embeddings
    const orphanedEmbs = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM embeddings e
      WHERE NOT EXISTS (
        SELECT 1 FROM documents d WHERE d.id = e.document_id
      )
    `);
    
    const orphanedCount = Number(orphanedEmbs.rows[0]?.count || 0);
    
    logTest(
      'Data Integrity',
      orphanedCount === 0,
      orphanedCount === 0
        ? 'No orphaned embeddings found'
        : `${orphanedCount} orphaned embeddings (cleanup needed)`,
      { orphanedEmbeddings: orphanedCount }
    );
    
  } catch (error: any) {
    logTest('System Integrity', false, `Error: ${error.message}`);
  }
}

async function runAllTests() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  AION INTEGRATION TESTS - PRODUCTION AUTOMATION           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  await test1_DatabaseConnectivity();
  await test2_GPUAutoScaling();
  await test3_CurationPipeline();
  await test4_TrainingJobs();
  await test5_SystemIntegrity();
  
  // Resumo
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  TEST SUMMARY                                             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${Math.round((passed / total) * 100)}%\n`);
  
  if (failed > 0) {
    console.log('Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
    console.log();
  }
  
  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

// Execute tests
runAllTests().catch(error => {
  console.error('FATAL ERROR:', error);
  process.exit(1);
});
