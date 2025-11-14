// server/curation/store.ts
// Store de curadoria com HITL (Human-in-the-Loop) - DB-backed
import { knowledgeIndexer } from "../rag/knowledge-indexer";
import { db } from "../db";
import { documents, curationQueue as curationQueueTable, CurationQueue, InsertDocument } from "@shared/schema";
import { sql, eq, and, desc } from "drizzle-orm";
import { curatorAgentDetector } from "./curator-agent";
import { DuplicateContentError } from "../errors/DuplicateContentError";

// Type alias for compatibility with existing code
export type CurationItem = CurationQueue;

// Custom error for auto-analysis timeout
export class AutoAnalysisTimeoutError extends Error {
  public readonly duration: number;
  
  constructor(message: string, duration: number) {
    super(message);
    this.name = 'AutoAnalysisTimeoutError';
    this.duration = duration;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AutoAnalysisTimeoutError);
    }
  }
}

// Timeout constant for auto-analysis (30s matches queue SLA)
const AUTO_ANALYSIS_TIMEOUT_MS = 30000;

/**
 * Wraps a promise with timeout protection using Promise.race pattern
 * Prevents LLM stalls from blocking ingestion pipeline
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const startTime = Date.now();
  
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      const duration = Date.now() - startTime;
      reject(new AutoAnalysisTimeoutError(
        `${operationName} exceeded timeout of ${timeoutMs}ms`,
        duration
      ));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

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
      // Consolidated conversation fields (optional)
      conversationId?: number;
      messageTranscript?: Array<{
        role: "user" | "assistant" | "system";
        content: string;
        attachments?: Array<{
          type: "image" | "video" | "audio" | "document";
          url: string;
          filename: string;
          mimeType: string;
          size: number;
        }>;
        createdAt?: string;
      }>;
      attachments?: Array<{
        type: "image" | "video" | "audio" | "document";
        url: string;
        filename: string;
        mimeType: string;
        size: number;
      }>;
    }
  ): Promise<CurationItem> {
    // 🧠 GATE 1: PREPROCESSING PIPELINE (Compute BEFORE insert)
    // Following 2025 best practices for semantic deduplication
    console.log(`[Curation] 🧠 Gate 1: Preprocessing pipeline...`);
    
    // Import utilities
    const { generateContentHash, normalizeContent } = await import("../utils/deduplication");
    
    // Compute normalized content and hash (for exact duplicate detection)
    const normalizedText = normalizeContent(data.content);
    const contentHash = generateContentHash(data.content);
    
    console.log(`[Curation] → Normalized: "${normalizedText.substring(0, 60)}..."`);
    console.log(`[Curation] → Hash: ${contentHash.substring(0, 16)}...`);
    
    // Override data with computed values (ensure they're set!)
    data.contentHash = contentHash;
    data.normalizedContent = normalizedText;
    
    // 🔥 GATE 2: TIERED DUPLICATE DETECTION
    // Tier 1: Exact hash (instant)
    // Tier 2: Semantic similarity with pgvector (fast ANN)
    // Tier 3: LLM adjudication for borderline cases (0.85-0.92)
    // Returns embedding for persistence to avoid re-generation
    console.log(`[Curation] 🔥 Gate 2: Tiered duplicate detection...`);
    
    let generatedEmbedding: number[] | undefined = undefined;
    
    if (data.content) {
      const { deduplicationService } = await import("../services/deduplication-service");
      const duplicateCheck = await deduplicationService.checkCurationRealtimeDuplicate(
        data.content,
        contentHash,
        normalizedText
      );
      
      if (duplicateCheck) {
        // Capture embedding even if duplicate (for logging/analytics)
        generatedEmbedding = duplicateCheck.embedding;
        
        if (duplicateCheck.isDuplicate) {
          const location = duplicateCheck.isPending ? 'curation queue' : 'Knowledge Base';
          const errorMsg = duplicateCheck.isPending 
            ? `This content is already pending approval in the curation queue as "${duplicateCheck.documentTitle}". Skipped to avoid duplication.`
            : `This content already exists in the Knowledge Base as "${duplicateCheck.documentTitle}". Skipped to avoid duplication.`;
          
          // BUG #13 FIX: INFO não ERROR (duplicate detection é comportamento esperado!)
          console.log(`[Curation] ℹ️  Duplicate detected in ${location}: "${duplicateCheck.documentTitle}" - skipping to avoid duplication`);
          
          // Throw custom error with rich metadata for API consumers (type-safe class)
          throw new DuplicateContentError({
            duplicateOfId: duplicateCheck.documentId!,
            similarity: duplicateCheck.similarity ?? 1.0, // Se não tem similarity, assume 1.0 (duplicado exato)
            newContentPercent: 0, // Duplicado = 0% conteúdo novo
            reason: errorMsg
          });
        } else {
          // Not duplicate - capture embedding for persistence
          generatedEmbedding = duplicateCheck.embedding;
        }
      }
    }
    
    // 🛡️ FALLBACK: If dedup service didn't generate embedding, generate it now!
    // This ensures EVERY item has embedding for semantic search (critical!)
    if (!generatedEmbedding && data.content) {
      console.log(`[Curation] ⚠️ No embedding from dedup check - generating fallback embedding...`);
      try {
        const { embedText } = await import("../ai/embedder");
        const embeddingResult = await embedText(data.content);
        generatedEmbedding = embeddingResult; // embedText returns number[]
        console.log(`[Curation] ✅ Fallback embedding generated (${generatedEmbedding.length} dimensions)`);
      } catch (embedError: any) {
        console.error(`[Curation] ❌ Failed to generate fallback embedding:`, embedError.message);
        // Continue without embedding - will be backfilled later
      }
    }
    
    console.log(`[Curation] ✅ No duplicates found - proceeding with insert${generatedEmbedding ? ' (with embedding)' : ' (WITHOUT embedding - needs backfill)'}`);

    
    // STEP 1: Inserir na fila de curadoria (WITH embedding if generated)
    const [item] = await db.insert(curationQueueTable).values({
      title: data.title,
      content: data.content,
      suggestedNamespaces: data.suggestedNamespaces,
      tags: data.tags || [],
      status: "pending",
      submittedBy: data.submittedBy,
      contentHash: data.contentHash, // Store for O(1) dedup lookups
      normalizedContent: data.normalizedContent, // Store for fuzzy matching
      embedding: generatedEmbedding || null, // 🎯 PERSIST embedding from dedup check (avoid re-generation!)
      // Consolidated conversation fields (if provided)
      conversationId: data.conversationId,
      messageTranscript: data.messageTranscript as any, // JSONB field
      attachments: data.attachments as any, // JSONB field
    }).returning();

    // STEP 1.5: Track query frequency for reuse-aware auto-approval (CRITICAL for reuse gate)
    // This enables cost-optimization by detecting frequently asked questions
    // 🎯 CRITICAL: Track data.title (not content) to MATCH decide() queryText parameter
    // This ensures frequency lookups succeed when reuse gate checks frequency
    console.log(`[Curation] 📊 ATTEMPTING query frequency tracking for title: "${data.title.substring(0, 50)}..."`);
    try {
      console.log(`[Curation] → Importing queryFrequencyService...`);
      const { queryFrequencyService } = await import("../services/query-frequency-service");
      const primaryNamespace = data.suggestedNamespaces && data.suggestedNamespaces.length > 0 
        ? data.suggestedNamespaces[0] 
        : undefined;
      console.log(`[Curation] → Calling track() with namespace="${primaryNamespace}", conversationId="${data.conversationId}"`);
      
      await queryFrequencyService.track(
        data.title,  // ✅ MATCH with decide() queryText for reuse gate!
        primaryNamespace,
        data.conversationId?.toString()
      );
      console.log(`[Curation] ✅ Query frequency tracking completed`);
    } catch (error: any) {
      // Non-critical - don't block curation if tracking fails
      console.error(`[Curation] ❌ Query frequency tracking failed:`, error.message, error.stack);
    }

    // STEP 2: Executar análise automática IMEDIATAMENTE (garantir autoAnalysis existe)
    // CRITICAL: Auto-curator-processor depende de autoAnalysis para auto-approval
    // Se análise falhar, item ficará pendente para HITL review (correto)
    try {
      console.log(`[Curation] 🤖 Executando análise automática SYNC para item ${item.id}...`);
      await this.runAutoAnalysis(item.id, data);
      console.log(`[Curation] ✅ Análise automática completada para item ${item.id}`);
    } catch (error: any) {
      if (error instanceof AutoAnalysisTimeoutError) {
        console.error(`[Curation] ⏱️ Item ${item.id}: Timeout após ${error.duration}ms - aguardando HITL review`);
      } else {
        console.error(`[Curation] ❌ Erro na análise automática do item ${item.id}:`, error.message);
      }
      console.error(`[Curation] ⚠️ Item ${item.id} criado SEM autoAnalysis - requer HITL review`);
      // Item foi criado mas sem análise automática - vai precisar revisão humana (aceitável)
    }

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

      // 🔥 FIX: Wrapper com fallback quando curatorAgentDetector falha
      let analysis;
      try {
        analysis = await withTimeout(
          curatorAgentDetector.analyzeCurationItem(
            data.title,
            data.content,
            data.suggestedNamespaces,
            data.tags || [],
            data.submittedBy
          ),
          AUTO_ANALYSIS_TIMEOUT_MS,
          'Auto-analysis LLM call'
        );
        
        // 🔥 FIX: Verificar se analysis é null (quando curator agent offline)
        if (!analysis) {
          throw new Error('Curator agent returned null - agent may be offline');
        }
      } catch (curatorError: any) {
        console.warn(`[Curation] ⚠️ Curator agent falhou: ${curatorError.message} - tentando fallback LLM...`);
        
        // 🔥 FALLBACK: Usar generateWithFreeAPIs para análise básica
        const { generateWithFreeAPIs } = await import("../llm/free-apis");
        
        const fallbackPrompt = `Analise o seguinte conteúdo para curadoria da base de conhecimento:

Título: ${data.title}
Conteúdo: ${data.content.substring(0, 1000)}...
Namespaces sugeridos: ${data.suggestedNamespaces.join(', ')}

Responda em JSON com:
{
  "score": <número 0-100>,
  "recommended": <"approve"|"review"|"reject">,
  "reasoning": "<explicação breve>",
  "concerns": [<lista de preocupações>]
}`;

        try {
          const fallbackResponse = await generateWithFreeAPIs({
            messages: [{ role: 'user', content: fallbackPrompt }],
            temperature: 0.3,
            maxTokens: 500
          });
          
          // Parse JSON response
          const jsonMatch = fallbackResponse.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            analysis = {
              score: parsed.score || 50,
              recommended: parsed.recommended || 'review',
              reasoning: parsed.reasoning || 'Análise automática via fallback LLM',
              concerns: parsed.concerns || [],
              flags: [],
              suggestedNamespaces: data.suggestedNamespaces
            };
            console.log(`[Curation] ✅ Fallback LLM gerou análise: score=${analysis.score}, rec=${analysis.recommended}`);
          } else {
            throw new Error('Fallback LLM não retornou JSON válido');
          }
        } catch (fallbackError: any) {
          console.error(`[Curation] ❌ Fallback LLM também falhou: ${fallbackError.message}`);
          // 🔒 ÚLTIMO RECURSO: Análise conservadora para HITL review
          analysis = {
            score: 50,
            recommended: 'review',
            reasoning: 'Ambos curator agent e fallback LLM falharam - requer revisão humana por segurança',
            concerns: ['Análise automática indisponível'],
            flags: ['manual-review-required'],
            suggestedNamespaces: data.suggestedNamespaces
          };
          console.log(`[Curation] 🛡️ Usando análise conservadora - item vai para HITL review`);
        }
      }

      // Formatar nota com análise automática
      const autoNote = `🤖 ANÁLISE AUTOMÁTICA (Agente de Curadoria):

📊 **Recomendação:** ${analysis.recommended === 'approve' ? '✅ APROVAR' : analysis.recommended === 'reject' ? '❌ REJEITAR' : '⚠️ REVISAR MANUALMENTE'}
🎯 **Score de Qualidade:** ${analysis.score}/100

📝 **Raciocínio:**
${analysis.reasoning}

${analysis.suggestedEdits ? `
✏️ **Sugestões de Edição:**
${analysis.suggestedEdits.title ? `- Título: "${analysis.suggestedEdits.title}"\n` : ''}${analysis.suggestedEdits.tags ? `- Tags: ${analysis.suggestedEdits.tags.join(', ')}\n` : ''}
` : ''}${analysis.concerns && analysis.concerns.length > 0 ? `
⚠️ **Preocupações:**
${analysis.concerns.map((c: string) => `- ${c}`).join('\n')}
` : ''}
---
*Análise automática gerada pelo agente de curadoria. A decisão final é humana.*`;

      // Atualizar item com análise automática (SALVAR STRUCTURED DATA!)
      await db
        .update(curationQueueTable)
        .set({
          note: autoNote, // Human-readable markdown note
          autoAnalysis: { // STRUCTURED DATA for auto-approval
            score: analysis.score,
            flags: analysis.flags,
            suggestedNamespaces: analysis.suggestedNamespaces,
            reasoning: analysis.reasoning,
            recommended: analysis.recommended,
            concerns: analysis.concerns
          } as any,
          score: analysis.score, // Também atualizar score legacy field
          updatedAt: new Date(),
        })
        .where(eq(curationQueueTable.id, itemId));

      console.log(`[Curation] ✅ Análise automática concluída para item ${itemId}: ${analysis.recommended} (score: ${analysis.score})`);

      // 🚀 AUTO-APPROVAL SYSTEM (Configuration-driven via DB)
      // ======================================================================
      // Uses autoApprovalService to apply DB-configured thresholds and rules
      // Supports namespace filtering, content flags, and quality gates integration
      
      // 🔒 GUARD: Só processa auto-approval se análise foi bem-sucedida
      if (!analysis || typeof analysis.score !== 'number') {
        console.log(`[Curation] ⚠️ Análise automática incompleta - mantendo em HITL review por segurança`);
        return; // Sair sem processar - item fica pendente para revisão humana
      }
      
      // Import auto-approval service (dynamic import for service layer)
      const { autoApprovalService } = await import("../services/auto-approval-service");
      
      // Extract content flags and namespaces from structured analysis
      const contentFlags = analysis.flags || [];
      const namespaces = analysis.suggestedNamespaces || [];
      
      // Get auto-approval decision from service (uses DB config)
      // 🎯 PHASE 1 FIX: Pass data.title as queryText to enable Greeting Gate + Reuse Gate
      // (Phase 2: Add dedicated originalQuery field for long-term accuracy)
      const decision = await autoApprovalService.decide(
        analysis.score,
        contentFlags,
        namespaces,
        undefined,  // qualityGatesPassed (not used yet)
        data.title  // queryText for greeting detection + frequency tracking
      );
      
      console.log(`[Curation] 🤖 Auto-approval decision: ${decision.action.toUpperCase()}`);
      console.log(`[Curation] 📊 Reason: ${decision.reason}`);
      console.log(`[Curation] ⚙️ Config: minScore=${decision.configUsed.minApprovalScore}, maxScore=${decision.configUsed.maxRejectScore}, flags=${decision.configUsed.sensitiveFlags.join(',')}`);

      // Execute decision
      if (decision.action === 'approve' && analysis.recommended === 'approve') {
        console.log(`[Curation] 🚀 AUTO-APROVAÇÃO: ${decision.reason}`);
        console.log(`[Curation] 💡 Conteúdo seguro detectado - aprovando automaticamente para acelerar aprendizado`);
        
        try {
          // Auto-aprovar usando sistema automático
          const approvalResult = await this.approveAndPublish(itemId, 'auto-curator-agent');
          console.log(`[Curation] ✅ Item ${itemId} auto-aprovado e publicado na KB (docId: ${approvalResult.publishedId})`);
          console.log(`[Curation] 🚀 Fluxo acelerado: KB → Dataset → Treino automático`);
          return; // Sair - item já processado
        } catch (autoApproveError: any) {
          console.error(`[Curation] ❌ Falha na auto-aprovação:`, autoApproveError.message);
          console.error(`[Curation] Stack trace:`, autoApproveError.stack);
          console.log(`[Curation] ⚠️ Mantendo item ${itemId} em HITL review por segurança`);
          
          // Adicionar nota sobre falha de auto-approval
          try {
            const [currentItem] = await db.select().from(curationQueueTable).where(eq(curationQueueTable.id, itemId)).limit(1);
            await db.update(curationQueueTable)
              .set({
                note: (currentItem?.note || '') + `\n\n⚠️ Auto-aprovação falhou: ${autoApproveError.message}\nItem requer revisão manual.`,
                updatedAt: new Date(),
              })
              .where(eq(curationQueueTable.id, itemId));
          } catch (noteError: any) {
            console.error(`[Curation] ❌ Erro ao adicionar nota de falha:`, noteError.message);
          }
          
          // Continua para HITL se auto-approval falhar
        }
      } else if (decision.action === 'reject' && analysis.recommended === 'reject') {
        console.log(`[Curation] ❌ AUTO-REJEIÇÃO: ${decision.reason}`);
        
        try {
          await this.reject(itemId, 'auto-curator-agent', `Automaticamente rejeitado. ${decision.reason}. ${analysis.reasoning}`);
          console.log(`[Curation] ✅ Item ${itemId} auto-rejeitado`);
          return; // Sair - item já processado
        } catch (autoRejectError: any) {
          console.error(`[Curation] ❌ Falha na auto-rejeição:`, autoRejectError.message);
          console.log(`[Curation] ⚠️ Mantendo em HITL review por segurança`);
        }
      } else {
        // HITL obrigatório (decision.action === 'review')
        console.log(`[Curation] ⚠️ HITL REVIEW NECESSÁRIO: ${decision.reason}`);
        console.log(`[Curation] 👤 Aguardando aprovação humana para decisão final`);
      }

      // Se o agente recomendou edições, podemos aplicá-las automaticamente (opcional)
      if (analysis.suggestedEdits && analysis.score >= 70) {
        console.log(`[Curation] 💡 Agente sugeriu edições (score alto: ${analysis.score}), mas mantendo valores originais para revisão humana`);
      }
    } catch (error: any) {
      if (error instanceof AutoAnalysisTimeoutError) {
        console.error(`[Curation] ⏱️ TIMEOUT: Análise automática excedeu ${error.duration}ms (limite: ${AUTO_ANALYSIS_TIMEOUT_MS}ms) para item ${itemId}`);
        console.warn(`[Curation] ⚠️ Item ${itemId} mantido em HITL review - LLM não respondeu a tempo`);
      } else {
        console.error(`[Curation] ❌ Falha na análise automática:`, error.message);
      }
      // Não propagar erro - análise automática é opcional, item fica pendente para HITL
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
   * 
   * @param id - Item ID
   * @param reviewedBy - Who approved (user or AUTO-CURATOR)
   * @param approvalNote - Optional audit note (e.g., REUSE-GATE reason)
   */
  async approveAndPublish(
    id: string,
    reviewedBy: string,
    approvalNote?: string
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
      // Se já tem duplicateOfId marcado, valida e usa direto
      if (item.duplicateOfId) {
        const numericId = Number(item.duplicateOfId);
        if (Number.isInteger(numericId) && numericId > 0) {
          duplicateDocId = numericId;
        } else {
          console.warn(`[Curation] ⚠️ duplicateOfId "${item.duplicateOfId}" is not a valid integer ID, forcing KB scan`);
          // Fall through to KB scan
        }
      }
      
      if (!duplicateDocId) {
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
            throw new DuplicateContentError({
              duplicateOfId: originalDoc.id,
              similarity: 1.0, // Default to 100% similarity (we know it's a duplicate)
              newContentPercent: analysis.stats.newContentPercent,
              reason: `${analysis.stats.newContentPercent}% new content (minimum 10% required). ${analysis.reason}`
            });
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
      const uniqueNamespaces = new Set(finalNamespaces.filter(ns => ns && ns.trim()));
      finalNamespaces = Array.from(uniqueNamespaces);

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
      const imageProcessor = await ImageProcessor.create();
      
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

    // 🔥 PRODUCTION FIX: Use centralized preparation (prevents bypass)
    const { prepareDocumentForInsert } = await import("../utils/deduplication");
    
    // Prepare document data
    const documentData = prepareDocumentForInsert({
      title: item.title,
      content: contentToSave,
      contentHash: item.contentHash, // Will be generated if missing
      source: isAbsorption ? "curation_absorption" : "curation_approved",
      status: "approved",
      attachments: finalAttachments || undefined,
      metadata: {
        namespaces: finalNamespaces,
        tags: item.tags,
        curationId: item.id,
        reviewedBy,
        isAbsorption,
        ...(isAbsorption && item.duplicateOfId ? { absorbedFrom: item.duplicateOfId } : {})
      } as any,
    });
    
    // Create document record in database
    const [newDoc] = await db.insert(documents).values(documentData as any).returning();

    // Log attachments being saved
    if (item.attachments && item.attachments.length > 0) {
      console.log(`[Curation] 📎 Salvando ${item.attachments.length} attachments junto com documento ${newDoc.id}`);
    }

    // 🔥 INDEXAÇÃO UNIFICADA: texto principal + descriptions dos attachments
    // Garante que imagens/vídeos sejam encontrados via busca textual
    let contentToIndex = newDoc.content;
    if (finalAttachments && finalAttachments.length > 0) {
      const attachmentDescriptions = finalAttachments
        .filter((att: any) => att.description && att.description.trim())
        .map((att: any) => `[${att.type === 'image' ? 'Imagem' : 'Vídeo'}] ${att.description}`)
        .join('\n');
      
      if (attachmentDescriptions) {
        contentToIndex = `${newDoc.content}\n\n--- Mídia Anexada ---\n${attachmentDescriptions}`;
        console.log(`[Curation] 🖼️ Indexando ${finalAttachments.length} attachments com descriptions na KB`);
      }
    }

    // 🔥 FIX CRÍTICO: Index approved content with NAMESPACE (singular, not namespaces plural!)
    // VectorStore.search expects 'namespace' (singular string), not 'namespaces' (array)
    const primaryNamespace = finalNamespaces && finalNamespaces.length > 0 
      ? finalNamespaces[0]  // Use first namespace
      : 'general';  // Fallback to default namespace
    
    await knowledgeIndexer.indexDocument(newDoc.id, contentToIndex, {
      namespace: primaryNamespace, // ← Singular string for VectorStore compatibility!
      title: item.title,
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
        note: approvalNote || null, // Optional audit note (e.g., REUSE-GATE reason)
        updatedAt: now,
      })
      .where(eq(curationQueueTable.id, id))
      .returning();

    console.log(`[Curation] ✅ Approved and published item ${id} to KB as document ${newDoc.id}`);

    return { item: updatedItem, publishedId: newDoc.id.toString() };
  },

  /**
   * Publica item JÁ APROVADO para Knowledge Base
   * 
   * Diferente de approveAndPublish():
   * - Assume que item.status = 'approved' (não muda status)
   * - Usado por approval-promotion-worker para backfill de items já aprovados
   * - Reutiliza lógica completa de publicação (deduplicação, namespaces, indexação)
   * 
   * @param id - Item ID (must have status='approved')
   * @returns publishedId - ID do documento criado na KB
   */
  async publishApprovedItem(id: string): Promise<string> {
    const item = await this.getById(id);
    if (!item) {
      throw new Error("Item not found");
    }
    
    if (item.status !== "approved") {
      throw new Error(`Item ${id} must be approved before publishing (current status: ${item.status})`);
    }
    
    if (item.publishedId) {
      console.log(`[Curation] ℹ️ Item ${id} already published as ${item.publishedId} - skipping`);
      return item.publishedId;
    }

    // 🔥 VERIFICAÇÃO UNIVERSAL DE DUPLICAÇÃO (same as approveAndPublish)
    let contentToSave = item.content;
    let isAbsorption = false;
    let duplicateDocId: number | null = null;

    try {
      if (item.duplicateOfId) {
        const numericId = Number(item.duplicateOfId);
        if (Number.isInteger(numericId) && numericId > 0) {
          duplicateDocId = numericId;
        } else {
          console.warn(`[Curation] ⚠️ duplicateOfId "${item.duplicateOfId}" is not a valid integer ID, forcing KB scan`);
          // Fall through to KB scan
        }
      }
      
      if (!duplicateDocId) {
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

      // Absorção de conteúdo (same logic)
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
            contentToSave = analysis.extractedContent;
            isAbsorption = true;
            console.log(`[Curation] 🔥 AUTO-ABSORÇÃO: ${analysis.stats.reductionPercent}% redução`);
          } else {
            // 🔥 FIX: Retornar ID do documento existente ao invés de throw
            // Isso permite que worker salve publishedId correto (prevent reprocessing)
            console.log(`[Curation] ⚠️ Conteúdo duplicado (${analysis.stats.newContentPercent}% novo < 10%) - usando documento existente ${originalDoc.id}`);
            
            // Atualizar publishedId para apontar documento existente
            await db
              .update(curationQueueTable)
              .set({
                publishedId: originalDoc.id.toString(),
                note: item.note 
                  ? `${item.note}\n\n---\n⚠️ Duplicate content - linked to existing document ${originalDoc.id} (${analysis.stats.newContentPercent}% new content < 10% threshold).`
                  : `⚠️ Duplicate content - linked to existing document ${originalDoc.id} (${analysis.stats.newContentPercent}% new content < 10% threshold).`,
                updatedAt: new Date(),
              })
              .where(eq(curationQueueTable.id, id));
            
            // Retornar ID do documento existente (NÃO criar novo)
            return originalDoc.id.toString();
          }
        }
      } else {
        console.log(`[Curation] ✅ Conteúdo único detectado para "${item.title}"`);
      }
    } catch (verificationError: any) {
      throw new Error(`Falha na verificação de duplicação: ${verificationError.message}`);
    }

    // Auto-criação de namespaces (same logic)
    let finalNamespaces = item.suggestedNamespaces || [];
    if (item.suggestedNamespaces && item.suggestedNamespaces.length > 0) {
      const { autoCreateNamespacesAndAgents } = await import("../services/auto-namespace-creator");
      const creationResult = await autoCreateNamespacesAndAgents(item.suggestedNamespaces, {
        source: "curation_approved_promotion",
        curationItemId: item.id,
        reviewedBy: item.reviewedBy || 'SYSTEM',
      });

      finalNamespaces = item.suggestedNamespaces.map(ns => 
        creationResult.consolidatedMapping[ns] || ns
      );

      const uniqueNamespaces = new Set(finalNamespaces.filter(ns => ns && ns.trim()));
      finalNamespaces = Array.from(uniqueNamespaces);
    }

    if (!finalNamespaces || finalNamespaces.length === 0) {
      finalNamespaces = ['geral'];
    }

    // Processamento de imagens (same logic)
    let finalAttachments = item.attachments;
    if (item.attachments && item.attachments.length > 0) {
      const { ImageProcessor } = await import("../learn/image-processor");
      const imageProcessor = await ImageProcessor.create();
      
      finalAttachments = await Promise.all(
        item.attachments.map(async (att: any) => {
          if (att.base64 && att.type === "image") {
            const buffer = Buffer.from(att.base64, 'base64');
            const localPath = await imageProcessor.saveImageFromBuffer(buffer, att.filename);
            return {
              type: att.type,
              url: localPath,
              filename: att.filename,
              mimeType: att.mimeType,
              size: att.size,
              description: att.description
            };
          }
          return att;
        })
      );
    }

    // Preparar documento (same logic)
    const { prepareDocumentForInsert } = await import("../utils/deduplication");
    const documentData = prepareDocumentForInsert({
      title: item.title,
      content: contentToSave,
      contentHash: item.contentHash,
      source: isAbsorption ? "curation_absorption" : "curation_approved",
      status: "approved",
      attachments: finalAttachments || undefined,
      metadata: {
        namespaces: finalNamespaces,
        tags: item.tags,
        curationId: item.id,
        reviewedBy: item.reviewedBy || 'SYSTEM',
        isAbsorption,
        ...(isAbsorption && item.duplicateOfId ? { absorbedFrom: item.duplicateOfId } : {})
      } as any,
    });
    
    // 🔥 DUPLICATE HANDLING: Check if duplicateDocId exists and is valid
    if (duplicateDocId) {
      // documents.id is INTEGER, so validate numeric ID before querying
      const numericId = Number(duplicateDocId);
      
      if (!Number.isInteger(numericId) || numericId <= 0) {
        console.warn(`[Curation] ⚠️ duplicateDocId "${duplicateDocId}" is not a valid integer ID, creating new document instead`);
        // Fall through to normal document creation
      } else {
        // Check if duplicate document exists
        const existingDocs = await db.select().from(documents)
          .where(eq(documents.id, numericId)).limit(1);
        
        if (existingDocs.length > 0) {
          const existingDoc = existingDocs[0];
          console.log(`[Curation] ♻️ Reusing existing document ${numericId} (duplicate absorption)`);
          
          // Find the publishedId used when this document was first indexed
          // publishedId should be the stable identifier used by knowledgeIndexer
          const existingPublishedId = existingDoc.id.toString(); // Use doc.id as canonical publishedId
          
          // Update publishedId to point to existing document
          await db.update(curationQueueTable).set({
            publishedId: existingPublishedId,
            updatedAt: new Date(),
          }).where(eq(curationQueueTable.id, id));
          
          return existingPublishedId;
        } else{
          console.warn(`[Curation] ⚠️ duplicateDocId ${numericId} not found in documents table, creating new document`);
          // Fall through to normal document creation
        }
      }
    }
    
    // 🔥 TRANSACTION SAFETY: Try-catch with cleanup on failure
    let newDoc: typeof documents.$inferSelect;
    try {
      // Criar documento no DB
      [newDoc] = await db.insert(documents).values(documentData as any).returning();
    } catch (docError: any) {
      // If document creation fails (e.g., duplicate content_hash), throw immediately
      console.error(`[Curation] ❌ Failed to create document:`, docError.message);
      throw new Error(`Document creation failed: ${docError.message}`);
    }

    // Indexação com attachments
    let contentToIndex = newDoc.content;
    if (finalAttachments && finalAttachments.length > 0) {
      const attachmentDescriptions = finalAttachments
        .filter((att: any) => att.description && att.description.trim())
        .map((att: any) => `[${att.type === 'image' ? 'Imagem' : 'Vídeo'}] ${att.description}`)
        .join('\n');
      
      if (attachmentDescriptions) {
        contentToIndex = `${newDoc.content}\n\n--- Mídia Anexada ---\n${attachmentDescriptions}`;
      }
    }

    const primaryNamespace = finalNamespaces[0] || 'general';
    
    // 🔥 TRANSACTION SAFETY: Cleanup orphan document if indexing fails
    try {
      await knowledgeIndexer.indexDocument(newDoc.id, contentToIndex, {
        namespace: primaryNamespace,
        title: item.title,
        tags: item.tags,
        source: "curation_approved",
        curationId: item.id,
      });
    } catch (indexError: any) {
      console.error(`[Curation] ❌ Indexing failed - cleaning up orphan document ${newDoc.id}:`, indexError.message);
      
      // Cleanup: Delete orphan document (no vector embeddings to clean - indexing failed before creation)
      await db.delete(documents).where(eq(documents.id, newDoc.id));
      
      throw new Error(`Indexing failed (orphan cleaned up): ${indexError.message}`);
    }

    // Salvar em training_data_collection with cleanup on failure
    try {
      const { trainingDataCollection } = await import("@shared/schema");
      const qualityTag = item.tags.find((t: any) => t.startsWith('quality-'));
      const qualityScore = qualityTag ? 
        Math.max(0, Math.min(100, parseInt(qualityTag.split('-')[1]) || 75)) : 
        75;
      
      await db.insert(trainingDataCollection).values({
        conversationId: null,
        autoQualityScore: qualityScore,
        status: "approved",
        formattedData: [{
          instruction: item.title,
          output: item.content,
        }],
        metadata: {
          source: "curation_approved_promotion",
          curationItemId: item.id,
          namespaces: finalNamespaces,
          tags: item.tags,
          reviewedBy: item.reviewedBy || 'SYSTEM',
        },
      } as any);
      
      console.log(`[Curation] ✅ Saved to training_data_collection (quality: ${qualityScore})`);
    } catch (trainingError: any) {
      console.error(`[Curation] ❌ Training data save failed - cleaning up document ${newDoc.id}:`, trainingError.message);
      
      // 🔥 COMPLETE CLEANUP: Delete document + vector embeddings + training data
      try {
        // Delete vector embeddings first
        const { ragService } = await import("../rag/vector-store");
        await ragService.deleteDocument(newDoc.id);
        
        // Delete document from DB
        await db.delete(documents).where(eq(documents.id, newDoc.id));
        
        console.log(`[Curation] ✅ Orphan cleaned up: document ${newDoc.id} + vector embeddings deleted`);
      } catch (cleanupError: any) {
        console.error(`[Curation] ⚠️ Cleanup failed for document ${newDoc.id}:`, cleanupError.message);
        // Don't throw - original error is more important
      }
      
      throw new Error(`Training data save failed (orphan cleaned up): ${trainingError.message}`);
    }

    // Atualizar publishedId (NÃO muda status - já é approved!)
    await db
      .update(curationQueueTable)
      .set({
        publishedId: newDoc.id.toString(),
        updatedAt: new Date(),
      })
      .where(eq(curationQueueTable.id, id));

    console.log(`[Curation] ✅ Published approved item ${id} to KB as document ${newDoc.id}`);

    return newDoc.id.toString();
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
