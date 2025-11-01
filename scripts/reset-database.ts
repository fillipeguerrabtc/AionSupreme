#!/usr/bin/env tsx
/**
 * Database Reset Script
 * 
 * ATENÇÃO: Este script APAGA TUDO do banco de dados!
 * Use apenas em desenvolvimento/testes.
 * 
 * Uso: npm run db:reset
 */

import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function resetDatabase() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  ⚠️  DATABASE RESET - APAGANDO TODOS OS DADOS                 ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  try {
    // 1. Agents & SubAgents
    console.log("🗑️  [1/10] Deletando Agents e SubAgents...");
    await db.execute(sql`DELETE FROM agents`);
    console.log("   ✅ Agents deletados");

    // 2. Namespaces
    console.log("🗑️  [2/10] Deletando Namespaces...");
    await db.execute(sql`DELETE FROM namespaces`);
    console.log("   ✅ Namespaces deletados");

    // 3. KB Documents
    console.log("🗑️  [3/10] Deletando Knowledge Base Documents...");
    await db.execute(sql`DELETE FROM kb_documents`);
    console.log("   ✅ KB Documents deletados");

    // 4. KB Embeddings
    console.log("🗑️  [4/10] Deletando Embeddings...");
    await db.execute(sql`DELETE FROM kb_embeddings`);
    console.log("   ✅ Embeddings deletados");

    // 5. Curation Queue
    console.log("🗑️  [5/10] Deletando Curation Queue...");
    await db.execute(sql`DELETE FROM curation_queue`);
    console.log("   ✅ Curation Queue deletado");

    // 6. Training Data
    console.log("🗑️  [6/10] Deletando Training Data...");
    await db.execute(sql`DELETE FROM training_data`);
    console.log("   ✅ Training Data deletado");

    // 7. Datasets
    console.log("🗑️  [7/10] Deletando Datasets...");
    await db.execute(sql`DELETE FROM datasets`);
    console.log("   ✅ Datasets deletados");

    // 8. Conversations
    console.log("🗑️  [8/10] Deletando Conversations...");
    await db.execute(sql`DELETE FROM conversations`);
    console.log("   ✅ Conversations deletadas");

    // 9. GPU Workers
    console.log("🗑️  [9/10] Deletando GPU Workers...");
    await db.execute(sql`DELETE FROM gpu_workers`);
    console.log("   ✅ GPU Workers deletados");

    // 10. Policies (MANTÉM apenas default policy)
    console.log("🗑️  [10/10] Deletando Policies extras (mantendo default)...");
    await db.execute(sql`DELETE FROM policies WHERE id != 1`);
    console.log("   ✅ Policies extras deletadas");

    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║  ✅ DATABASE RESET COMPLETO                                    ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    console.log("📋 Próximos passos:");
    console.log("   1. Reinicie o servidor: npm run dev");
    console.log("   2. Seed será executado automaticamente");
    console.log("   3. Crie manualmente: Namespace → Agent → Subnamespaces → SubAgent\n");

    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ ERRO ao resetar database:", error.message);
    console.error(error);
    process.exit(1);
  }
}

// Execute
resetDatabase();
