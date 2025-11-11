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

async function translateBatch(
  texts: string[],
  targetLanguage: 'en-US' | 'es-ES'
): Promise<string[]> {
  const languageNames = {
    'en-US': 'American English',
    'es-ES': 'European Spanish'
  };

  const technicalGlossary = {
    'en-US': 'GPU, API, token, dataset, agent, model, training, embedding, inference, prompt, chat, admin, dashboard, webhook',
    'es-ES': 'GPU, API, token, dataset, agente, modelo, entrenamiento, embedding, inferencia, prompt, chat, admin, dashboard, webhook'
  };

  const prompt = `You are a professional translator specializing in enterprise software localization. Translate the following Brazilian Portuguese texts to ${languageNames[targetLanguage]}.

CRITICAL RULES (MANDATORY):
1. PRESERVE ALL interpolation variables EXACTLY: {variable}, {{variable}}, {0}, {1}, $\{var}, etc.
2. TRANSLATE the text - DO NOT copy the original Portuguese unchanged
3. Maintain the same tone and formality level
4. Keep these technical terms in English: ${technicalGlossary[targetLanguage]}
5. Return ONLY the translations, one per line, in the EXACT same order
6. Do NOT add explanations, numbering, or any additional text
7. Each line must be a TRANSLATED version, not a copy of the original

EXAMPLE:
Input: "Bem-vindo ao sistema"
Output: "Welcome to the system" (NOT "Bem-vindo ao sistema")

Texts to translate (one per line):
${texts.join('\n')}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a professional translator specializing in software localization. You MUST translate every text - never return the original Portuguese unchanged. Preserve variable interpolations and maintain technical accuracy.'
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
  const translations = translatedText.split('\n').filter(line => line.trim());

  // CRITICAL: Fail immediately on count mismatch
  if (translations.length !== texts.length) {
    throw new Error(
      `Translation count mismatch: expected ${texts.length}, got ${translations.length}. ` +
      `This indicates GPT-4o truncation or formatting error. Batch rejected.`
    );
  }

  // Quality validation: detect identical copies
  const whitelist = new Set(['GPU', 'API', 'KB', 'LLM', 'RAG', 'MoE', 'RBAC', 'SQL', 'DB']);
  let identicalCount = 0;
  const identicalStrings: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    if (translations[i] === texts[i]) {
      if (whitelist.has(texts[i].trim())) {
        continue;
      }
      identicalCount++;
      identicalStrings.push(texts[i]);
      console.warn(`   ⚠️  Identical copy: "${texts[i]}"`);
    }
  }

  if (identicalCount > 0) {
    throw new Error(
      `Translation quality failure: ${identicalCount} identical copies. ` +
      `Examples: ${identicalStrings.slice(0, 3).join(', ')}.`
    );
  }

  return translations;
}

async function main() {
  console.log('🧪 SMOKE RUN: Testing 1 batch (20 strings) EN-US');
  console.log('=================================================\n');

  const ptBRPath = path.resolve(process.cwd(), 'client/src/locales/pt-BR.json');
  const ptBRContent = await fs.readFile(ptBRPath, 'utf-8');
  const ptBR: TranslationPayload = JSON.parse(ptBRContent);

  const flattenedPtBR = await flattenObject(ptBR);
  const keys = Object.keys(flattenedPtBR);
  const values = Object.values(flattenedPtBR);

  // SMOKE RUN: Only first 20 strings
  const testBatch = values.slice(0, 20);
  const testKeys = keys.slice(0, 20);

  console.log(`📊 Testing ${testBatch.length} strings from ${keys.length} total\n`);
  console.log('Sample strings:');
  testBatch.slice(0, 5).forEach((s, i) => {
    console.log(`   ${i + 1}. "${s}"`);
  });
  console.log('');

  console.log('🔄 Translating to EN-US...');
  
  try {
    const translations = await translateBatch(testBatch, 'en-US');
    
    console.log('\n✅ SMOKE RUN PASSED!\n');
    console.log('Sample translations:');
    for (let i = 0; i < Math.min(10, translations.length); i++) {
      console.log(`   ${testKeys[i]}`);
      console.log(`      PT: "${testBatch[i]}"`);
      console.log(`      EN: "${translations[i]}"`);
      console.log('');
    }

    // Quick quality check
    const identicalCount = translations.filter((t, i) => t === testBatch[i]).length;
    const qualityScore = ((20 - identicalCount) / 20) * 100;
    
    console.log(`📊 Quality Score: ${qualityScore.toFixed(1)}%`);
    
    if (qualityScore >= 90) {
      console.log('✅ Quality excellent - ready for full run!');
    } else if (qualityScore >= 70) {
      console.log('⚠️  Quality acceptable but needs monitoring');
    } else {
      console.log('❌ Quality insufficient - review prompts/model');
    }

  } catch (error: any) {
    console.error('\n❌ SMOKE RUN FAILED!');
    console.error(`Error: ${error.message}\n`);
    console.error('Action: Fix issues before proceeding to full translation');
    process.exit(1);
  }
}

main().catch(console.error);
