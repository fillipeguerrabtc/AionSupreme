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
    // Get ALL tenants to migrate properly (not hardcoded tenantId=1)
    const allTenants = await db.select().from(tenants);
    console.log(`📊 Found ${allTenants.length} tenants to process`);

    let totalMigrated = 0;
    let totalSkipped = 0;
    let totalEmbeddings = 0;
    let totalTrainingData = 0;

    for (const tenant of allTenants) {
      console.log(`\n🔄 Processing tenant ${tenant.id} (${tenant.name})...`);

      // Get all documents that were auto-indexed (not from curation)
      const allDocs = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.tenantId, tenant.id),
            eq(documents.status, "indexed")
          )
        );

      console.log(`   Found ${allDocs.length} documents in KB`);

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
      
      // Add to curation queue for human review
      await db.insert(curationQueue).values({
        tenantId: doc.tenantId,
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

      // CRITICAL: Clean historical training_data_collection contamination for this tenant
      const { trainingDataCollection } = await import("../../shared/schema");
      const { tenants } = await import("../../shared/schema");
      const deletedTrainingData = await db
        .delete(trainingDataCollection)
        .where(eq(trainingDataCollection.tenantId, tenant.id))
        .returning();

      console.log(`   ✅ Tenant ${tenant.id} complete:`);
      console.log(`      Migrated: ${migrated} documents`);
      console.log(`      Skipped: ${skipped} (already in queue)`);
      console.log(`      Deleted embeddings: ${migrated}`);
      console.log(`      Deleted training data: ${deletedTrainingData.length}`);

      totalMigrated += migrated;
      totalSkipped += skipped;
      totalEmbeddings += migrated;
      totalTrainingData += deletedTrainingData.length;
    }

    console.log(`\n✅ Migration complete for all tenants!`);
    console.log(`   Total migrated: ${totalMigrated} documents`);
    console.log(`   Total skipped: ${totalSkipped} (already in queue)`);
    console.log(`   Total embeddings deleted: ${totalEmbeddings}`);
    console.log(`   Total training data deleted: ${totalTrainingData}`);
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
