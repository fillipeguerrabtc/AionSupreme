import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';

interface TranslationPayload {
  [key: string]: string | TranslationPayload;
}

interface LanguageClassification {
  key: string;
  value: string;
  detectedLang: 'pt' | 'en' | 'es' | 'mixed' | 'unknown';
  confidence: number;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function setNestedValue(obj: any, path: string, value: string): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }

  current[keys[keys.length - 1]] = value;
}

async function convertBatchToPortuguese(texts: string[]): Promise<string[]> {
  const DELIMITER = '|||';
  const textsWithDelimiter = texts.map(t => t.replace(/\n/g, '<NEWLINE>'));
  
  const prompt = `You are a professional translator converting ANY text to AUTHENTIC Brazilian Portuguese (PT-BR).

CRITICAL RULES:
1. ALWAYS output in Brazilian Portuguese - never English, Spanish, or any other language
2. Preserve interpolation variables EXACTLY: {variable}, {{variable}}, {0}, $\{var}, etc.
3. Preserve <NEWLINE> markers EXACTLY as they appear - do NOT convert them
4. For technical English terms commonly used in PT-BR tech (like "API", "token", "dataset", "DB"), keep them in English
5. Use clear, natural Brazilian Portuguese for error messages
6. Return ONLY the translations, separated by "${DELIMITER}", in EXACT order
7. Do NOT add explanations, numbering, or extra text

EXAMPLES:
Input: "Failed to provision worker"
Output: "Falhou ao provisionar worker"

Input: "Error<NEWLINE>Please try again"
Output: "Erro<NEWLINE>Por favor, tente novamente"

Input: "Password must be at least 8 characters long"
Output: "A senha deve ter pelo menos 8 caracteres"

Texts to convert (separated by ${DELIMITER}):
${textsWithDelimiter.join(DELIMITER)}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a professional translator converting technical software strings to authentic Brazilian Portuguese. Output in PT-BR for every string. Preserve <NEWLINE> markers exactly.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.3,
    max_tokens: 4000,
  });

  const translatedText = response.choices[0]?.message?.content || '';
  const translations = translatedText
    .split(DELIMITER)
    .map(line => line.trim())
    .map(line => line.replace(/<NEWLINE>/g, '\n'));

  if (translations.length !== texts.length) {
    throw new Error(`Count mismatch: expected ${texts.length}, got ${translations.length}`);
  }

  return translations;
}

async function main() {
  console.log('🧹 AION Contamination Remediation');
  console.log('==================================\n');

  // Load inventory
  const inventoryPath = path.resolve(process.cwd(), 'scripts/i18n/language-inventory.json');
  const inventoryContent = await fs.readFile(inventoryPath, 'utf-8');
  const inventory: { classifications: LanguageClassification[] } = JSON.parse(inventoryContent);

  // Filter contaminated strings (EN/ES/Mixed)
  const contaminated = inventory.classifications.filter(
    c => c.detectedLang === 'en' || c.detectedLang === 'es' || c.detectedLang === 'mixed'
  );

  console.log(`📊 Found ${contaminated.length} contaminated strings:\n`);
  console.log(`   🇺🇸 English: ${inventory.classifications.filter(c => c.detectedLang === 'en').length}`);
  console.log(`   🇪🇸 Spanish: ${inventory.classifications.filter(c => c.detectedLang === 'es').length}`);
  console.log(`   🌐 Mixed: ${inventory.classifications.filter(c => c.detectedLang === 'mixed').length}\n`);

  // Load pt-BR.json
  const ptBRPath = path.resolve(process.cwd(), 'client/src/locales/pt-BR.json');
  const ptBRContent = await fs.readFile(ptBRPath, 'utf-8');
  const ptBR: TranslationPayload = JSON.parse(ptBRContent);

  // Backup
  const backupPath = path.resolve(process.cwd(), 'client/src/locales/pt-BR.json.backup-remediation');
  await fs.writeFile(backupPath, ptBRContent, 'utf-8');
  console.log(`💾 Backup created: pt-BR.json.backup-remediation\n`);

  // Process in small batches (10 strings)
  const BATCH_SIZE = 10;
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < contaminated.length; i += BATCH_SIZE) {
    const batch = contaminated.slice(i, Math.min(i + BATCH_SIZE, contaminated.length));
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(contaminated.length / BATCH_SIZE);

    console.log(`🔄 Batch ${batchNumber}/${totalBatches} (${batch.length} strings)...`);

    try {
      const converted = await convertBatchToPortuguese(batch.map(c => c.value));

      // Update pt-BR.json
      for (let j = 0; j < batch.length; j++) {
        setNestedValue(ptBR, batch[j].key, converted[j]);
      }

      console.log(`   ✅ Batch ${batchNumber} remediated successfully`);
      successCount += batch.length;

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error: any) {
      console.error(`   ❌ Batch ${batchNumber} failed: ${error.message}`);
      failedCount += batch.length;
    }
  }

  // Save updated pt-BR.json
  await fs.writeFile(ptBRPath, JSON.stringify(ptBR, null, 2) + '\n', 'utf-8');

  console.log('\n📊 REMEDIATION SUMMARY:');
  console.log(`   ✅ Remediated: ${successCount} strings`);
  console.log(`   ❌ Failed: ${failedCount} strings\n`);

  if (failedCount === 0) {
    console.log('🎉 All contamination remediated!');
    console.log('📋 Next: Run inventory-source-language.ts to verify <1% contamination\n');
  } else {
    console.log('⚠️  Some strings failed - manual review needed\n');
  }
}

main().catch(console.error);
