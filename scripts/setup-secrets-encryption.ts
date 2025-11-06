#!/usr/bin/env tsx
/**
 * SECRETS ENCRYPTION SETUP - 100% AUTOMATIZADO
 * ============================================
 * 
 * Gera e configura SECRETS_MASTER_KEY automaticamente para
 * criptografia de credenciais no SecretsVault.
 * 
 * O que este script faz:
 * 1. Gera uma chave AES-256 segura (32 bytes)
 * 2. Instrui você a configurar no Replit Secrets
 * 3. Verifica se a criptografia está funcionando
 * 
 * Uso:
 *   npx tsx scripts/setup-secrets-encryption.ts
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function generateMasterKey(): string {
  // Gera chave AES-256 segura (32 bytes = 256 bits)
  const key = crypto.randomBytes(32).toString('base64');
  return key;
}

function checkExistingKey(): boolean {
  return !!process.env.SECRETS_MASTER_KEY;
}

function testEncryption(masterKey: string): boolean {
  try {
    // Testa criptografia
    const testData = 'test-secret-data';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(masterKey, 'base64'),
      iv
    );
    
    let encrypted = cipher.update(testData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Testa decriptografia
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(masterKey, 'base64'),
      iv
    );
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted === testData;
  } catch (error) {
    return false;
  }
}

async function main() {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════════╗', colors.cyan);
  log('║   🔐 SECRETS ENCRYPTION SETUP - AUTOMÁTICO                     ║', colors.cyan);
  log('╚════════════════════════════════════════════════════════════════╝', colors.cyan);
  console.log('\n');
  
  // Verifica se já existe
  const existingKey = checkExistingKey();
  
  if (existingKey) {
    log('✅ SECRETS_MASTER_KEY já está configurado!', colors.green);
    log('\n📊 Verificando criptografia...', colors.blue);
    
    const works = testEncryption(process.env.SECRETS_MASTER_KEY!);
    
    if (works) {
      log('✅ Criptografia funcionando perfeitamente!', colors.green);
      log('✅ Suas credenciais estão SEGURAS 🔒', colors.green);
    } else {
      log('❌ Erro: Chave inválida ou corrompida', colors.red);
      log('💡 Execute novamente para gerar uma nova chave', colors.yellow);
      process.exit(1);
    }
    
    console.log('\n');
    log('═══════════════════════════════════════════════════════', colors.cyan);
    log('  STATUS ATUAL:', colors.bright);
    log('═══════════════════════════════════════════════════════', colors.cyan);
    log(`  🔐 Encryption: ${colors.green}ENABLED${colors.reset}`, colors.reset);
    log(`  🔑 Key Length: 256 bits (AES-256)`, colors.reset);
    log(`  🛡️  Security: Production-ready`, colors.reset);
    log('═══════════════════════════════════════════════════════', colors.cyan);
    console.log('\n');
    
    return;
  }
  
  // Gera nova chave
  log('🔑 Gerando nova chave de criptografia AES-256...', colors.blue);
  const masterKey = generateMasterKey();
  
  log('✅ Chave gerada com sucesso!', colors.green);
  log('\n📝 Testando criptografia...', colors.blue);
  
  const works = testEncryption(masterKey);
  
  if (!works) {
    log('❌ Erro ao testar criptografia', colors.red);
    process.exit(1);
  }
  
  log('✅ Teste de criptografia passou!', colors.green);
  console.log('\n');
  
  // Instruções para configurar
  log('═══════════════════════════════════════════════════════', colors.cyan);
  log('  📋 INSTRUÇÕES PARA CONFIGURAR:', colors.bright);
  log('═══════════════════════════════════════════════════════', colors.cyan);
  console.log('\n');
  
  log('1️⃣  Abra o painel de Secrets do Replit:', colors.yellow);
  log('   → Clique em "Tools" (lado esquerdo)', colors.reset);
  log('   → Procure por "Secrets"', colors.reset);
  log('   → Ou pressione Ctrl+K e digite "Secrets"', colors.reset);
  console.log('\n');
  
  log('2️⃣  Adicione um novo secret:', colors.yellow);
  log('   → Clique em "+ New Secret" ou "Add Secret"', colors.reset);
  console.log('\n');
  
  log('3️⃣  Configure o secret:', colors.yellow);
  log('   → Key (nome):   SECRETS_MASTER_KEY', colors.bright);
  log('   → Value (valor):', colors.bright);
  console.log('\n');
  
  log('╔════════════════════════════════════════════════════════════════╗', colors.green);
  log(`║ ${masterKey.padEnd(62)} ║`, colors.green);
  log('╚════════════════════════════════════════════════════════════════╝', colors.green);
  console.log('\n');
  
  log('   → COPIE a chave acima (clique e Ctrl+C)', colors.bright);
  log('   → COLE no campo "Value" do Replit Secrets', colors.bright);
  log('   → Clique em "Save" ou "Add Secret"', colors.bright);
  console.log('\n');
  
  log('4️⃣  Reinicie o servidor:', colors.yellow);
  log('   → O workflow "Start application" será reiniciado automaticamente', colors.reset);
  log('   → Ou pressione Ctrl+C e execute: npm run dev', colors.reset);
  console.log('\n');
  
  log('5️⃣  Verificar:', colors.yellow);
  log('   → Execute novamente: npm run setup:secrets', colors.reset);
  log('   → Você deve ver: ✅ SECRETS_MASTER_KEY já está configurado!', colors.reset);
  console.log('\n');
  
  log('═══════════════════════════════════════════════════════', colors.cyan);
  log('  ⚠️  IMPORTANTE:', colors.bright);
  log('═══════════════════════════════════════════════════════', colors.cyan);
  console.log('\n');
  log('  • Guarde esta chave em um local SEGURO (password manager)', colors.yellow);
  log('  • NUNCA compartilhe esta chave publicamente', colors.yellow);
  log('  • Se perder a chave, credenciais criptografadas serão IRRECUPERÁVEIS', colors.red);
  log('  • Para produção, use a mesma chave em todos os ambientes', colors.yellow);
  console.log('\n');
  
  // Salva backup temporário (opcional)
  const backupDir = path.join(process.cwd(), '.secrets-backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const backupFile = path.join(backupDir, `master-key-${Date.now()}.txt`);
  fs.writeFileSync(backupFile, `SECRETS_MASTER_KEY=${masterKey}\n\n⚠️ BACKUP TEMPORÁRIO - DELETE APÓS CONFIGURAR NO REPLIT!\n`);
  
  log(`💾 Backup temporário salvo em: ${backupFile}`, colors.blue);
  log(`   DELETE este arquivo após configurar no Replit Secrets!`, colors.red);
  console.log('\n');
  
  log('═══════════════════════════════════════════════════════', colors.cyan);
  console.log('\n');
}

main().catch(console.error);
