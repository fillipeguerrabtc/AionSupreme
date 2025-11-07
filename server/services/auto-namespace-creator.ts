import { db } from "../db";
import { namespaces as namespacesTable, agents as agentsTable } from "@shared/schema";
import { eq } from "drizzle-orm";

interface AutoCreateOptions {
  source: string;
  curationItemId?: string;
  reviewedBy?: string;
}

interface CreationResult {
  namespacesCreated: string[];
  agentsCreated: string[];
  namespacesExisting: string[];
  consolidatedMapping: Record<string, string>; // original → consolidated
  errors: string[];
}

/**
 * AUTO-CRIAÇÃO AUTÔNOMA DE NAMESPACES E AGENTES
 * 
 * Sistema de orquestração automática que:
 * 1. Verifica se namespaces existem
 * 2. Cria novos namespaces automaticamente
 * 3. Cria agentes specialists para cada namespace
 * 4. Integra com MoE routing automaticamente
 * 
 * Usado pela curadoria HITL para gestão autônoma da hierarquia
 */
export async function autoCreateNamespacesAndAgents(
  suggestedNamespaces: string[],
  options: AutoCreateOptions
): Promise<CreationResult> {
  const result: CreationResult = {
    namespacesCreated: [],
    agentsCreated: [],
    namespacesExisting: [],
    consolidatedMapping: {},
    errors: [],
  };

  console.log(`[Auto-Creator] 🤖 Processando ${suggestedNamespaces.length} namespaces sugeridos...`);

  for (const namespaceName of suggestedNamespaces) {
    try {
      // 1. Verificar se namespace já existe (exact match)
      const existing = await db
        .select()
        .from(namespacesTable)
        .where(eq(namespacesTable.name, namespaceName))
        .limit(1);

      if (existing.length > 0) {
        console.log(`[Auto-Creator] ✅ Namespace "${namespaceName}" já existe (ID: ${existing[0].id})`);
        result.namespacesExisting.push(namespaceName);
        continue;
      }

      // 2. ANÁLISE SEMÂNTICA: Verificar se existe namespace SIMILAR
      // Usa NamespaceClassifier para detectar namespaces semanticamente parecidos
      const allNamespaces = await db.select().from(namespacesTable);
      const similarNamespaces = await findSimilarNamespaces(
        namespaceName,
        allNamespaces.map(ns => ({ name: ns.name, description: ns.description || '' }))
      );

      // Se encontrou namespace MUITO similar (>80%), usa o existente ao invés de criar
      const verySimilar = similarNamespaces.find(s => s.similarity >= 80);
      if (verySimilar) {
        console.log(`[Auto-Creator] 🔄 Namespace "${namespaceName}" muito similar a "${verySimilar.namespace}" (${verySimilar.similarity}%)
  → Consolidando em "${verySimilar.namespace}" ao invés de criar duplicado`);
        result.namespacesExisting.push(verySimilar.namespace);
        
        // ✅ CRÍTICO: Mapear namespace original → consolidado
        result.consolidatedMapping[namespaceName] = verySimilar.namespace;
        
        // Log warning para admin revisar consolidação
        console.warn(`[Auto-Creator] ⚠️ CONSOLIDAÇÃO AUTOMÁTICA: "${namespaceName}" → "${verySimilar.namespace}"`);
        continue;
      }

      // Se encontrou namespace similar (60-79%), log warning mas ainda cria
      const moderatelySimilar = similarNamespaces.find(s => s.similarity >= 60);
      if (moderatelySimilar) {
        console.warn(`[Auto-Creator] ⚠️ Criando "${namespaceName}" mesmo com namespace similar existente: "${moderatelySimilar.namespace}" (${moderatelySimilar.similarity}%)
  → Considere revisar se realmente precisa de ambos`);
      }

      // 3. Criar namespace automaticamente (passou na análise semântica)
      console.log(`[Auto-Creator] 🆕 Criando namespace "${namespaceName}" automaticamente...`);
      
      // Detectar se é root ou sub-namespace
      const isSubNamespace = namespaceName.includes('/') || namespaceName.includes('.');
      const description = generateNamespaceDescription(namespaceName, isSubNamespace);
      const icon = selectIconForNamespace(namespaceName);

      const [newNamespace] = await db.insert(namespacesTable).values({
        name: namespaceName,
        description,
        icon,
      }).returning();

      result.namespacesCreated.push(namespaceName);
      console.log(`[Auto-Creator] ✅ Namespace criado: "${namespaceName}" (ID: ${newNamespace.id})`);

      // 3. Criar agente specialist para este namespace
      const agentSlug = namespaceName.replace(/[\/\.]/g, '-').toLowerCase();
      const agentName = generateAgentName(namespaceName);

      // Verificar se agente já existe
      const existingAgent = await db
        .select()
        .from(agentsTable)
        .where(eq(agentsTable.slug, agentSlug))
        .limit(1);

      if (existingAgent.length === 0) {
        console.log(`[Auto-Creator] 🤖 Criando agente specialist para namespace "${namespaceName}"...`);

        const systemPrompt = generateSystemPrompt(namespaceName, description);

        const [newAgent] = await db.insert(agentsTable).values({
          name: agentName,
          slug: agentSlug,
          type: "specialist",
          description: `Agente especializado em ${namespaceName} criado automaticamente pela curadoria`,
          systemPrompt,
          assignedNamespaces: [namespaceName],
          ragNamespaces: [namespaceName],
          policy: {
            temperature: 0.7,
            maxTokens: 2000,
            enableRAG: true,
            enableTools: true,
            autoCreated: true,
            createdBy: "curation_system",
            createdAt: new Date().toISOString(),
            source: options.source,
          },
        } as any).returning();

        result.agentsCreated.push(agentName);
        console.log(`[Auto-Creator] ✅ Agente criado: "${agentName}" (ID: ${newAgent.id})`);

        // ✅ CRÍTICO: Registrar agente no agentRegistry para MoE Router
        // Sem isso, o agente não é detectado pelo MoE Router até restart do servidor!
        try {
          const { agentRegistry } = await import("../agent/registry");
          const { registerAgent: registerAgentRuntime } = await import("../agent/runtime");
          const { agentsStorage } = await import("../storage.agents");
          
          // Buscar tools do agente (seguindo padrão do loader.ts)
          const agentTools = await agentsStorage.getAgentTools(newAgent.id);
          const toolNames = agentTools.map((t: any) => t.name);
          
          // Construir objeto Agent seguindo EXATAMENTE o padrão do loader.ts
          const agentForRegistry = {
            id: newAgent.id,
            name: newAgent.name,
            slug: newAgent.slug,
            type: (newAgent.type || "specialist") as "specialist" | "generalist" | "router-only",
            agentTier: (newAgent.agentTier as "agent" | "subagent" | undefined) || undefined,
            assignedNamespaces: newAgent.assignedNamespaces || [], // CRÍTICO para hierarchical orchestration
            description: newAgent.description || undefined,
            systemPrompt: newAgent.systemPrompt || undefined,
            ragNamespaces: newAgent.ragNamespaces || [], // LEGACY field, mas necessário
            allowedTools: toolNames, // Buscar tools reais do DB
            policy: newAgent.policy || {},
            budgetLimit: newAgent.budgetLimit || undefined,
            escalationAgent: newAgent.escalationAgent || undefined,
            inferenceConfig: newAgent.inferenceConfig || {},
            metadata: (newAgent.metadata || {}) as Record<string, unknown>,
          };
          
          // Registrar no registry (para MoE Router encontrar)
          agentRegistry.registerAgent(agentForRegistry);
          
          // Registrar no runtime (para AgentExecutor funcionar)
          await registerAgentRuntime(agentForRegistry);
          
          console.log(`[Auto-Creator] ✅ Agente registrado no MoE Router: "${agentName}" com ${toolNames.length} tools`);
        } catch (error: any) {
          console.error(`[Auto-Creator] ⚠️ Erro ao registrar agente no registry:`, error.message);
          // Não falha a criação se registro falhar - agente estará no DB e será carregado no próximo restart
        }
      } else {
        console.log(`[Auto-Creator] ⚠️ Agente "${agentSlug}" já existe, pulando criação`);
      }

    } catch (error: any) {
      console.error(`[Auto-Creator] ❌ Erro ao processar namespace "${namespaceName}":`, error.message);
      result.errors.push(`${namespaceName}: ${error.message}`);
    }
  }

  // Log final
  console.log(`[Auto-Creator] 📊 Resultado final:
  - Namespaces criados: ${result.namespacesCreated.length}
  - Agentes criados: ${result.agentsCreated.length}
  - Namespaces existentes: ${result.namespacesExisting.length}
  - Erros: ${result.errors.length}`);

  return result;
}

