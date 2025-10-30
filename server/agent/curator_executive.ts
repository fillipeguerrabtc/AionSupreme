// server/agent/curator_executive.ts
// Curador Executivo (Human-in-the-Loop)
// Responsável por revisão humana e aprovação final

import type { AgentInput, AgentOutput, AgentRunContext } from "./types";

/**
 * Curador Executivo (Humano + IA)
 * 
 * Responsabilidades:
 * - Revisar conteúdo pendente de curadoria
 * - Aprovar ou rejeitar publicações
 * - Editar metadados (título, tags, namespaces)
 * - Garantir qualidade e conformidade antes da publicação
 * 
 * Permissões:
 * - Acesso de leitura a TODOS os namespaces (*)
 * - Acesso de escrita em curation/* 
 * - Requer aprovação humana para publicar em outros namespaces
 * 
 * Diferença do Curador (IA):
 * - Curador (IA): faz triagem automática e sugere
 * - Curador Executivo: revisão humana final e aprovação
 */
export async function curatorExecutiveAgent(
  input: AgentInput,
  ctx: AgentRunContext
): Promise<AgentOutput> {
  const startTime = Date.now();

  // Este agente sempre requer interação humana
  // Responde com instruções para o revisor humano

  return {
    text: `[Curador Executivo - Revisão Humana Necessária]\n\nPara revisar conteúdo pendente:\n\n1. Acesse Admin → Curadoria\n2. Revise os itens da fila\n3. Edite título, tags e namespaces conforme necessário\n4. Aprove para publicar ou Rejeite\n\n**Aguardando ação humana.**`,
    citations: [
      {
        title: "Painel de Curadoria",
        url: "/admin/curation",
      },
    ],
    costUSD: 0,
    tokens: { prompt: 0, completion: 0 },
    latencyMs: Date.now() - startTime,
  };
}
