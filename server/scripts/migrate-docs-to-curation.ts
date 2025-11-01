/**
 * MIGRATION SCRIPT: Move existing documents to curation_queue
 * 
 * This fixes the contamination problem: all 103 existing documents in the KB
 * need human approval before being used for training.
 */

import { db } from "../db";
import { documents, curationQueue, tenants } from "../../shared/schema";
import { eq, and } from "drizzle-orm";

async function migrateDocumentsToCuration() {
  console.log("\n🔄 [Migration] Starting migration of existing documents to curation queue...\n");

  try {
    // SINGLE-TENANT: Process all documents (tenantId = 1)
    const TENANT_ID = 1;

    // Get all documents that were auto-indexed (not from curation)
    const allDocs = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, TENANT_ID),
          eq(documents.status, "indexed")
        )
      );

    console.log(`📊 Found ${allDocs.length} documents in KB`);

    let migrated = 0;
    let skipped = 0;

    for (const doc of allDocs) {
      // Check if already in curation queue
      const existing = await db
        .select()
        .from(curationQueue)
        .where(eq(curationQueue.publishedId, doc.id.toString()))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Extract suggested namespace from metadata if available
      const metadata = doc.metadata as any;
      const suggestedNamespaces = metadata?.namespace ? [metadata.namespace] : ["geral"];
      
      // Add to curation queue for human review (tenantId defaults to 1 in schema)
      await db.insert(curationQueue).values({
        title: doc.title,
        content: doc.content,
        suggestedNamespaces,
        tags: ["migrated", "needs-review", doc.source || "unknown"],
        status: "pending",
        submittedBy: "migration-script",
      } as any);

      // CRITICAL: Mark original document as "pending_review" to deactivate it
      // This prevents contamination of training data with unreviewed content
      await db
        .update(documents)
        .set({
          status: "pending_review",
          metadata: {
            ...(doc.metadata as any),
            migratedToCuration: true,
            migrationDate: new Date().toISOString(),
          },
        } as any)
        .where(eq(documents.id, doc.id));

      // CRITICAL: Delete embeddings for this document to remove from RAG search
      // This ensures unreviewed content doesn't appear in KB searches
      const { embeddings } = await import("../../shared/schema");
      await db
        .delete(embeddings)
        .where(eq(embeddings.documentId, doc.id));

      migrated++;
      
      if (migrated % 10 === 0) {
        console.log(`   Migrated ${migrated}/${allDocs.length} documents...`);
      }
    }

    // CRITICAL: Clean historical training_data_collection contamination
    const { trainingDataCollection } = await import("../../shared/schema");
    const deletedTrainingData = await db
      .delete(trainingDataCollection)
      .where(eq(trainingDataCollection.tenantId, TENANT_ID))
      .returning();

    console.log(`\n✅ Migration complete!`);
    console.log(`   Migrated: ${migrated} documents`);
    console.log(`   Skipped: ${skipped} (already in queue)`);
    console.log(`   Deleted embeddings: ${migrated}`);
    console.log(`   Deleted training data: ${deletedTrainingData.length}`);
    console.log(`\n⚠️ Next steps:`);
    console.log(`   1. Go to Admin → Curadoria`);
    console.log(`   2. Review and approve/reject each document`);
    console.log(`   3. Only approved docs will go to KB + training\n`);

  } catch (error: any) {
    console.error(`❌ Migration failed:`, error.message);
    process.exit(1);
  }

  process.exit(0);
}

migrateDocumentsToCuration();
