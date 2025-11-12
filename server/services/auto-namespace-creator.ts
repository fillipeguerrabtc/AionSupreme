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
 * 🎯 PRODUCTION-GRADE NAMESPACE DEFAULTS
 * Calcula priority baseado em categorias semânticas (ACCENT-AWARE)
 */
function calculateNamespacePriority(name: string): number {
  const lowercaseName = name.toLowerCase();
  
  // HIGH PRIORITY (80-90): Negócios, turismo, saúde
  if (/turismo|viagem|viagens|travel|hotel|restaurante|gastronomia|sa[uú]de|health|medicina|m[eé]dico/.test(lowercaseName)) {
    return 85;
  }
  
  // MEDIUM-HIGH (70-79): Tecnologia, finanças, educação
  if (/tecnologia|tech|software|programa[cç][aã]o|finan[cç]as|investimento|educa[cç][aã]o|ensino/.test(lowercaseName)) {
    return 75;
  }
  
  // MEDIUM (60-69): Cultura, entretenimento, filosofia
  if (/cultura|arte|m[uú]sica|filme|cinema|filosofia|literatura|hist[oó]ria/.test(lowercaseName)) {
    return 65;
  }
  
  // LOW-MEDIUM (50-59): Geral, saudações, casual
  if (/geral|geral|sauda[cç][oõ]es|greetings|casual|conversa|comunica[cç][aã]o/.test(lowercaseName)) {
    return 50;
  }
  
  // DEFAULT: 60 (balanced)
  return 60;
}

/**
 * 🎨 PRODUCTION-GRADE PERSONALITY SLIDERS
 * Gera slider overrides baseado em domínio do namespace
 * SEMPRE retorna valores (ZERO namespaces sem sliders)
 */
function generateSliderOverrides(name: string): Record<string, number> {
  const lowercaseName = name.toLowerCase();
  
  // Turismo/Viagem: Alto persuasiveness, empathy, enthusiasm
  if (/turismo|viagem|viagens|travel|hotel|restaurante|gastronomia|destino/.test(lowercaseName)) {
    return {
      verbosity: 0.6,
      formality: 0.4,
      creativity: 0.7,
      precision: 0.5,
      persuasiveness: 0.9,
      empathy: 0.8,
      enthusiasm: 0.85,
    };
  }
  
  // Tecnologia: Alto precision, baixo empathy/enthusiasm
  if (/tecnologia|tech|software|programa[cç][aã]o|desenvolvimento|dev|codigo|c[oó]digo/.test(lowercaseName)) {
    return {
      verbosity: 0.5,
      formality: 0.7,
      creativity: 0.4,
      precision: 0.9,
      persuasiveness: 0.6,
      empathy: 0.5,
      enthusiasm: 0.55,
    };
  }
  
  // Filosofia/Cultura: Alto creativity, verbosity, empathy
  if (/filosofia|cultura|arte|m[uú]sica|literatura|hist[oó]ria|cinema|filme/.test(lowercaseName)) {
    return {
      verbosity: 0.7,
      formality: 0.5,
      creativity: 0.8,
      precision: 0.6,
      persuasiveness: 0.65,
      empathy: 0.75,
      enthusiasm: 0.7,
    };
  }
  
  // Finanças: Alto precision, formality
  if (/finan[cç]as|investimento|economia|dinheiro|neg[oó]cio|business/.test(lowercaseName)) {
    return {
      verbosity: 0.5,
      formality: 0.8,
      creativity: 0.3,
      precision: 0.95,
      persuasiveness: 0.7,
      empathy: 0.5,
      enthusiasm: 0.5,
    };
  }
  
  // Saúde: Alto empathy, precision, formality
  if (/sa[uú]de|health|medicina|m[eé]dico|tratamento|diagn[oó]stico/.test(lowercaseName)) {
    return {
      verbosity: 0.6,
      formality: 0.7,
      creativity: 0.4,
      precision: 0.85,
      persuasiveness: 0.6,
      empathy: 0.9,
      enthusiasm: 0.6,
    };
  }
  
  // Educação: Balanced, alto empathy
  if (/educa[cç][aã]o|ensino|escola|universidade|aprendizado/.test(lowercaseName)) {
    return {
      verbosity: 0.65,
      formality: 0.6,
      creativity: 0.6,
      precision: 0.75,
      persuasiveness: 0.65,
      empathy: 0.8,
      enthusiasm: 0.7,
    };
  }
  
  // Comunicação/Social: Alto empathy, enthusiasm
  if (/comunica[cç][aã]o|social|conversa|atendimento|suporte/.test(lowercaseName)) {
    return {
      verbosity: 0.65,
      formality: 0.5,
      creativity: 0.6,
      precision: 0.65,
      persuasiveness: 0.75,
      empathy: 0.85,
      enthusiasm: 0.8,
    };
  }
  
  // Saudações/Casual: Alto empathy, enthusiasm, baixo formality
  if (/sauda[cç][oõ]es|greeting|ol[aá]|oi|boas.vindas|casual/.test(lowercaseName)) {
    return {
      verbosity: 0.5,
      formality: 0.3,
      creativity: 0.6,
      precision: 0.5,
      persuasiveness: 0.6,
      empathy: 0.9,
      enthusiasm: 0.95,
    };
  }
  
  // DEFAULT BALANCED TEMPLATE (applies to ALL unmatched domains)
  // ZERO namespaces sem sliders! Production-ready defaults
  return {
    verbosity: 0.6,
    formality: 0.5,
    creativity: 0.6,
    precision: 0.7,
    persuasiveness: 0.65,
    empathy: 0.7,
    enthusiasm: 0.65,
  };
}

