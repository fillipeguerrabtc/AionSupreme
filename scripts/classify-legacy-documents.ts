/**
 * CLASSIFY LEGACY DOCUMENTS - ONE-TIME MIGRATION
 * ===============================================
 * 
 * Classifica todos os documentos sem namespace usando NamespaceClassifier.
 */

import { db } from '../server/db';
import { documents } from '@shared/schema';
import { sql, isNull } from 'drizzle-orm';
import { NamespaceClassifier } from '../server/services/namespace-classifier';

async function classifyLegacyDocuments() {
  console.log('\n🔍 Buscando documentos sem namespace...\n');
  
  // Find documents without namespace in metadata
  const docsWithoutNamespace = await db
    .select()
    .from(documents)
    .where(sql`
      ${documents.metadata}->>'namespaces' IS NULL 
      OR jsonb_array_length(COALESCE(${documents.metadata}->'namespaces', '[]'::jsonb)) = 0
    `);
  
  console.log(`Found ${docsWithoutNamespace.length} documents without namespace\n`);
  
  if (docsWithoutNamespace.length === 0) {
    console.log('✅ All documents already have namespaces!');
    return;
  }
  
  const classifier = new NamespaceClassifier();
  let classified = 0;
  let failed = 0;
  
  for (const doc of docsWithoutNamespace) {
    try {
      console.log(`📄 Processing: "${doc.title}" (ID: ${doc.id})`);
      
      // Classify using AI
      const result = await classifier.classifyContent(doc.title, doc.content);
      
      console.log(`   ✨ Classified as "${result.suggestedNamespace}" (confidence: ${result.confidence}%)`);
      
      // Update document metadata
      const currentMetadata = (doc.metadata as any) || {};
      const updatedMetadata = {
        ...currentMetadata,
        namespaces: [result.suggestedNamespace],
        classificationConfidence: result.confidence,
        autoClassified: true,
        classifiedAt: new Date().toISOString()
      };
      
      await db
        .update(documents)
        .set({ metadata: updatedMetadata })
        .where(sql`${documents.id} = ${doc.id}`);
      
      classified++;
      console.log(`   ✅ Updated\n`);
      
    } catch (error: any) {
      failed++;
      console.error(`   ❌ Failed: ${error.message}\n`);
    }
  }
  
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║  CLASSIFICATION SUMMARY                           ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');
  console.log(`Total documents: ${docsWithoutNamespace.length}`);
  console.log(`✅ Classified: ${classified}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success rate: ${Math.round((classified / docsWithoutNamespace.length) * 100)}%\n`);
}

// Execute
classifyLegacyDocuments()
  .then(() => {
    console.log('✅ Migration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
