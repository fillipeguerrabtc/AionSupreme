// server/utils/slug-generator.ts
import { db } from "../db";
import { agents } from "../../shared/schema";
import { eq } from "drizzle-orm";

/**
 * Normaliza texto para slug (kebab-case, sem acentos)
 * 
 * @example
 * normalizeToSlug("Coordenador Financeiro") → "coordenador-financeiro"
 * normalizeToSlug("Análise de Dados") → "analise-de-dados"
 * normalizeToSlug("Tech & AI") → "tech-ai"
 */
function normalizeToSlug(text: string): string {
  return text
    .normalize("NFD") // Decompor caracteres acentuados
    .replace(/[\u0300-\u036f]/g, "") // Remover diacríticos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Remover caracteres especiais (exceto espaços e hífen)
    .replace(/\s+/g, "-") // Substituir espaços por hífen
    .replace(/-+/g, "-") // Remover hífens duplicados
    .replace(/^-|-$/g, ""); // Remover hífens das extremidades
}

/**
 * Gera slug único a partir do nome do agente
 * Se slug já existe, adiciona sufixo numérico (-2, -3, etc)
 * 
 * @param name - Nome do agente (ex: "Coordenador Financeiro")
 * @param excludeId - ID do agente a excluir da verificação (usado em updates)
 * @returns Slug único garantido
 * 
 * @example
 * // Primeira vez
 * await generateUniqueSlug("Coordenador Financeiro") → "coordenador-financeiro"
 * 
 * // Se já existir, adiciona sufixo
 * await generateUniqueSlug("Coordenador Financeiro") → "coordenador-financeiro-2"
 */
export async function generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
  const baseSlug = normalizeToSlug(name);
  
  if (!baseSlug) {
    throw new Error("Nome do agente inválido - não foi possível gerar slug");
  }

  let slug = baseSlug;
  let counter = 2;
  let isUnique = false;

  while (!isUnique) {
    // Verificar se slug já existe
    const existing = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.slug, slug))
      .limit(1);

    // Se não existe, ou é o próprio agente sendo atualizado, é único
    if (existing.length === 0 || (excludeId && existing[0].id === excludeId)) {
      isUnique = true;
    } else {
      // Adicionar sufixo numérico
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Proteção contra loop infinito (improvável, mas seguro)
    if (counter > 1000) {
      throw new Error("Não foi possível gerar slug único após 1000 tentativas");
    }
  }

  return slug;
}

/**
 * Valida se um slug está disponível
 * 
 * @param slug - Slug a validar
 * @param excludeId - ID do agente a excluir da verificação (usado em updates)
 * @returns true se slug está disponível
 */
export async function isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
  const existing = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  return existing.length === 0 || (excludeId !== undefined && existing[0].id === excludeId);
}