/**
 * Gera descrição automática para namespace baseado no nome
 */
function generateNamespaceDescription(namespaceName: string, isSubNamespace: boolean): string {
  const parts = namespaceName.split(/[\/\.]/);
  const lastPart = parts[parts.length - 1];
  
  // Capitalize primeira letra
  const capitalized = lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
  
  if (isSubNamespace) {
    return `Namespace especializado em ${capitalized} (criado automaticamente pela curadoria)`;
  } else {
    return `Namespace raiz para conteúdos relacionados a ${capitalized} (criado automaticamente pela curadoria)`;
  }
}

/**
 * Seleciona ícone apropriado baseado no nome do namespace
 */
function selectIconForNamespace(namespaceName: string): string {
  const name = namespaceName.toLowerCase();
  
  // Mapeamento inteligente de ícones
  if (name.includes('tecnologia') || name.includes('tech')) return 'Cpu';
  if (name.includes('backend') || name.includes('server')) return 'Server';
  if (name.includes('frontend') || name.includes('ui')) return 'Palette';
  if (name.includes('educacao') || name.includes('education')) return 'GraduationCap';
  if (name.includes('matematica') || name.includes('math')) return 'Calculator';
  if (name.includes('inteligencia') || name.includes('ia') || name.includes('ai')) return 'Brain';
  if (name.includes('atendimento') || name.includes('suporte')) return 'Headphones';
  if (name.includes('vendas') || name.includes('sales')) return 'DollarSign';
  if (name.includes('financas') || name.includes('finance')) return 'Wallet';
  if (name.includes('marketing')) return 'Megaphone';
  if (name.includes('juridico') || name.includes('legal')) return 'Scale';
  if (name.includes('rh') || name.includes('recursos')) return 'Users';
  
  // Default
  return 'FolderTree';
}

