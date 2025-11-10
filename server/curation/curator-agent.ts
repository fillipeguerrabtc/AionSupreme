/**
 * CURATOR AGENT - Auto-reconhecimento de agente especializado em curadoria
 * 
 * Sistema detecta automaticamente se existe um agente com:
 * - slug: "curator" ou "curation" ou "curadoria"
 * - namespace: "curation" ou "curator"
 * 
 * Se encontrado, usa esse agente para análise automática de qualidade
 */

import { db } from "../db";
import { agents } from "@shared/schema";
import { or, eq, sql } from "drizzle-orm";
import { generateWithPriority } from "../llm/priority-orchestrator";

export interface CurationAnalysis {
  recommended: "approve" | "reject" | "review";
  score: number; // 0-100
  reasoning: string;
  suggestedEdits?: {
    title?: string;
    content?: string;
    namespaces?: string[];
    tags?: string[];
  };
  concerns?: string[];
}

export class CuratorAgentDetector {
  private cachedAgent: any = null;
  private lastCheck: number = 0;
  private checkInterval = 60000; // Re-check a cada 60 segundos

  /**
   * Detecta se existe agente de curadoria no sistema
   */
  async detectCuratorAgent(): Promise<any | null> {
    const now = Date.now();
    
    // Cache por 60 segundos para evitar queries repetidas
    if (this.cachedAgent && (now - this.lastCheck < this.checkInterval)) {
      return this.cachedAgent;
    }

    try {
      // Procurar agente com slug ou namespace relacionado a curadoria
      const [curatorAgent] = await db
        .select()
        .from(agents)
        .where(
          or(
            // Slug matche
            eq(agents.slug, "curator"),
            eq(agents.slug, "curation"),
            eq(agents.slug, "curadoria"),
            // Ou namespace contenha "curation" (JSONB containment operator)
            sql`${agents.ragNamespaces} @> '["curation"]'::jsonb`,
            sql`${agents.ragNamespaces} @> '["curator"]'::jsonb`,
            sql`${agents.ragNamespaces} @> '["curadoria"]'::jsonb`
          )
        )
        .limit(1);

      this.cachedAgent = curatorAgent || null;
      this.lastCheck = now;

      if (curatorAgent) {
        console.log(`[CuratorAgent] ✅ Agente de curadoria detectado: "${curatorAgent.name}" (slug: ${curatorAgent.slug})`);
      } else {
        console.log(`[CuratorAgent] ⚠️ Nenhum agente de curadoria encontrado`);
      }

      return this.cachedAgent;
    } catch (error: any) {
      console.error(`[CuratorAgent] ❌ Erro ao detectar agente:`, error.message);
      return null;
    }
  }

  /**
   * Força re-check (útil quando um novo agente é criado)
   */
  forceRecheck(): void {
    this.cachedAgent = null;
    this.lastCheck = 0;
  }

