/**
 * I18N EXTRACTION SCRIPT - Google Auth Dialog
 * ============================================
 * 
 * Extracts hardcoded Portuguese strings from GoogleAuthDialog.tsx
 * and generates a structured JSON file for translation.
 * 
 * USAGE:
 *   npx tsx scripts/extract-i18n-google-auth.ts
 * 
 * OUTPUT:
 *   scripts/googleAuthDialog-i18n.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hardcoded string extraction from GoogleAuthDialog.tsx
// This is manual extraction for accuracy (AST parsing would be overkill for one-time use)

interface I18nEntry {
  key: string;
  ptBR: string;
  enUS: string;
  esES: string;
  context?: string;
}

const googleAuthDialogStrings: I18nEntry[] = [
  // Dialog Header
  { key: 'dialog.trigger', ptBR: 'Conectar Conta Google', enUS: '', esES: '', context: 'Button text' },
  { key: 'dialog.title', ptBR: 'Autenticação Google - Kaggle & Colab', enUS: '', esES: '', context: 'Dialog title' },
  { key: 'dialog.description', ptBR: 'Configure acesso seguro às plataformas de GPU com criptografia AES-256-GCM', enUS: '', esES: '', context: 'Dialog description' },

  // Tabs
  { key: 'tabs.instructions', ptBR: '1. Instruções', enUS: '', esES: '', context: 'Tab label' },
  { key: 'tabs.kaggle', ptBR: '2. Kaggle', enUS: '', esES: '', context: 'Tab label' },
  { key: 'tabs.colab', ptBR: '3. Colab', enUS: '', esES: '', context: 'Tab label' },

  // Instructions Tab
  { key: 'instructions.howItWorks.title', ptBR: 'Como funciona', enUS: '', esES: '', context: 'Alert title' },
  { key: 'instructions.howItWorks.description', ptBR: 'Você fará login manualmente UMA VEZ no Google. Depois, copiaremos os cookies de autenticação e os salvaremos de forma criptografada. O sistema fará scraping automático das quotas a cada 10 minutos, sem precisar de login novamente por ~30 dias.', enUS: '', esES: '', context: 'Alert description' },
  { key: 'instructions.prerequisites.title', ptBR: 'Pré-requisitos', enUS: '', esES: '', context: 'Section title' },
  { key: 'instructions.prerequisites.chrome', ptBR: 'Navegador Google Chrome (recomendado para compatibilidade)', enUS: '', esES: '', context: 'List item' },
  { key: 'instructions.prerequisites.account', ptBR: 'Conta Google com acesso ao Kaggle e/ou Google Colab', enUS: '', esES: '', context: 'List item' },
  { key: 'instructions.prerequisites.devtools', ptBR: 'DevTools aberto (F12) para copiar cookies', enUS: '', esES: '', context: 'List item' },
  { key: 'instructions.security.title', ptBR: 'Segurança', enUS: '', esES: '', context: 'Section title' },
  { key: 'instructions.security.encryption', ptBR: 'Cookies criptografados com AES-256-GCM usando SESSION_SECRET', enUS: '', esES: '', context: 'List item' },
  { key: 'instructions.security.noPlaintext', ptBR: 'Nenhum cookie armazenado em texto plano', enUS: '', esES: '', context: 'List item' },
  { key: 'instructions.security.autoValidation', ptBR: 'Validação automática a cada sync (10min)', enUS: '', esES: '', context: 'List item' },
  { key: 'instructions.security.expiration', ptBR: 'Expiração após 30 dias (com avisos antecipados)', enUS: '', esES: '', context: 'List item' },
  { key: 'instructions.warning.title', ptBR: '⚠️ IMPORTANTE - Risco de BAN', enUS: '', esES: '', context: 'Alert title' },
  { key: 'instructions.warning.kaggle', ptBR: '<strong>Kaggle:</strong> Max 8.4h/sessão, 21h/semana. Violação = BAN PERMANENTE.', enUS: '', esES: '', context: 'Warning text' },
  { key: 'instructions.warning.colab', ptBR: '<strong>Colab:</strong> Max 8.4h/sessão, 36h cooldown. Violação = BAN PERMANENTE.', enUS: '', esES: '', context: 'Warning text' },
  { key: 'instructions.warning.auto', ptBR: 'O sistema respeita automaticamente esses limites via quota scraping.', enUS: '', esES: '', context: 'Warning text' },
  { key: 'instructions.buttons.kaggle', ptBR: 'Conectar Kaggle', enUS: '', esES: '', context: 'Button text' },
  { key: 'instructions.buttons.colab', ptBR: 'Conectar Colab', enUS: '', esES: '', context: 'Button text' },

  // Kaggle Tab
  { key: 'kaggle.title', ptBR: 'Passo a passo - Kaggle', enUS: '', esES: '', context: 'Alert title' },
  { key: 'kaggle.step1', ptBR: 'Abra www.kaggle.com em nova aba', enUS: '', esES: '', context: 'Step text' },
  { key: 'kaggle.step2', ptBR: 'Faça login com sua conta Google', enUS: '', esES: '', context: 'Step text' },
  { key: 'kaggle.step3', ptBR: 'Abra DevTools (F12) → Console → Cole o comando abaixo', enUS: '', esES: '', context: 'Step text' },
  { key: 'kaggle.step4', ptBR: 'Copie o resultado e cole no campo "Cookies" abaixo', enUS: '', esES: '', context: 'Step text' },
  { key: 'kaggle.cookieCommand.label', ptBR: 'Comando para copiar cookies (Cole no Console do DevTools):', enUS: '', esES: '', context: 'Label text' },
  { key: 'kaggle.email.label', ptBR: 'Email da conta Google', enUS: '', esES: '', context: 'Label text' },
  { key: 'kaggle.email.placeholder', ptBR: 'seu-email@gmail.com', enUS: '', esES: '', context: 'Placeholder text' },
  { key: 'kaggle.cookies.label', ptBR: 'Cookies (Cole o resultado do Console)', enUS: '', esES: '', context: 'Label text' },
  { key: 'kaggle.cookies.placeholder', ptBR: 'KAGGLE_KEY=value; KAGGLE_USER_ID=123; ...', enUS: '', esES: '', context: 'Placeholder text' },
  { key: 'kaggle.cookies.hint', ptBR: 'Formato esperado: name1=value1; name2=value2; ...', enUS: '', esES: '', context: 'Hint text' },
  { key: 'kaggle.buttons.back', ptBR: 'Voltar', enUS: '', esES: '', context: 'Button text' },
  { key: 'kaggle.buttons.save', ptBR: 'Salvar Kaggle', enUS: '', esES: '', context: 'Button text' },
  { key: 'kaggle.buttons.saving', ptBR: 'Salvando...', enUS: '', esES: '', context: 'Button text (loading)' },

  // Colab Tab
  { key: 'colab.title', ptBR: 'Passo a passo - Google Colab', enUS: '', esES: '', context: 'Alert title' },
  { key: 'colab.step1', ptBR: 'Abra colab.research.google.com em nova aba', enUS: '', esES: '', context: 'Step text' },
  { key: 'colab.step2', ptBR: 'Faça login com sua conta Google', enUS: '', esES: '', context: 'Step text' },
  { key: 'colab.step3', ptBR: 'Abra DevTools (F12) → Console → Cole o comando abaixo', enUS: '', esES: '', context: 'Step text' },
  { key: 'colab.step4', ptBR: 'Copie o resultado e cole no campo "Cookies" abaixo', enUS: '', esES: '', context: 'Step text' },
  { key: 'colab.cookieCommand.label', ptBR: 'Comando para copiar cookies (Cole no Console do DevTools):', enUS: '', esES: '', context: 'Label text' },
  { key: 'colab.email.label', ptBR: 'Email da conta Google', enUS: '', esES: '', context: 'Label text' },
  { key: 'colab.email.placeholder', ptBR: 'seu-email@gmail.com', enUS: '', esES: '', context: 'Placeholder text' },
  { key: 'colab.cookies.label', ptBR: 'Cookies (Cole o resultado do Console)', enUS: '', esES: '', context: 'Label text' },
  { key: 'colab.cookies.placeholder', ptBR: 'GOOGLE_SESSION=value; GOOGLE_USER=123; ...', enUS: '', esES: '', context: 'Placeholder text' },
  { key: 'colab.cookies.hint', ptBR: 'Formato esperado: name1=value1; name2=value2; ...', enUS: '', esES: '', context: 'Hint text' },
  { key: 'colab.buttons.back', ptBR: 'Voltar', enUS: '', esES: '', context: 'Button text' },
  { key: 'colab.buttons.save', ptBR: 'Salvar Colab', enUS: '', esES: '', context: 'Button text' },
  { key: 'colab.buttons.saving', ptBR: 'Salvando...', enUS: '', esES: '', context: 'Button text (loading)' },

  // Toast Messages
  { key: 'toasts.saveSuccess.title', ptBR: '✅ Autenticação salva', enUS: '', esES: '', context: 'Success toast title' },
  { key: 'toasts.saveSuccess.descriptionTemplate', ptBR: 'Cookies do {{provider}} salvos com sucesso para {{email}}', enUS: '', esES: '', context: 'Success toast description (uses formatTemplate)' },
  { key: 'toasts.saveError.title', ptBR: '❌ Erro ao salvar autenticação', enUS: '', esES: '', context: 'Error toast title' },
  { key: 'toasts.copied.title', ptBR: '✅ Copiado!', enUS: '', esES: '', context: 'Success toast title' },
  { key: 'toasts.copied.description', ptBR: 'Comando copiado para área de transferência', enUS: '', esES: '', context: 'Success toast description' },

  // Validation Errors
  { key: 'errors.emailRequired.title', ptBR: 'Email obrigatório', enUS: '', esES: '', context: 'Error toast title' },
  { key: 'errors.emailRequired.description', ptBR: 'Por favor, informe o email da sua conta Google', enUS: '', esES: '', context: 'Error toast description' },
  { key: 'errors.cookiesRequired.title', ptBR: 'Cookies obrigatórios', enUS: '', esES: '', context: 'Error toast title' },
  { key: 'errors.cookiesRequired.description', ptBR: 'Por favor, cole os cookies copiados do navegador', enUS: '', esES: '', context: 'Error toast description' },
  { key: 'errors.cookiesInvalid.title', ptBR: 'Cookies inválidos', enUS: '', esES: '', context: 'Error toast title' },
  { key: 'errors.cookiesInvalid.description', ptBR: 'Não foi possível extrair cookies válidos do texto colado', enUS: '', esES: '', context: 'Error toast description' },
  { key: 'errors.processingError.title', ptBR: 'Erro ao processar cookies', enUS: '', esES: '', context: 'Error toast title' },
  { key: 'errors.processingError.fallback', ptBR: 'Formato inválido', enUS: '', esES: '', context: 'Error fallback message' },

  // Provider names (for template interpolation)
  { key: 'providers.kaggle', ptBR: 'Kaggle', enUS: 'Kaggle', esES: 'Kaggle', context: 'Provider name' },
  { key: 'providers.colab', ptBR: 'Colab', enUS: 'Colab', esES: 'Colab', context: 'Provider name' },
];

// Generate JSON output
const outputPath = path.join(__dirname, 'googleAuthDialog-i18n.json');
const jsonOutput = JSON.stringify(googleAuthDialogStrings, null, 2);

fs.writeFileSync(outputPath, jsonOutput, 'utf-8');

console.log(`✅ Extracted ${googleAuthDialogStrings.length} strings to ${outputPath}`);
console.log('\n📋 NEXT STEPS:');
console.log('1. Fill in enUS and esES translations in the JSON file');
console.log('2. Run: npx tsx scripts/generate-i18n-google-auth.ts');
console.log('3. Review and apply the generated TypeScript to client/src/lib/i18n.tsx');