/**
 * Gera nome do agente baseado no namespace
 */
function generateAgentName(namespaceName: string): string {
  const parts = namespaceName.split(/[\/\.]/);
  const lastPart = parts[parts.length - 1];
  
  // Capitalize e formata
  const capitalized = lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
  
  return `Especialista ${capitalized}`;
}

/**
 * Gera system prompt para o agente especializado
 */
function generateSystemPrompt(namespaceName: string, description: string): string {
  const parts = namespaceName.split(/[\/\.]/);
  const domain = parts[parts.length - 1];
  
  return `Você é um agente especializado em ${domain}.

${description}

Suas responsabilidades incluem:
- Responder perguntas específicas sobre ${domain}
- Buscar informações relevantes na Knowledge Base do namespace "${namespaceName}"
- Fornecer insights e recomendações baseadas no conhecimento armazenado
- Manter-se atualizado com novos conteúdos aprovados pela curadoria

Sempre priorize informações da Knowledge Base e seja preciso e objetivo nas respostas.

**Importante:** Você foi criado automaticamente pelo sistema de curadoria AION para gerenciar conteúdos relacionados a ${domain}.`;
}

/**
 * ANÁLISE SEMÂNTICA DE SIMILARIDADE
 * Detecta namespaces similares usando Levenshtein + análise de palavras
 */
async function findSimilarNamespaces(
  proposedName: string,
  existingNamespaces: Array<{ name: string; description: string }>
): Promise<Array<{ namespace: string; similarity: number; reason: string }>> {
  const similar: Array<{ namespace: string; similarity: number; reason: string }> = [];

  for (const existing of existingNamespaces) {
    // 1. Similaridade de Levenshtein (nome)
    const nameSimilarity = calculateLevenshteinSimilarity(proposedName, existing.name);

    // 2. Palavras em comum
    const proposedWords = new Set(proposedName.toLowerCase().split(/[-_\/\.]/));
    const existingWords = new Set(existing.name.toLowerCase().split(/[-_\/\.]/));
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
 * Calcula similaridade de Levenshtein entre duas strings (0-100%)
 */
function calculateLevenshteinSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);
  
  if (maxLen === 0) return 100;
  
  const distance = levenshteinDistance(s1, s2);
  return ((maxLen - distance) / maxLen) * 100;
}

/**
 * Algoritmo de Levenshtein Distance
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[len1][len2];
}
