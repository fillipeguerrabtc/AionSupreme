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
    tenantId: number,
    data: {
      title: string;
      content: string;
      suggestedNamespaces: string[];
      tags?: string[];
      submittedBy?: string;
    }
  ): Promise<CurationItem> {
    const [item] = await db.insert(curationQueueTable).values({
      tenantId,
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
  async listPending(tenantId: number): Promise<CurationItem[]> {
    return await db
      .select()
      .from(curationQueueTable)
      .where(
        and(
          eq(curationQueueTable.tenantId, tenantId),
          eq(curationQueueTable.status, "pending")
        )
      )
      .orderBy(desc(curationQueueTable.submittedAt));
  },

  /**
   * Lista todos os itens (com filtros opcionais)
   */
  async listAll(
    tenantId: number,
    filters?: { status?: string; limit?: number }
  ): Promise<CurationItem[]> {
    const conditions = [eq(curationQueueTable.tenantId, tenantId)];
    
    if (filters?.status) {
      conditions.push(eq(curationQueueTable.status, filters.status));
    }

    let items = await db
      .select()
      .from(curationQueueTable)
      .where(and(...conditions))
      .orderBy(desc(curationQueueTable.submittedAt));

    if (filters?.limit) {
      items = items.slice(0, filters.limit);
    }

    return items;
  },

  /**
   * Obtém item por ID
   */
  async getById(tenantId: number, id: string): Promise<CurationItem | null> {
    const [item] = await db
      .select()
      .from(curationQueueTable)
      .where(
        and(
          eq(curationQueueTable.id, id),
          eq(curationQueueTable.tenantId, tenantId)
        )
      )
      .limit(1);
    return item || null;
  },

  /**
   * Edita item pendente (título, tags, namespaces)
   */
  async editItem(
    tenantId: number,
    id: string,
    updates: {
      title?: string;
      tags?: string[];
      suggestedNamespaces?: string[];
      note?: string;
    }
  ): Promise<CurationItem | null> {
    const item = await this.getById(tenantId, id);
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
          eq(curationQueueTable.tenantId, tenantId),
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
    tenantId: number,
    id: string,
    reviewedBy: string
  ): Promise<{ item: CurationItem; publishedId: string }> {
    const item = await this.getById(tenantId, id);
    if (!item || item.status !== "pending") {
      throw new Error("Item not found or already processed");
    }

    // Create document record in database
    const [newDoc] = await db.insert(documents).values({
      tenantId,
      title: item.title,
      content: item.content,
      source: "curation_approved",
      status: "indexed",
      metadata: {} as any,
    } as any).returning();

    // Index approved content into Knowledge Base vector store with namespace metadata
    await knowledgeIndexer.indexDocument(newDoc.id, newDoc.content, tenantId, {
      namespaces: item.suggestedNamespaces,
      tags: item.tags,
      source: "curation_approved",
      curationId: item.id,
    });

    // Update curation queue item status in database
    const [updatedItem] = await db
      .update(curationQueueTable)
      .set({
        status: "approved",
        reviewedBy,
        reviewedAt: new Date(),
        publishedId: newDoc.id.toString(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(curationQueueTable.id, id),
          eq(curationQueueTable.tenantId, tenantId)
        )
      )
      .returning();

    console.log(`[Curation] Approved and published item ${id} to KB as document ${newDoc.id}`);

    return { item: updatedItem, publishedId: newDoc.id.toString() };
  },

  /**
   * Rejeita item
   */
  async reject(
    tenantId: number,
    id: string,
    reviewedBy: string,
    note?: string
  ): Promise<CurationItem | null> {
    const [updated] = await db
      .update(curationQueueTable)
      .set({
        status: "rejected",
        reviewedBy,
        reviewedAt: new Date(),
        note: note || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(curationQueueTable.id, id),
          eq(curationQueueTable.tenantId, tenantId),
          eq(curationQueueTable.status, "pending")
        )
      )
      .returning();

    return updated || null;
  },

  /**
   * Remove item da fila (apenas para testes)
   */
  async remove(tenantId: number, id: string): Promise<boolean> {
    const result = await db
      .delete(curationQueueTable)
      .where(
        and(
          eq(curationQueueTable.id, id),
          eq(curationQueueTable.tenantId, tenantId)
        )
      )
      .returning();

    return result.length > 0;
  },
};
