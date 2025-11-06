// server/curation/store.ts
// Store de curadoria com HITL (Human-in-the-Loop) - DB-backed
import { knowledgeIndexer } from "../rag/knowledge-indexer";
import { db } from "../db";
import { documents, curationQueue as curationQueueTable, CurationQueue, InsertDocument } from "@shared/schema";
import { sql, eq, and, desc } from "drizzle-orm";
import { curatorAgentDetector } from "./curator-agent";

// Type alias for compatibility with existing code
export type CurationItem = CurationQueue;

export const curationStore = {
  /**
   * Adiciona item à fila de curadoria com análise automática (se agente disponível)
   */
  async addToCuration(
    data: {
      title: string;
      content: string;
      suggestedNamespaces: string[];
      tags?: string[];
      submittedBy?: string;
      contentHash?: string; // For deduplication
      normalizedContent?: string; // For fuzzy matching
    }
  ): Promise<CurationItem> {
    // STEP 1: Inserir na fila de curadoria
    const [item] = await db.insert(curationQueueTable).values({
      title: data.title,
      content: data.content,
      suggestedNamespaces: data.suggestedNamespaces,
      tags: data.tags || [],
      status: "pending",
      submittedBy: data.submittedBy,
      contentHash: data.contentHash, // Store for O(1) dedup lookups
      normalizedContent: data.normalizedContent, // Store for fuzzy matching
    }).returning();

    // STEP 2: Tentar análise automática em background (não bloqueia)
    // Isso roda de forma assíncrona e atualiza o item depois
    this.runAutoAnalysis(item.id, data).catch(error => {
      console.error(`[Curation] ❌ Erro na análise automática do item ${item.id}:`, error.message);
    });

    return item;
  },

  /**
   * Executa análise automática usando agente de curadoria (se disponível)
   * Atualiza o campo 'note' com a recomendação do agente
   */
  async runAutoAnalysis(
    itemId: string,
    data: {
      title: string;
      content: string;
      suggestedNamespaces: string[];
      tags?: string[];
      submittedBy?: string;
    }
  ): Promise<void> {
    try {
      console.log(`[Curation] 🤖 Iniciando análise automática do item ${itemId}...`);

      const analysis = await curatorAgentDetector.analyzeCurationItem(
        data.title,
        data.content,
        data.suggestedNamespaces,
        data.tags || [],
        data.submittedBy
      );

      // Formatar nota com análise automática
      const autoNote = `🤖 ANÁLISE AUTOMÁTICA (Agente de Curadoria):

📊 **Recomendação:** ${analysis.recommended === 'approve' ? '✅ APROVAR' : analysis.recommended === 'reject' ? '❌ REJEITAR' : '⚠️ REVISAR MANUALMENTE'}
🎯 **Score de Qualidade:** ${analysis.score}/100

📝 **Raciocínio:**
${analysis.reasoning}

${analysis.suggestedEdits ? `
✏️ **Sugestões de Edição:**
${analysis.suggestedEdits.title ? `- Título: "${analysis.suggestedEdits.title}"\n` : ''}${analysis.suggestedEdits.namespaces ? `- Namespaces: ${analysis.suggestedEdits.namespaces.join(', ')}\n` : ''}${analysis.suggestedEdits.tags ? `- Tags: ${analysis.suggestedEdits.tags.join(', ')}\n` : ''}
` : ''}${analysis.concerns && analysis.concerns.length > 0 ? `
⚠️ **Preocupações:**
${analysis.concerns.map(c => `- ${c}`).join('\n')}
` : ''}
---
*Análise automática gerada pelo agente de curadoria. A decisão final é humana.*`;

      // Atualizar item com análise automática
      await db
        .update(curationQueueTable)
        .set({
          note: autoNote,
          updatedAt: new Date(),
        })
        .where(eq(curationQueueTable.id, itemId));

      console.log(`[Curation] ✅ Análise automática concluída para item ${itemId}: ${analysis.recommended} (score: ${analysis.score})`);

      // Se o agente recomendou edições, podemos aplicá-las automaticamente (opcional)
      if (analysis.suggestedEdits && analysis.score >= 70) {
        console.log(`[Curation] 💡 Agente sugeriu edições (score alto: ${analysis.score}), mas mantendo valores originais para revisão humana`);
      }
    } catch (error: any) {
      console.error(`[Curation] ❌ Falha na análise automática:`, error.message);
      // Não propagar erro - análise automática é opcional
    }
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
   * Edita item pendente (título, conteúdo, tags, namespaces, nota, attachments)
   */
  async editItem(
    id: string,
    updates: {
      title?: string;
      content?: string;
      tags?: string[];
      suggestedNamespaces?: string[];
      note?: string;
      attachments?: Array<{
        type: "image" | "video" | "audio" | "document";
        url: string;
        filename: string;
        mimeType: string;
        size: number;
        description?: string;
      }>;
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
   * 🔥 VERIFICAÇÃO UNIVERSAL DE DUPLICAÇÃO: 
   * - SEMPRE verifica KB completa antes de aprovar
   * - SEMPRE extrai e salva SOMENTE conteúdo novo
   * - NUNCA duplica conteúdo existente
   */
  async approveAndPublish(
    id: string,
    reviewedBy: string
  ): Promise<{ item: CurationItem; publishedId: string }> {
    const item = await this.getById(id);
    if (!item || item.status !== "pending") {
      throw new Error("Item not found or already processed");
    }

    // 🔥 VERIFICAÇÃO UNIVERSAL DE DUPLICAÇÃO
    // SEMPRE verifica KB completa, independente de duplicationStatus
    let contentToSave = item.content;
    let isAbsorption = false;
    let duplicateDocId: number | null = null;

    try {
      // Se já tem duplicateOfId marcado, usa direto
      if (item.duplicateOfId) {
        duplicateDocId = parseInt(item.duplicateOfId);
      } else {
        // Caso contrário, FORÇA scan completo da KB agora
        console.log(`[Curation] 🔍 Verificando duplicação na KB para "${item.title}"...`);
        
        const { deduplicationService } = await import("../services/deduplication-service");
        const dupCheck = await deduplicationService.checkDuplicate({
          text: item.content,
          tenantId: 1,
          enableSemantic: true
        });

        if (dupCheck.isDuplicate && dupCheck.duplicateOf) {
          duplicateDocId = dupCheck.duplicateOf.id;
          console.log(`[Curation] ⚠️ Duplicata detectada: ${Math.round((dupCheck.duplicateOf.similarity || 0) * 100)}% similar a "${dupCheck.duplicateOf.title}" (ID: ${duplicateDocId})`);
        }
      }

      // Se encontrou duplicata, tenta absorver só o novo
      if (duplicateDocId) {
        const [originalDoc] = await db
          .select()
          .from(documents)
          .where(eq(documents.id, duplicateDocId))
          .limit(1);

        if (originalDoc) {
          const { analyzeAbsorption } = await import("../utils/absorption");
          const analysis = analyzeAbsorption(originalDoc.content, item.content);

          if (analysis.shouldAbsorb) {
            // ✅ ABSORVER SÓ O NOVO
            contentToSave = analysis.extractedContent;
            isAbsorption = true;
            
            console.log(`[Curation] 🔥 AUTO-ABSORÇÃO ativada para "${item.title}":
  Original: ${analysis.stats.originalLength} chars
  Extraído: ${analysis.stats.extractedLength} chars
  Redução: ${analysis.stats.reductionPercent}%
  Novo: ${analysis.stats.newContentPercent}%
  Duplicado de: "${originalDoc.title}" (ID: ${originalDoc.id})`);
          } else {
            // Se não vale absorver (<10% novo), rejeita automaticamente
            throw new Error(`Conteúdo duplicado detectado (${analysis.stats.newContentPercent}% novo, mínimo 10%). ${analysis.reason}`);
          }
        }
      } else {
        console.log(`[Curation] ✅ Conteúdo único detectado para "${item.title}", aprovando normalmente`);
      }
    } catch (verificationError: any) {
      // Se erro crítico na verificação, aborta aprovação
      throw new Error(`Falha na verificação de duplicação: ${verificationError.message}`);
    }

    // 🤖 AUTO-CRIAÇÃO DE NAMESPACES E AGENTES (AUTONOMOUS CURATION)
    // ✅ CRÍTICO: Fazer ANTES de criar documento para aplicar consolidação everywhere
    let finalNamespaces = item.suggestedNamespaces || [];
    if (item.suggestedNamespaces && item.suggestedNamespaces.length > 0) {
      const { autoCreateNamespacesAndAgents } = await import("../services/auto-namespace-creator");
      const creationResult = await autoCreateNamespacesAndAgents(item.suggestedNamespaces, {
        source: "curation_approval",
        curationItemId: item.id,
        reviewedBy,
      });

      // ✅ CRÍTICO: Aplicar mapeamento de consolidação
      // Se houve consolidação (>80% similar), usa namespace existente
      finalNamespaces = item.suggestedNamespaces.map(ns => 
        creationResult.consolidatedMapping[ns] || ns
      );

      // ✅ CRÍTICO: Deduplica namespaces (se 2+ consolidaram para o mesmo)
      finalNamespaces = [...new Set(finalNamespaces.filter(ns => ns && ns.trim()))];

      if (Object.keys(creationResult.consolidatedMapping).length > 0) {
        console.log(`[Curation] 🔄 Namespaces consolidados:`, creationResult.consolidatedMapping);
        console.log(`[Curation] 📝 Namespaces finais deduplic+ ados:`, finalNamespaces);
      }
    }

    // ✅ CRÍTICO: Garantir pelo menos 1 namespace válido (fallback 'geral')
    if (!finalNamespaces || finalNamespaces.length === 0) {
      console.warn(`[Curation] ⚠️ No namespaces for item ${item.id}, using default 'geral'`);
      finalNamespaces = ['geral'];
    }

    // 🔥 NOVO: ZERO BYPASS - Salva imagens APÓS aprovação (HITL completo)
    let finalAttachments = item.attachments;
    if (item.attachments && item.attachments.length > 0) {
      const { ImageProcessor } = await import("../learn/image-processor");
      const imageProcessor = new ImageProcessor();
      
      finalAttachments = await Promise.all(
        item.attachments.map(async (att: any) => {
          // Se tem base64 temporário, salva agora no filesystem
          if (att.base64 && att.type === "image") {
            console.log(`[Curation] 💾 Salvando imagem aprovada: ${att.filename}`);
            
            const buffer = Buffer.from(att.base64, 'base64');
            const localPath = await imageProcessor.saveImageFromBuffer(buffer, att.filename);
            
            // Retorna attachment com URL final (sem base64 temporário)
            return {
              type: att.type,
              url: localPath, // Path relativo final
              filename: att.filename,
              mimeType: att.mimeType,
              size: att.size,
              description: att.description
            };
          }
          // Se não tem base64, retorna como está
          return att;
        })
      );
      
      console.log(`[Curation] ✅ ${finalAttachments.filter((a: any) => a.type === 'image').length} imagens salvas após aprovação`);
    }

    // Create document record in database WITH ATTACHMENTS (tenantId defaults to 1 in schema)
    const [newDoc] = await db.insert(documents).values({
      title: item.title,
      content: contentToSave, // ← SÓ CONTEÚDO NOVO se near-duplicate!
      source: isAbsorption ? "curation_absorption" : "curation_approved",
      status: "indexed",
      attachments: finalAttachments || undefined, // Attachments FINAIS (já salvos no filesystem!)
      metadata: {
        namespaces: finalNamespaces, // ← USA NAMESPACES CONSOLIDADOS!
        tags: item.tags,
        curationId: item.id,
        reviewedBy,
        isAbsorption, // Flag para indicar que foi absorção
        ...(isAbsorption && item.duplicateOfId ? { absorbedFrom: item.duplicateOfId } : {})
      } as any,
    } as any).returning();

    // Log attachments being saved
    if (item.attachments && item.attachments.length > 0) {
      console.log(`[Curation] 📎 Salvando ${item.attachments.length} attachments junto com documento ${newDoc.id}`);
    }

    // Index approved content into Knowledge Base vector store with namespace metadata
    await knowledgeIndexer.indexDocument(newDoc.id, newDoc.content, {
      namespaces: finalNamespaces, // ← USA NAMESPACES CONSOLIDADOS!
      tags: item.tags,
      source: "curation_approved",
      curationId: item.id,
    });

    // CRITICAL: Save to training_data_collection for auto-evolution
    // Only curated/approved content goes to training!
    try {
      const { trainingDataCollection } = await import("@shared/schema");
      
      
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
          namespaces: finalNamespaces, // ✅ USA NAMESPACES CONSOLIDADOS!
          tags: item.tags,
          reviewedBy,
        },
      } as any);
      
      console.log(`[Curation] ✅ Saved to training_data_collection (quality: ${qualityScore}, namespaces: ${finalNamespaces.join(', ')})`);
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
   * Rejeita item e agenda auto-deleção em 30 dias (GDPR compliance)
   */
  async reject(
    id: string,
    reviewedBy: string,
    note?: string
  ): Promise<CurationItem | null> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
    
    const [updated] = await db
      .update(curationQueueTable)
      .set({
        status: "rejected",
        reviewedBy,
        reviewedAt: now,
        statusChangedAt: now,
        expiresAt, // Auto-delete after 30 days
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

    console.log(`[Curation] ⏰ Item ${id} rejeitado, auto-deleção agendada para ${expiresAt.toISOString()}`);
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
   * Limpa rejected items expirados (30 dias após rejeição)
   * Implementa GDPR data minimization e storage limitation
   * DEVE SER EXECUTADO DIARIAMENTE via cron job
   */
  async cleanupExpiredRejectedItems(): Promise<{ curationItemsDeleted: number } | null> {
    const now = new Date();

    const deletedItems = await db
      .delete(curationQueueTable)
      .where(
        and(
          eq(curationQueueTable.status, "rejected"),
          sql`${curationQueueTable.expiresAt} <= ${now}`
        )
      )
      .returning();

    if (deletedItems.length === 0) {
      console.log(`[Curation Cleanup] ✅ Nenhum item rejeitado expirado para deletar`);
      return null;
    }

    console.log(`[Curation Cleanup] 🗑️ ${deletedItems.length} itens rejeitados expirados deletados permanentemente`);
    return { curationItemsDeleted: deletedItems.length };
  },

  /**
   * 5-year retention cleanup for curation queue (approved/rejected items only)
   * Keeps pending items indefinitely until human decision
   * COMPLIANCE: LGPD Art. 16 (data minimization + legitimate retention period)
   */
  async cleanupOldCurationData(): Promise<{ curationItemsDeleted: number } | null> {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    // Only delete finalized items (approved/rejected), keep pending indefinitely
    const deletedItems = await db
      .delete(curationQueueTable)
      .where(
        and(
          sql`${curationQueueTable.status} IN ('approved', 'rejected')`,
          sql`${curationQueueTable.statusChangedAt} <= ${fiveYearsAgo}`
        )
      )
      .returning();

    if (deletedItems.length === 0) {
      return null;
    }

    console.log(`[Curation Retention] Deleted ${deletedItems.length} curation items older than 5 years`);
    return { curationItemsDeleted: deletedItems.length };
  },
};
