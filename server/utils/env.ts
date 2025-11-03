/**
 * 🔑 FASE 1 - ENV Padronizada
 * Helper centralizado para acessar variáveis de ambiente com aliases para retrocompatibilidade.
 * 
 * Problema: Código usa nomes inconsistentes (OPEN_ROUTER_API_KEY vs OPENROUTER_API_KEY)
 * Solução: Função env() que busca em múltiplos aliases automaticamente
 */

/**
 * Busca variável de ambiente com suporte a aliases
 * @param name Nome principal da variável
 * @param aliases Aliases alternativos (para retrocompatibilidade)
 * @param defaultValue Valor padrão se não encontrada
 * @returns Valor da variável de ambiente
 */
export function env(name: string, aliases: string[] = [], defaultValue: string = ""): string {
  // Tentar nome principal primeiro
  if (process.env[name]) {
    return process.env[name]!;
  }

  // Tentar aliases na ordem
  for (const alias of aliases) {
    if (process.env[alias]) {
      return process.env[alias]!;
    }
  }

  // Retornar default se não encontrou
  return defaultValue;
}

/**
 * Constantes de ENV padronizadas para uso em todo o sistema
 * Centraliza acesso e garante consistência
 */
export const ENV = {
  // OpenRouter (aceita ambos os formatos)
  OPENROUTER_API_KEY: env("OPENROUTER_API_KEY", ["OPEN_ROUTER_API_KEY"]),
  
  // Groq
  GROQ_API_KEY: env("GROQ_API_KEY"),
  
  // Google/Gemini (aceita ambos os formatos)
  GOOGLE_API_KEY: env("GOOGLE_API_KEY", ["GEMINI_API_KEY"]),
  
  // HuggingFace (aceita ambos os formatos)
  HF_API_KEY: env("HF_API_KEY", ["HUGGINGFACE_API_KEY"]),
  
  // OpenAI
  OPENAI_API_KEY: env("OPENAI_API_KEY"),
  OPENAI_ADMIN_KEY: env("OPENAI_ADMIN_KEY"),
  
  // Database
  DATABASE_URL: env("DATABASE_URL"),
  
  // Session
  SESSION_SECRET: env("SESSION_SECRET"),
  
  // Logging
  LOG_LEVEL: env("LOG_LEVEL", [], "info"),
  
  // Node environment
  NODE_ENV: env("NODE_ENV", [], "development"),
  
  // Server
  PORT: env("PORT", [], "5000"),
  
  // CORS
  CORS_ORIGIN: env("CORS_ORIGIN", [], "*"),
  
  // Vector Store
  VECTOR_SNAPSHOT_PATH: env("VECTOR_SNAPSHOT_PATH", [], "./data/vectorstore.snapshot.json"),
} as const;
