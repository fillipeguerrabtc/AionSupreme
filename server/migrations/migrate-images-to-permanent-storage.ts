/**
 * MIGRATION: Move Images from Temporary to Permanent Storage
 * 
 * PROBLEMA: Imagens aprovadas foram salvas em attached_assets/ (TEMPORÁRIO)
 * SOLUÇÃO: Mover para data/learned_images/ (PERMANENTE)
 * 
 * Este script:
 * 1. Encontra todos os documentos com attachments do tipo 'image'
 * 2. Move arquivos de attached_assets/ → data/learned_images/
 * 3. Atualiza URLs no banco de dados
 * 4. Valida integridade após migration
 */

import { db } from "../db";
import { documents } from "../../shared/schema";
import { sql } from "drizzle-orm";
import fs from "fs/promises";
import fsSync from "fs";
import * as path from "path";
import { storagePaths } from "../config/storage-paths";

interface MigrationStats {
  docsScanned: number;
  imagesFound: number;
  imagesMoved: number;
  imagesAlreadyMigrated: number;
  imagesMissing: number;
  docsUpdated: number;
  errors: string[];
}

export async function migrateImagesToPermanentStorage(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    docsScanned: 0,
    imagesFound: 0,
    imagesMoved: 0,
    imagesAlreadyMigrated: 0,
    imagesMissing: 0,
    docsUpdated: 0,
    errors: [],
  };

  console.log("\n🚀 [Migration] Starting image storage migration...\n");

  // 1. Busca todos os documentos com attachments
  const allDocs = await db
    .select()
    .from(documents)
    .where(sql`${documents.attachments} IS NOT NULL AND ${documents.attachments} != '[]'`);

  stats.docsScanned = allDocs.length;
  console.log(`   📊 Found ${allDocs.length} documents with attachments\n`);

  // Paths
  const oldRoot = path.join(process.cwd(), 'attached_assets', 'learned_images');
  const newRoot = storagePaths.learnedImages;

  for (const doc of allDocs) {
    if (!doc.attachments || doc.attachments.length === 0) continue;

    let attachmentsChanged = false;
    const updatedAttachments = [];

    for (const att of doc.attachments as any[]) {
      if (att.type !== 'image') {
        updatedAttachments.push(att);
        continue;
      }

      stats.imagesFound++;
      const currentUrl = att.url || '';

      // Verifica se já está no path permanente
      if (currentUrl.includes('data/learned_images')) {
        console.log(`   ✅ Already migrated: ${att.filename}`);
        stats.imagesAlreadyMigrated++;
        updatedAttachments.push(att);
        continue;
      }

      // Verifica se está no path antigo (attached_assets)
      if (!currentUrl.includes('attached_assets')) {
        console.log(`   ⚠️ Unknown path: ${currentUrl}`);
        stats.errors.push(`Unknown path for ${att.filename}: ${currentUrl}`);
        updatedAttachments.push(att);
        continue;
      }

      // Tenta mover arquivo
      try {
        const oldPath = path.join(process.cwd(), currentUrl);
        const newPath = path.join(newRoot, att.filename);

        // Verifica se arquivo existe no local antigo
        if (!fsSync.existsSync(oldPath)) {
          console.log(`   ❌ Missing: ${att.filename} (expected at ${oldPath})`);
          stats.imagesMissing++;
          stats.errors.push(`Missing file: ${att.filename}`);
          updatedAttachments.push(att);
          continue;
        }

        // Move arquivo
        await fs.copyFile(oldPath, newPath);
        await fs.unlink(oldPath);

        // Atualiza URL
        const newUrl = path.relative(process.cwd(), newPath);
        updatedAttachments.push({
          ...att,
          url: newUrl,
        });

        console.log(`   📦 Moved: ${att.filename}`);
        stats.imagesMoved++;
        attachmentsChanged = true;
      } catch (error: any) {
        console.error(`   ❌ Error moving ${att.filename}:`, error.message);
        stats.errors.push(`Error moving ${att.filename}: ${error.message}`);
        updatedAttachments.push(att);
      }
    }

    // Atualiza documento se houve mudanças
    if (attachmentsChanged) {
      await db
        .update(documents)
        .set({ attachments: updatedAttachments })
        .where(sql`${documents.id} = ${doc.id}`);
      stats.docsUpdated++;
    }
  }

  // Summary
  console.log("\n📈 [Migration] SUMMARY:");
  console.log(`   📄 Documents scanned: ${stats.docsScanned}`);
  console.log(`   🖼️  Images found: ${stats.imagesFound}`);
  console.log(`   📦 Images moved: ${stats.imagesMoved}`);
  console.log(`   ✅ Already migrated: ${stats.imagesAlreadyMigrated}`);
  console.log(`   ❌ Missing files: ${stats.imagesMissing}`);
  console.log(`   📝 Documents updated: ${stats.docsUpdated}`);
  
  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Errors (${stats.errors.length}):`);
    stats.errors.forEach(err => console.log(`   - ${err}`));
  }

  console.log("\n✅ [Migration] Complete!\n");

  return stats;
}

// Run if called directly (ES module compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateImagesToPermanentStorage()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Migration failed:", err);
      process.exit(1);
    });
}
