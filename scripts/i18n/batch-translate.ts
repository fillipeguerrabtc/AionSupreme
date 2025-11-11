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

function unflattenObject(flattened: Record<string, string>): TranslationPayload {
  const result: TranslationPayload = {};
  
  for (const [key, value] of Object.entries(flattened)) {
    const parts = key.split('.');
    let current: any = result;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    
    current[parts[parts.length - 1]] = value;
  }
  
  return result;
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

  // CRITICAL: Fail immediately on count mismatch (GPT-4o truncation/formatting error)
  if (translations.length !== texts.length) {
    throw new Error(
      `Translation count mismatch: expected ${texts.length}, got ${translations.length}. ` +
      `This indicates GPT-4o truncation or formatting error. Batch rejected.`
    );
  }

  // Quality validation: detect identical copies (translation failure)
  // Whitelist: short technical terms (all caps, <5 chars)
  const whitelist = new Set(['GPU', 'API', 'KB', 'LLM', 'RAG', 'MoE', 'RBAC', 'SQL', 'DB']);
  let identicalCount = 0;
  const identicalStrings: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    if (translations[i] === texts[i]) {
      // Skip whitelisted technical terms
      if (whitelist.has(texts[i].trim())) {
        continue;
      }
      identicalCount++;
      identicalStrings.push(texts[i]);
      console.warn(`   ⚠️  Identical copy detected: "${texts[i]}"`);
    }
  }

  // Strict threshold: fail on ANY non-whitelisted identical string
  if (identicalCount > 0) {
    throw new Error(
      `Translation quality failure: ${identicalCount} strings are identical copies (not whitelisted). ` +
      `Examples: ${identicalStrings.slice(0, 3).join(', ')}. Batch rejected.`
    );
  }

  return translations;
}

async function main() {
  console.log('🌐 AION i18n Batch Translation Service');
  console.log('=======================================\n');

  // Load PT-BR source
  const ptBRPath = path.resolve(process.cwd(), 'client/src/locales/pt-BR.json');
  const ptBRContent = await fs.readFile(ptBRPath, 'utf-8');
  const ptBR: TranslationPayload = JSON.parse(ptBRContent);

  // Flatten for batch processing
  const flattenedPtBR = await flattenObject(ptBR);
  const keys = Object.keys(flattenedPtBR);
  const values = Object.values(flattenedPtBR);

  console.log(`📊 Total strings to translate: ${keys.length}`);
  console.log(`🎯 Target languages: EN-US, ES-ES`);
  console.log(`🤖 Using GPT-4o with 20-key batches for quality\n`);

  // Batch size: 20 keys (Architect recommendation for quality + validation)
  const BATCH_SIZE = 20;
  const languages: Array<'en-US' | 'es-ES'> = ['en-US', 'es-ES'];

  for (const targetLang of languages) {
    console.log(`\n🔄 Translating to ${targetLang}...`);
    const translatedValues: string[] = [];

    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const batch = values.slice(i, Math.min(i + BATCH_SIZE, values.length));
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(values.length / BATCH_SIZE);

      console.log(`   Batch ${batchNumber}/${totalBatches} (${batch.length} strings)...`);

      let retryCount = 0;
      const MAX_RETRIES = 2;

      while (retryCount <= MAX_RETRIES) {
        try {
          const translations = await translateBatch(batch, targetLang);
          translatedValues.push(...translations);
          console.log(`   ✅ Batch ${batchNumber} translated successfully`);

          // Rate limiting: wait 1s between batches for GPT-4o
          if (i + BATCH_SIZE < values.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          break; // Success - exit retry loop
        } catch (error: any) {
          retryCount++;
          console.error(`   ❌ Attempt ${retryCount}/${MAX_RETRIES + 1} failed:`, error.message);

          if (retryCount > MAX_RETRIES) {
            console.error(`   🛑 All retries exhausted for batch ${batchNumber}`);
            console.error(`   ⚠️  Stopping translation - fix issues and resume from batch ${batchNumber}`);
            throw error; // Fail-fast after retries
          }

          // Exponential backoff before retry
          const backoffMs = 2000 * Math.pow(2, retryCount - 1);
          console.log(`   🔄 Retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    // Rebuild nested structure
    const flattenedTranslated: Record<string, string> = {};
    for (let i = 0; i < keys.length; i++) {
      flattenedTranslated[keys[i]] = translatedValues[i];
    }

    const unflattened = unflattenObject(flattenedTranslated);

    // Save to file
    const outputPath = path.resolve(process.cwd(), `client/src/locales/${targetLang}.json`);
    await fs.writeFile(outputPath, JSON.stringify(unflattened, null, 2) + '\n', 'utf-8');

    console.log(`   ✅ Saved to ${targetLang}.json`);
  }

  console.log('\n🎉 Translation complete!');
  console.log('✅ Generated files:');
  console.log('   - client/src/locales/en-US.json');
  console.log('   - client/src/locales/es-ES.json');
}

main().catch(console.error);
