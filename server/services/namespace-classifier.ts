/**
 * NAMESPACE CLASSIFIER SERVICE
 * 
 * Classifica conteúdo automaticamente usando LLM e sugere namespaces/subnamespaces
 * - Análise semântica profunda do conteúdo
 * - Busca por namespaces existentes similares
 * - Validação antes de criar novos namespaces
 * - Garante 1:1 Namespace↔Agente, N:1 Subnamespace↔Subagente
 */

import { db } from '../db';
import { namespaces, agents } from '@shared/schema';
import { eq, sql, or, and, like } from 'drizzle-orm';
import { llmClient } from '../model/llm-client';

export interface NamespaceClassificationResult {
  suggestedNamespace: string;
  confidence: number; // 0-100
  isNewNamespace: boolean;
  existingSimilar: Array<{
    namespace: string;
    similarity: number;
    reason: string;
  }>;
  classification: 'namespace' | 'subnamespace';
  parentNamespace?: string; // Para subnamespaces
  reasoning: string;
}

export class NamespaceClassifier {
  /**
   * Classifica conteúdo e sugere namespace apropriado
   * 
   * @param title - Título do conteúdo
   * @param content - Conteúdo completo
   * @param tenantId - ID do tenant
   * @returns Classificação com sugestões e validações
   */
  async classifyContent(
    title: string,
    content: string,
    tenantId: number = 1
  ): Promise<NamespaceClassificationResult> {
    console.log('[Namespace Classifier] Analyzing content:', title);

    // 1. Buscar todos namespaces existentes
    const existingNamespaces = await this.getExistingNamespaces(tenantId);
    
    // 2. Usar LLM para análise semântica profunda
    const llmAnalysis = await this.analyzeSemantically(title, content, existingNamespaces);

    // 3. Validar se namespace já existe (exact match)
    const exactMatch = existingNamespaces.find(
      ns => ns.name.toLowerCase() === llmAnalysis.suggestedNamespace.toLowerCase()
    );

    if (exactMatch) {
      return {
        suggestedNamespace: exactMatch.name,
        confidence: 100,
        isNewNamespace: false,
        existingSimilar: [{
          namespace: exactMatch.name,
          similarity: 100,
          reason: 'Namespace já existe com nome exato'
        }],
        classification: exactMatch.isSubnamespace ? 'subnamespace' : 'namespace',
        parentNamespace: exactMatch.parentNamespace || undefined,
        reasoning: llmAnalysis.reasoning
      };
    }

    // 4. Buscar namespaces semanticamente similares
    const similarNamespaces = await this.findSimilarNamespaces(
      llmAnalysis.suggestedNamespace,
      llmAnalysis.reasoning,
      existingNamespaces
    );

    return {
      suggestedNamespace: llmAnalysis.suggestedNamespace,
      confidence: llmAnalysis.confidence,
      isNewNamespace: true,
      existingSimilar: similarNamespaces,
      classification: llmAnalysis.classification,
      parentNamespace: llmAnalysis.parentNamespace,
      reasoning: llmAnalysis.reasoning
    };
  }

  /**
   * Buscar todos namespaces existentes
   * NOTE: Namespaces são FLAT (ex: "educacao.matematica" é uma string, não hierarquia)
   */
  private async getExistingNamespaces(tenantId: number) {
    const results = await db
      .select({
        id: namespaces.id,
        name: namespaces.name,
        description: namespaces.description,
      })
      .from(namespaces)
      .where(eq(namespaces.tenantId, tenantId));

    return results.map(ns => {
      // Detectar subnamespace pela presença de "." no nome
      const isSubnamespace = ns.name.includes('.');
      const parentNamespace = isSubnamespace ? ns.name.split('.')[0] : null;

      return {
        id: ns.id,
        name: ns.name,
        description: ns.description || '',
        parentNamespace,
        isSubnamespace
      };
    });
  }

