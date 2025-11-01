// server/curation/store.ts
// Store de curadoria com HITL (Human-in-the-Loop) - DB-backed
import { knowledgeIndexer } from "../rag/knowledge-indexer";
import { db } from "../db";
import { documents, curationQueue as curationQueueTable, CurationQueue, InsertDocument } from "@shared/schema";
import { sql, eq, and, desc } from "drizzle-orm";

// Type alias for compatibility with existing code
export type CurationItem = CurationQueue;

export const curationStore = {
  /**
   * Adiciona item à fila de curadoria
   */
  async addToCuration(
    data: {
      title: string;
      content: string;
      suggestedNamespaces: string[];
      tags?: string[];
      submittedBy?: string;
    }
  ): Promise<CurationItem> {
    const [item] = await db.insert(curationQueueTable).values({
      title: data.title,
      content: data.content,
      suggestedNamespaces: data.suggestedNamespaces,
      tags: data.tags || [],
      status: "pending",
      submittedBy: data.submittedBy,
    }).returning();

    return item;
  },

  /**
   * Lista itens pendentes de curadoria
   */
  async listPending(): Promise<CurationItem[]> {
    return await db
      .select()
      .from(curationQueueTable)
      .where(eq(curationQueueTable.status, "pending"))
      .orderBy(desc(curationQueueTable.submittedAt));
  },

  /**
   * Lista todos os itens (com filtros opcionais)
   */
  async listAll(
    filters?: { status?: string; limit?: number }
  ): Promise<CurationItem[]> {
    const conditions = [];
    
    if (filters?.status) {
      conditions.push(eq(curationQueueTable.status, filters.status));
    }

    let items = await db
      .select()
      .from(curationQueueTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(curationQueueTable.submittedAt));

    if (filters?.limit) {
      items = items.slice(0, filters.limit);
    }

    return items;
  },

  /**
   * Obtém item por ID
   */
  async getById(id: string): Promise<CurationItem | null> {
    const [item] = await db
      .select()
      .from(curationQueueTable)
      .where(eq(curationQueueTable.id, id))
      .limit(1);
    return item || null;
  },

  /**
   * Edita item pendente (título, tags, namespaces)
   */
  async editItem(
    id: string,
    updates: {
      title?: string;
      tags?: string[];
      suggestedNamespaces?: string[];
      note?: string;
    }
  ): Promise<CurationItem | null> {
    const item = await this.getById(id);
    if (!item || item.status !== "pending") return null;

    const [updated] = await db
      .update(curationQueueTable)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(curationQueueTable.id, id),
          eq(curationQueueTable.status, "pending")
        )
      )
      .returning();

    return updated || null;
  },

  /**
   * Aprova e publica item - integrado com Knowledge Base
   */
  async approveAndPublish(
    id: string,
    reviewedBy: string
  ): Promise<{ item: CurationItem; publishedId: string }> {
    const item = await this.getById(id);
    if (!item || item.status !== "pending") {
      throw new Error("Item not found or already processed");
    }

    // Create document record in database WITH ATTACHMENTS (tenantId defaults to 1 in schema)
    const [newDoc] = await db.insert(documents).values({
      title: item.title,
      content: item.content,
      source: "curation_approved",
      status: "indexed",
      attachments: item.attachments || undefined, // Preserve multimodal attachments!
      metadata: {
        namespaces: item.suggestedNamespaces,
        tags: item.tags,
        curationId: item.id,
        reviewedBy,
      } as any,
    } as any).returning();

    // Log attachments being saved
    if (item.attachments && item.attachments.length > 0) {
      console.log(`[Curation] 📎 Salvando ${item.attachments.length} attachments junto com documento ${newDoc.id}`);
    }

    // Index approved content into Knowledge Base vector store with namespace metadata
    await knowledgeIndexer.indexDocument(newDoc.id, newDoc.content, {
      namespaces: item.suggestedNamespaces,
      tags: item.tags,
      source: "curation_approved",
      curationId: item.id,
    });

    // CRITICAL: Save to training_data_collection for auto-evolution
    // Only curated/approved content goes to training!
    try {
      const { trainingDataCollection } = await import("@shared/schema");
      
      // VALIDATION: Ensure namespaces are valid
      if (!item.suggestedNamespaces || item.suggestedNamespaces.length === 0) {
        console.warn(`[Curation] ⚠️ No namespaces for item ${item.id}, using default 'geral'`);
        item.suggestedNamespaces = ['geral'];
      }
      
      // VALIDATION: Extract quality score from tags with fallback
      const qualityTag = item.tags.find(t => t.startsWith('quality-'));
      const qualityScore = qualityTag ? 
        Math.max(0, Math.min(100, parseInt(qualityTag.split('-')[1]) || 75)) : 
        75;
      
      if (!qualityTag) {
        console.warn(`[Curation] ⚠️ No quality tag for item ${item.id}, using default 75`);
      }
      
      // tenantId defaults to 1 in schema
      await db.insert(trainingDataCollection).values({
        conversationId: null, // Curated content doesn't have conversationId
        autoQualityScore: qualityScore,
        status: "approved", // Human-approved content is always approved
        formattedData: [{
          instruction: item.title,
          output: item.content,
        }],
        metadata: {
          source: "curation_approved",
          curationId: item.id,
          namespaces: item.suggestedNamespaces,
          tags: item.tags,
          reviewedBy,
        },
      } as any);
      
      console.log(`[Curation] ✅ Saved to training_data_collection (quality: ${qualityScore}, namespaces: ${item.suggestedNamespaces.join(', ')})`);
    } catch (trainingError: any) {
      console.error(`[Curation] ❌ Failed to save training data:`, trainingError.message);
      // Fail closed: if training data save fails, throw error to prevent silent failures
      throw new Error(`Training data save failed: ${trainingError.message}`);
    }

    // Update curation queue item status in database
    const now = new Date();
    const [updatedItem] = await db
      .update(curationQueueTable)
      .set({
        status: "approved",
        reviewedBy,
        reviewedAt: now,
        statusChangedAt: now, // Track when status changed for 5-year retention
        publishedId: newDoc.id.toString(),
        updatedAt: now,
      })
      .where(eq(curationQueueTable.id, id))
      .returning();

    console.log(`[Curation] ✅ Approved and published item ${id} to KB as document ${newDoc.id}`);

    return { item: updatedItem, publishedId: newDoc.id.toString() };
  },

  /**
   * Rejeita item
   */
  async reject(
    id: string,
    reviewedBy: string,
    note?: string
  ): Promise<CurationItem | null> {
    const now = new Date();
    const [updated] = await db
      .update(curationQueueTable)
      .set({
        status: "rejected",
        reviewedBy,
        reviewedAt: now,
        statusChangedAt: now, // Track when status changed for 5-year retention
        note: note || null,
        updatedAt: now,
      })
      .where(
        and(
          eq(curationQueueTable.id, id),
          eq(curationQueueTable.status, "pending")
        )
      )
      .returning();

    return updated || null;
  },

  /**
   * Lista histórico completo (aprovados + rejeitados) com retenção de 5 anos
   * Filtra automaticamente itens com mais de 5 anos
   */
  async listHistory(
    filters?: { status?: "approved" | "rejected"; limit?: number }
  ): Promise<CurationItem[]> {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    const conditions = [
      sql`${curationQueueTable.status} IN ('approved', 'rejected')`,
      sql`${curationQueueTable.statusChangedAt} >= ${fiveYearsAgo.toISOString()}`,
    ];

    if (filters?.status) {
      conditions.push(eq(curationQueueTable.status, filters.status));
    }

    let items = await db
      .select()
      .from(curationQueueTable)
      .where(and(...conditions))
      .orderBy(desc(curationQueueTable.statusChangedAt));

    if (filters?.limit) {
      items = items.slice(0, filters.limit);
    }

    return items;
  },

  /**
   * Remove item da fila (apenas para testes)
   */
  async remove(id: string): Promise<boolean> {
    const result = await db
      .delete(curationQueueTable)
      .where(eq(curationQueueTable.id, id))
      .returning();

    return result.length > 0;
  },
  
  /**
   * Limpa dados da fila de curadoria com mais de 5 anos (retenção de dados)
   * Implementa política de retenção de 5 anos conforme padrão da plataforma
   */
  async cleanupOldCurationData(): Promise<{ curationItemsDeleted: number } | null> {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    const deletedItems = await db
      .delete(curationQueueTable)
      .where(sql`${curationQueueTable.submittedAt} < ${fiveYearsAgo}`)
      .returning();

    if (deletedItems.length === 0) {
      return null;
    }

    return { curationItemsDeleted: deletedItems.length };
  },
};
