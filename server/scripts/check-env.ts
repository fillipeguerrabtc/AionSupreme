import { validateEnv } from "../config/env";

try {
  validateEnv();
} catch (error) {
  console.error("\n❌ ERRO FATAL: Validação de variáveis de ambiente falhou");
  console.error(error);
  process.exit(1);
}
