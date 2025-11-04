/**
 * Fail-fast ENV validation
 * Verifica variáveis de ambiente OBRIGATÓRIAS no boot do servidor.
 * Se alguma estiver faltando, o processo morre IMEDIATAMENTE com mensagem clara.
 * 
 * Isso previne o servidor subir "meia-boca" e falhar silenciosamente depois.
 */


const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "SESSION_SECRET",
];

const OPTIONAL_BUT_RECOMMENDED_ENV_VARS = [
  "OPENAI_API_KEY",
];

function checkEnv() {
  const missing: string[] = [];
  const recommended: string[] = [];

  // Verificar variáveis obrigatórias
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  // Verificar variáveis recomendadas
  for (const key of OPTIONAL_BUT_RECOMMENDED_ENV_VARS) {
    if (!process.env[key]) {
      recommended.push(key);
    }
  }

  // Se falta alguma obrigatória, FALHA IMEDIATAMENTE
  if (missing.length > 0) {
    console.error("\n❌ ERRO FATAL: Variáveis de ambiente obrigatórias faltando:");
    console.error(missing.map(k => `   - ${k}`).join("\n"));
    console.error("\n💡 Configure essas variáveis no arquivo .env ou nas variáveis de ambiente do Replit.\n");
    process.exit(1);
  }

  // Se falta alguma recomendada, apenas avisa (WARNING)
  if (recommended.length > 0) {
    console.warn("\n⚠️  AVISO: Variáveis de ambiente recomendadas faltando:");
    console.warn(recommended.map(k => `   - ${k}`).join("\n"));
    console.warn("   O sistema funcionará em modo limitado sem essas variáveis.\n");
  }

  // Tudo OK
  console.log("✅ ENV Check OK - Todas as variáveis obrigatórias configuradas");
}

// Executar verificação IMEDIATAMENTE quando o módulo é importado
checkEnv();
