import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';

interface TranslationPayload {
  [key: string]: string | TranslationPayload;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function flattenObject(obj: TranslationPayload, prefix = ''): Promise<Record<string, string>> {
  const flattened: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'string') {
      flattened[newKey] = value;
    } else {
      Object.assign(flattened, await flattenObject(value, newKey));
    }
  }
  
  return flattened;
}

async function convertBatchToPortuguese(texts: string[]): Promise<string[]> {
  const DELIMITER = '|||';
  const textsWithDelimiter = texts.map(t => t.replace(/\n/g, '<NEWLINE>'));
  
  const prompt = `You are a professional translator converting ANY text to AUTHENTIC Brazilian Portuguese (PT-BR).

CRITICAL RULES:
1. ALWAYS output in Brazilian Portuguese - never English, Spanish, or any other language
2. Preserve interpolation variables EXACTLY: {variable}, {{variable}}, {0}, $\{var}, etc.
3. Preserve <NEWLINE> markers EXACTLY as they appear - do NOT convert them
4. For technical English terms commonly used in PT-BR tech (like "API", "token", "dataset"), keep them in English
5. For permission codes (like "agents:list:read"), translate to Portuguese (like "agentes:listar:ler")
6. Use clear, natural Brazilian Portuguese for error messages
7. Return ONLY the translations, separated by "${DELIMITER}", in EXACT order
8. Do NOT add explanations, numbering, or extra text

EXAMPLES:
Input: "Failed to provision worker"
Output: "Falhou ao provisionar worker"

Input: "agents:list:read"
Output: "agentes:listar:ler"

Input: "Error<NEWLINE>Please try again"
Output: "Erro<NEWLINE>Por favor, tente novamente"

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
  console.log('🧪 BATCH 15 TEST (indices 280-299)');
  console.log('===================================\n');

  const ptBRPath = path.resolve(process.cwd(), 'client/src/locales/pt-BR.json');
  const ptBRContent = await fs.readFile(ptBRPath, 'utf-8');
  const ptBR: TranslationPayload = JSON.parse(ptBRContent);

  const flattenedPtBR = await flattenObject(ptBR);
  const keys = Object.keys(flattenedPtBR);
  const values = Object.values(flattenedPtBR);

  // Extract batch 15 (indices 280-299)
  const batchKeys = keys.slice(280, 300);
  const batchValues = values.slice(280, 300);

  console.log('Sample strings (first 5):');
  for (let i = 0; i < Math.min(5, batchValues.length); i++) {
    const preview = batchValues[i].replace(/\n/g, '\\n').substring(0, 80);
    console.log(`   ${i + 1}. ${batchKeys[i]}`);
    console.log(`      "${preview}${batchValues[i].length > 80 ? '...' : ''}"`);
  }
  console.log('');

  console.log(`🔄 Converting ${batchValues.length} strings...\n`);
  
  try {
    const converted = await convertBatchToPortuguese(batchValues);
    
    console.log('✅ BATCH 15 TEST PASSED!\n');
    console.log('Sample conversions (all 20):');
    for (let i = 0; i < converted.length; i++) {
      const originalPreview = batchValues[i].replace(/\n/g, '\\n').substring(0, 60);
      const convertedPreview = converted[i].replace(/\n/g, '\\n').substring(0, 60);
      console.log(`   ${i + 1}. ${batchKeys[i]}`);
      console.log(`      BEFORE: "${originalPreview}${batchValues[i].length > 60 ? '...' : ''}"`);
      console.log(`      AFTER:  "${convertedPreview}${converted[i].length > 60 ? '...' : ''}"`);
      console.log('');
    }

    // Verify multi-line string (index 17 = invalid_kaggle_credentials_please)
    const multilineIndex = batchKeys.findIndex(k => k.includes('invalid_kaggle_credentials_please'));
    if (multilineIndex >= 0) {
      console.log('🔍 MULTI-LINE STRING VERIFICATION:');
      console.log(`   Key: ${batchKeys[multilineIndex]}`);
      console.log(`   BEFORE lines: ${batchValues[multilineIndex].split('\n').length}`);
      console.log(`   AFTER lines: ${converted[multilineIndex].split('\n').length}`);
      console.log(`   BEFORE:\n${batchValues[multilineIndex]}`);
      console.log(`   AFTER:\n${converted[multilineIndex]}`);
      console.log('');
    }

    console.log('✅ Batch 15 delimiter strategy works!');
    console.log('   Next: Recalibrate detector and run full cleanup');

  } catch (error: any) {
    console.error('\n❌ BATCH 15 TEST FAILED!');
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