/**
 * ⚡ PRODUCTION-GRADE DETECTION TRIGGERS
 * Gera keywords relevantes para detecção automática (ACCENT-AWARE)
 */
function generateTriggers(name: string): string[] {
  const lowercaseName = name.toLowerCase();
  
  // Turismo/Viagem
  if (/turismo|viagem|viagens|travel|hotel|restaurante/.test(lowercaseName)) {
    return ["turismo", "viagem", "viagens", "travel", "hotel", "passeio", "roteiro", "destino"];
  }
  
  // Tecnologia
  if (/tecnologia|tech|software|programa[cç][aã]o|desenvolvimento/.test(lowercaseName)) {
    return ["tecnologia", "programação", "software", "código", "dev", "API", "tech"];
  }
  
  // Filosofia
  if (/filosofia/.test(lowercaseName)) {
    return ["filosofia", "existência", "significado", "ética", "moral", "pensamento"];
  }
  
  // Finanças
  if (/finan[cç]as|investimento|economia|neg[oó]cio/.test(lowercaseName)) {
    return ["finanças", "investimento", "dinheiro", "economia", "lucro", "renda"];
  }
  
  // Cultura/Arte
  if (/cultura|arte|m[uú]sica|hist[oó]ria/.test(lowercaseName)) {
    return ["cultura", "arte", "música", "expressão", "criatividade", "artista", "história"];
  }
  
  // Filmes/Cinema
  if (/filme|cinema/.test(lowercaseName)) {
    return ["filme", "cinema", "diretor", "ator", "roteiro", "cena", "produção"];
  }
  
  // Saúde
  if (/sa[uú]de|health|medicina|m[eé]dico|tratamento/.test(lowercaseName)) {
    return ["saúde", "medicina", "tratamento", "diagnóstico", "sintoma", "médico"];
  }
  
  // Educação
  if (/educa[cç][aã]o|ensino|escola|universidade/.test(lowercaseName)) {
    return ["educação", "ensino", "escola", "aprendizado", "conhecimento"];
  }
  
  // Comunicação/Social
  if (/comunica[cç][aã]o|social|atendimento|suporte/.test(lowercaseName)) {
    return ["comunicação", "conversa", "atendimento", "suporte", "social"];
  }
  
  // Saudações/Geral
  if (/sauda[cç][oõ]es|greeting|ol[aá]|oi/.test(lowercaseName)) {
    return ["olá", "oi", "bom dia", "boa tarde", "boa noite", "tudo bem"];
  }
  
  // Default: usar nome do namespace como único trigger
  return [name];
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

  // ✅ FIX 2: Batch fetch ALL namespaces ONCE outside the loop (performance optimization + race condition prevention)
  console.log(`[Auto-Creator] 🔍 FIX 2 VERIFICATION: Batch fetching all namespaces ONCE before loop`);
  const allNamespaces = await db.select().from(namespacesTable);
  const namespaceMap = new Map(allNamespaces.map(ns => [ns.name, ns]));
  const namespacesForSimilarity = allNamespaces.map(ns => ({ name: ns.name, description: ns.description || '' }));
  console.log(`[Auto-Creator] ✅ FIX 2: Fetched ${allNamespaces.length} existing namespaces for O(1) lookup`);

  for (const namespaceName of suggestedNamespaces) {
    try {
      // 1. Verificar se namespace já existe (exact match) - usando Map para O(1) lookup
      const existing = namespaceMap.get(namespaceName);

      if (existing) {
        console.log(`[Auto-Creator] ✅ Namespace "${namespaceName}" já existe (ID: ${existing.id})`);
        result.namespacesExisting.push(namespaceName);
        continue;
      }

      // 2. ANÁLISE SEMÂNTICA: Verificar se existe namespace SIMILAR
      const similarNamespaces = await findSimilarNamespaces(
        namespaceName,
        namespacesForSimilarity
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

      // ✅ FIX 2: Use transaction to ensure ATOMIC namespace + agent creation
      // This prevents race conditions where concurrent workers create duplicates
      console.log(`[Auto-Creator] 🆕 Criando namespace "${namespaceName}" em transação atômica...`);
      
      // Detectar se é root ou sub-namespace
      const isSubNamespace = namespaceName.includes('/') || namespaceName.includes('.');
      const description = generateNamespaceDescription(namespaceName, isSubNamespace);
      const icon = selectIconForNamespace(namespaceName);
      const agentSlug = namespaceName.replace(/[\/\.]/g, '-').toLowerCase();
      const agentName = generateAgentName(namespaceName);

      // 🎯 PRODUCTION-GRADE DEFAULTS: Calcular priority, sliders, triggers
      const priority = calculateNamespacePriority(namespaceName);
      const sliderOverrides = generateSliderOverrides(namespaceName);
      const triggers = generateTriggers(namespaceName);
      console.log(`[Auto-Creator] 🎨 Defaults calculados: priority=${priority}, sliders=${sliderOverrides ? 'YES' : 'NO'}, triggers=${triggers.length}`);

      // Check if agent already exists BEFORE starting transaction
      const existingAgent = await db
        .select()
        .from(agentsTable)
        .where(eq(agentsTable.slug, agentSlug))
        .limit(1);

      if (existingAgent.length > 0) {
        console.log(`[Auto-Creator] ⚠️ Agente "${agentSlug}" já existe, pulando criação de namespace`);
        continue;
      }

      // ✅ FIX 2 VERIFICATION: Transaction ensures ATOMIC creation (both or neither)
      console.log(`[Auto-Creator] 🔍 FIX 2: Starting ATOMIC transaction for namespace + agent creation`);
      const transactionResult = await db.transaction(async (tx) => {
        // Create namespace with production-grade defaults (ZERO empty configs!)
        const [newNamespace] = await tx.insert(namespacesTable).values({
          name: namespaceName,
          description,
          icon,
          priority,
          sliderOverrides, // ALWAYS non-null (default balanced template)
          triggers: triggers.length > 0 ? triggers : null,
        }).returning();

        console.log(`[Auto-Creator] ✅ Namespace criado na transação: "${namespaceName}" (ID: ${newNamespace.id})`);

        // Create agent specialist for this namespace
        const systemPrompt = generateSystemPrompt(namespaceName, description);

        const [newAgent] = await tx.insert(agentsTable).values({
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

        console.log(`[Auto-Creator] ✅ Agente criado na transação: "${agentName}" (ID: ${newAgent.id})`);

        return { namespace: newNamespace, agent: newAgent };
      });

      console.log(`[Auto-Creator] ✅ FIX 2 SUCCESS: Transaction committed - both namespace & agent created atomically`);

      // Transaction succeeded - update results
      result.namespacesCreated.push(namespaceName);
      result.agentsCreated.push(agentName);

      // ✅ CRÍTICO: Registrar agente no agentRegistry para MoE Router (outside transaction)
      // Sem isso, o agente não é detectado pelo MoE Router até restart do servidor!
      try {
        const { agentRegistry } = await import("../agent/registry");
        const { registerAgent: registerAgentRuntime } = await import("../agent/runtime");
        const { agentsStorage } = await import("../storage.agents");
        
        // Buscar tools do agente (seguindo padrão do loader.ts)
        const agentTools = await agentsStorage.getAgentTools(transactionResult.agent.id);
        const toolNames = agentTools.map((t: any) => t.name);
        
        // Construir objeto Agent seguindo EXATAMENTE o padrão do loader.ts
        const agentForRegistry = {
          id: transactionResult.agent.id,
          name: transactionResult.agent.name,
          slug: transactionResult.agent.slug,
          type: (transactionResult.agent.type || "specialist") as "specialist" | "generalist" | "router-only",
          agentTier: (transactionResult.agent.agentTier as "agent" | "subagent" | undefined) || undefined,
          assignedNamespaces: transactionResult.agent.assignedNamespaces || [],
          description: transactionResult.agent.description || undefined,
          systemPrompt: transactionResult.agent.systemPrompt || undefined,
          ragNamespaces: transactionResult.agent.ragNamespaces || [],
          allowedTools: toolNames,
          policy: transactionResult.agent.policy || {},
          budgetLimit: transactionResult.agent.budgetLimit || undefined,
          escalationAgent: transactionResult.agent.escalationAgent || undefined,
          inferenceConfig: transactionResult.agent.inferenceConfig || {},
          metadata: (transactionResult.agent.metadata || {}) as Record<string, unknown>,
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