  /**
   * Análise semântica usando LLM (GPT-4 ou similar)
   */
  private async analyzeSemantically(
    title: string,
    content: string,
    existingNamespaces: Array<{ name: string; description: string; isSubnamespace: boolean }>
  ): Promise<{
    suggestedNamespace: string;
    confidence: number;
    classification: 'namespace' | 'subnamespace';
    parentNamespace?: string;
    reasoning: string;
  }> {
    // Truncar conteúdo para evitar custo alto
    const truncatedContent = content.length > 2000 
      ? content.substring(0, 2000) + '...' 
      : content;

    const namespaceList = existingNamespaces.map(ns => 
      `- ${ns.name}${ns.isSubnamespace ? ' (subnamespace)' : ''}: ${ns.description}`
    ).join('\n');

    const prompt = `Você é um especialista em classificação e organização de conhecimento.

**TAREFA:** Analise o conteúdo abaixo e sugira um namespace OU subnamespace apropriado em PORTUGUÊS BRASILEIRO.

**CONTEÚDO:**
Título: ${title}
---
${truncatedContent}
---

**NAMESPACES EXISTENTES:**
${namespaceList || 'Nenhum namespace existe ainda'}

**REGRAS CRÍTICAS:**
1. SEMPRE usar nomes em português brasileiro (ex: "tutoriais", não "tutorials")
2. Se conteúdo é ESPECÍFICO de um namespace existente → sugerir SUBNAMESPACE
3. Se conteúdo é GENÉRICO ou NOVO TEMA → sugerir NAMESPACE raiz
4. Namespaces raiz: temas amplos (ex: "educacao", "tecnologia", "saude")
5. Subnamespaces: especializações (ex: "educacao.matematica", "tecnologia.python")
6. NÃO criar duplicatas! Verificar lista acima primeiro
7. Usar kebab-case minúsculo (ex: "gestao-projetos", não "Gestão Projetos")

**RESPONDA EM JSON:**
{
  "suggestedNamespace": "nome-do-namespace",
  "confidence": 85,
  "classification": "namespace",
  "parentNamespace": null,
  "reasoning": "Explicação detalhada da escolha"
}

**OU se for subnamespace:**
{
  "suggestedNamespace": "nome-do-subnamespace",
  "confidence": 90,
  "classification": "subnamespace",
  "parentNamespace": "namespace-pai",
  "reasoning": "Explicação detalhada da escolha"
}`;

    try {
      const response = await llmClient.createCompletion({
        model: 'gpt-4o-mini', // Mais barato para classificação
        messages: [
          { role: 'system', content: 'Você é um especialista em classificação de conhecimento. Responda APENAS em JSON válido.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3, // Baixa temperatura para respostas consistentes
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.content);

      // Validação
      if (!result.suggestedNamespace || !result.reasoning) {
        throw new Error('LLM response missing required fields');
      }

      // Normalizar namespace (lowercase, kebab-case)
      result.suggestedNamespace = this.normalizeNamespaceName(result.suggestedNamespace);
      if (result.parentNamespace) {
        result.parentNamespace = this.normalizeNamespaceName(result.parentNamespace);
      }

      return {
        suggestedNamespace: result.suggestedNamespace,
        confidence: Math.min(100, Math.max(0, result.confidence || 70)),
        classification: result.classification === 'subnamespace' ? 'subnamespace' : 'namespace',
        parentNamespace: result.parentNamespace || undefined,
        reasoning: result.reasoning
      };
    } catch (error: any) {
      console.error('[Namespace Classifier] LLM analysis failed:', error.message);
      
      // Fallback: classificação baseada em regras simples
      return this.ruleBasedClassification(title, content, existingNamespaces);
    }
  }

  /**
   * Normalizar nome de namespace (kebab-case, minúsculo, sem acentos)
   */
  private normalizeNamespaceName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9.-]/g, '-') // Substitui caracteres especiais por hífen
      .replace(/-+/g, '-') // Remove hífens duplicados
      .replace(/^-|-$/g, ''); // Remove hífens nas extremidades
  }

  /**
   * Classificação baseada em regras (fallback)
   */
  private ruleBasedClassification(
    title: string,
    content: string,
    existingNamespaces: Array<{ name: string; description: string }>
  ): {
    suggestedNamespace: string;
    confidence: number;
    classification: 'namespace' | 'subnamespace';
    parentNamespace?: string;
    reasoning: string;
  } {
    // Extrair palavras-chave do título
    const keywords = title.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Usar primeira palavra-chave como namespace
    const suggestedName = this.normalizeNamespaceName(keywords[0] || 'geral');

    return {
      suggestedNamespace: suggestedName,
      confidence: 50,
      classification: 'namespace',
      reasoning: 'Classificação automática baseada em regras (fallback por falha no LLM)'
    };
  }

  /**
   * Buscar namespaces semanticamente similares
   */
  private async findSimilarNamespaces(
    proposedName: string,
    reasoning: string,
    existingNamespaces: Array<{ name: string; description: string }>
  ): Promise<Array<{ namespace: string; similarity: number; reason: string }>> {
    const similar: Array<{ namespace: string; similarity: number; reason: string }> = [];

    for (const existing of existingNamespaces) {
      // 1. Similaridade de Levenshtein (nome)
      const nameSimilarity = this.calculateLevenshteinSimilarity(proposedName, existing.name);

      // 2. Palavras em comum
      const proposedWords = new Set(proposedName.toLowerCase().split(/[-_]/));
      const existingWords = new Set(existing.name.toLowerCase().split(/[-_]/));
      const commonWords = Array.from(proposedWords).filter(w => existingWords.has(w));
      const wordSimilarity = (commonWords.length / Math.max(proposedWords.size, existingWords.size)) * 100;

      // 3. Combinar métricas
      const overallSimilarity = Math.max(nameSimilarity, wordSimilarity);

      // Considerar similar se >60% similarity
      if (overallSimilarity >= 60) {
        similar.push({
          namespace: existing.name,
          similarity: Math.round(overallSimilarity),
          reason: nameSimilarity > wordSimilarity
            ? `Nome muito similar: "${proposedName}" vs "${existing.name}"`
            : `Palavras em comum: ${commonWords.join(', ')}`
        });
      }
    }

    // Ordenar por similaridade (maior primeiro)
    return similar.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Calcular similaridade de Levenshtein (0-100)
   */
  private calculateLevenshteinSimilarity(a: string, b: string): number {
    const distance = this.levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 100 : ((1 - distance / maxLen) * 100);
  }

  /**
   * Distância de Levenshtein
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}

// Singleton
export const namespaceClassifier = new NamespaceClassifier();