  /**
   * Analisa item da fila de curadoria usando agente especializado
   */
  async analyzeCurationItem(
    title: string,
    content: string,
    suggestedNamespaces: string[],
    tags: string[],
    submittedBy?: string
  ): Promise<CurationAnalysis> {
    const agent = await this.detectCuratorAgent();

    if (!agent) {
      // Sem agente de curadoria, retornar análise padrão conservadora
      console.log(`[CuratorAgent] ⚠️ Sem agente de curadoria - análise manual obrigatória`);
      return {
        recommended: "review",
        score: 50,
        reasoning: "Nenhum agente de curadoria disponível. Revisão manual necessária.",
        concerns: ["Sistema não possui agente de curadoria configurado"]
      };
    }

    try {
      // Construir prompt para o agente analisar o conteúdo
      const analysisPrompt = `Você é um agente especializado em curadoria de conhecimento. Analise este conteúdo proposto para a Knowledge Base:

**TÍTULO:** ${title}

**CONTEÚDO:**
${content.length > 2000 ? content.substring(0, 2000) + '...' : content}

**NAMESPACES SUGERIDOS:** ${suggestedNamespaces.join(', ')}
**TAGS:** ${tags.join(', ')}
**SUBMETIDO POR:** ${submittedBy || 'Desconhecido'}

**SUA TAREFA:**
Analise este conteúdo e forneça uma avaliação estruturada:

1. **RECOMENDAÇÃO:** Deve ser "approve" (aprovar), "reject" (rejeitar) ou "review" (revisão manual necessária)

2. **SCORE (0-100):** Qualidade geral do conteúdo
   - 90-100: Excepcional, aprovar imediatamente
   - 70-89: Bom, aprovar com pequenos ajustes
   - 50-69: Mediano, requer revisão manual
   - 30-49: Fraco, provavelmente rejeitar
   - 0-29: Péssimo, rejeitar imediatamente

3. **RACIOCÍNIO:** Explique sua avaliação (2-3 frases)

4. **SUGESTÕES DE EDIÇÃO (opcional):**
   - Título melhorado (se necessário)
   - Conteúdo editado (se necessário)
   - Namespaces mais apropriados (se necessário)
   - Tags adicionais recomendadas (se necessário)

5. **PREOCUPAÇÕES (opcional):**
   - Liste quaisquer problemas encontrados (factual errors, bias, qualidade, etc)

**CRITÉRIOS DE AVALIAÇÃO:**
- ✅ Informação factual, precisa e verificável
- ✅ Bem escrito, claro e organizado
- ✅ Relevante para namespaces sugeridos
- ✅ Fonte confiável
- ❌ Informação falsa, desatualizada ou não verificável
- ❌ Baixa qualidade de escrita
- ❌ Conteúdo irrelevante ou spam
- ❌ Bias extremo ou desinformação

Responda APENAS em formato JSON (sem markdown):
{
  "recommended": "approve" | "reject" | "review",
  "score": 75,
  "reasoning": "Conteúdo bem estruturado e factualmente correto...",
  "suggestedEdits": {
    "title": "Título melhorado (opcional)",
    "namespaces": ["namespace1", "namespace2"] (opcional),
    "tags": ["tag1", "tag2"] (opcional)
  },
  "concerns": ["Preocupação 1", "Preocupação 2"] (opcional)
}`;

      // Chamar o LLM usando o agente de curadoria
      const response = await generateWithPriority({
        messages: [
          {
            role: "system",
            content: agent.systemPrompt || "Você é um agente especializado em curadoria de conhecimento."
          },
          {
            role: "user",
            content: analysisPrompt
          }
        ],
        maxTokens: 1024,
        temperature: 0.3, // Baixa temperatura para análise consistente
      });

      // Parse resposta JSON
      let analysis: CurationAnalysis;
      try {
        // Extrair JSON da resposta (pode vir com markdown)
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("Resposta não contém JSON válido");
        }

        const parsedResponse = JSON.parse(jsonMatch[0]);

        // Validar e normalizar resposta
        analysis = {
          recommended: ["approve", "reject", "review"].includes(parsedResponse.recommended) 
            ? parsedResponse.recommended 
            : "review",
          score: Math.max(0, Math.min(100, parsedResponse.score || 50)),
          reasoning: parsedResponse.reasoning || "Análise automática do agente de curadoria.",
          suggestedEdits: parsedResponse.suggestedEdits || undefined,
          concerns: Array.isArray(parsedResponse.concerns) ? parsedResponse.concerns : undefined
        };

        console.log(`[CuratorAgent] ✅ Análise concluída: ${analysis.recommended} (score: ${analysis.score})`);
      } catch (parseError: any) {
        console.error(`[CuratorAgent] ❌ Erro ao parsear resposta:`, parseError.message);
        console.log(`[CuratorAgent] Resposta raw:`, response.content.substring(0, 500));

        // Fallback: Análise manual necessária
        return {
          recommended: "review",
          score: 50,
          reasoning: `Agente de curadoria respondeu mas formato inválido. Resposta: "${response.content.substring(0, 200)}..."`,
          concerns: ["Erro ao parsear resposta do agente de curadoria"]
        };
      }

      return analysis;
    } catch (error: any) {
      console.error(`[CuratorAgent] ❌ Erro ao analisar conteúdo:`, error.message);
      
      // Fallback: Análise manual necessária
      return {
        recommended: "review",
        score: 50,
        reasoning: `Erro ao executar análise automática: ${error.message}`,
        concerns: [`Falha na análise automática: ${error.message}`]
      };
    }
  }
}

// Singleton instance
export const curatorAgentDetector = new CuratorAgentDetector();
