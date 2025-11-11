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

  const prompt = `You are a professional translator. Translate the following Brazilian Portuguese texts to ${languageNames[targetLanguage]}.

CRITICAL RULES:
1. Preserve ALL interpolation variables EXACTLY as they appear: {variable}, {{variable}}, {0}, {1}, etc.
2. Maintain the same tone and style (formal/informal)
3. Keep technical terms in English when appropriate
4. Return ONLY the translations, one per line, in the EXACT same order
5. Do NOT add explanations, comments, or any additional text
6. If a text is already in English/Spanish (technical term), keep it unchanged

Texts to translate (one per line):
${texts.join('\n')}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a professional translator specializing in software localization. You preserve variable interpolations and maintain technical accuracy.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.3,
    max_tokens: 8000,
  });

  const translatedText = response.choices[0]?.message?.content || '';
  const translations = translatedText.split('\n').filter(line => line.trim());

  if (translations.length !== texts.length) {
    console.warn(`⚠️  Translation count mismatch: expected ${texts.length}, got ${translations.length}`);
    // Fill missing with original text
    while (translations.length < texts.length) {
      translations.push(texts[translations.length]);
    }
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
  console.log(`🎯 Target languages: EN-US, ES-ES\n`);

  // Batch size (larger batches for efficiency, GPT-4o-mini can handle it)
  const BATCH_SIZE = 200;
  const languages: Array<'en-US' | 'es-ES'> = ['en-US', 'es-ES'];

  for (const targetLang of languages) {
    console.log(`\n🔄 Translating to ${targetLang}...`);
    const translatedValues: string[] = [];

    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const batch = values.slice(i, Math.min(i + BATCH_SIZE, values.length));
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(values.length / BATCH_SIZE);

      console.log(`   Batch ${batchNumber}/${totalBatches} (${batch.length} strings)...`);

      try {
        const translations = await translateBatch(batch, targetLang);
        translatedValues.push(...translations);

        // Rate limiting: wait 500ms between batches to avoid hitting OpenAI limits
        if (i + BATCH_SIZE < values.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error: any) {
        console.error(`   ❌ Error in batch ${batchNumber}:`, error.message);
        console.error('   Using original text as fallback...');
        translatedValues.push(...batch);
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
