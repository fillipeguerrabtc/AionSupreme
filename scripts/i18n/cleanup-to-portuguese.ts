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

function detectLanguage(text: string): 'pt' | 'other' {
  // Skip very short strings
  if (text.length < 3) {
    return 'pt'; // Assume converted
  }

  // Treat colon-delimited codes as PT-neutral IF they contain PT words
  // Ex: "agentes:listar:ler", "kb:documentos:ler"
  if (text.includes(':')) {
    const parts = text.split(':');
    const ptWords = ['agentes', 'listar', 'ler', 'escrever', 'gerenciar', 'documentos', 
                     'imagens', 'curadoria', 'fila', 'configurações', 'políticas', 
                     'funções', 'permissões', 'painel', 'visão', 'geral'];
    const hasPtWord = parts.some(p => ptWords.includes(p.toLowerCase()));
    if (hasPtWord) return 'pt';
  }

  // Strong Portuguese indicators
  const ptPatterns = [
    /\b(você|nós|está|são|para|com|quando|onde|como|após|sem|muito|novo)\b/gi,
    /\b(configurações|adicionar|remover|salvar|cancelar|criar|editar|erro|falhou|nenhum|dados)\b/gi,
    /\b(conta|sessão|buscar|parar|iniciar|definir|proibido|inválido|credenciais|verifique)\b/gi,
    /ção|ções|ã|õ|á|é|í|ó|ú|ê|â/g, // Diacritics are strong PT signal
  ];
  
  // Count diacritics (very strong PT signal)
  const diacritics = text.match(/ã|õ|á|é|í|ó|ú|ê|â|ç/g) || [];
  const diacriticCount = diacritics.length;
  
  // If has diacritics, very likely PT
  if (diacriticCount >= 1) {
    return 'pt';
  }
  
  // Count word matches
  let ptScore = 0;
  for (const pattern of ptPatterns) {
    const matches = text.match(pattern);
    ptScore += matches ? matches.length : 0;
  }
  
  // VERY RELAXED: Even 1 match is enough
  return ptScore >= 1 ? 'pt' : 'other';
}

async function convertBatchToPortuguese(
  texts: string[]
): Promise<string[]> {
  // Use special delimiter to handle multi-line strings
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
    .map(line => line.replace(/<NEWLINE>/g, '\n')); // Restore newlines

  // CRITICAL: Fail immediately on count mismatch
  if (translations.length !== texts.length) {
    throw new Error(
      `Conversion count mismatch: expected ${texts.length}, got ${translations.length}. ` +
      `GPT-4o truncation or formatting error. Batch rejected.`
    );
  }

  return translations;
}

async function main() {
  console.log('🧹 AION pt-BR.json Cleanup Pipeline');
  console.log('=====================================\n');

  // Load current pt-BR.json
  const ptBRPath = path.resolve(process.cwd(), 'client/src/locales/pt-BR.json');
  const ptBRContent = await fs.readFile(ptBRPath, 'utf-8');
  const ptBR: TranslationPayload = JSON.parse(ptBRContent);

  // Flatten
  const flattenedPtBR = await flattenObject(ptBR);
  const keys = Object.keys(flattenedPtBR);
  const values = Object.values(flattenedPtBR);

  console.log(`📊 Total strings to clean: ${keys.length}\n`);

  // Pre-scan: classify which need conversion
  console.log('🔍 Pre-scanning to identify strings needing conversion...\n');
  const needsConversion: boolean[] = [];
  let ptCount = 0;
  let otherCount = 0;

  for (const value of values) {
    const lang = detectLanguage(value);
    if (lang === 'pt') {
      needsConversion.push(false);
      ptCount++;
    } else {
      needsConversion.push(true);
      otherCount++;
    }
  }

  console.log(`   ✅ Already PT: ${ptCount} (${((ptCount / keys.length) * 100).toFixed(1)}%)`);
  console.log(`   🔄 Needs conversion: ${otherCount} (${((otherCount / keys.length) * 100).toFixed(1)}%)\n`);

  // Process in batches
  const BATCH_SIZE = 10; // Reduced for better GPT reliability
  const cleanedValues: string[] = [];

  console.log('🔄 Converting non-PT strings to Brazilian Portuguese...\n');
  const failedBatches: number[] = [];
  let successCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, Math.min(i + BATCH_SIZE, values.length));
    const batchNeeds = needsConversion.slice(i, Math.min(i + BATCH_SIZE, values.length));
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(values.length / BATCH_SIZE);

    console.log(`   Batch ${batchNumber}/${totalBatches} (${batch.length} strings)...`);

    // Check if entire batch is already PT
    const allPT = batchNeeds.every(needs => !needs);
    
    if (allPT) {
      console.log(`   ⏭️  All strings already PT - skipping GPT-4o call`);
      cleanedValues.push(...batch);
      skippedCount++;
      continue;
    }

    // Convert batch
    let retryCount = 0;
    const MAX_RETRIES = 2;
    let batchSuccess = false;

    while (retryCount <= MAX_RETRIES) {
      try {
        const converted = await convertBatchToPortuguese(batch);
        cleanedValues.push(...converted);
        console.log(`   ✅ Batch ${batchNumber} converted successfully`);
        successCount++;
        batchSuccess = true;

        // Rate limiting
        if (i + BATCH_SIZE < values.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        break;
      } catch (error: any) {
        retryCount++;
        console.error(`   ❌ Attempt ${retryCount}/${MAX_RETRIES + 1} failed:`, error.message);

        if (retryCount > MAX_RETRIES) {
          console.error(`   🛑 All retries exhausted for batch ${batchNumber} - CONTINUING with original values`);
          cleanedValues.push(...batch); // Keep original values
          failedBatches.push(batchNumber);
          batchSuccess = false;
          break;
        }

        const backoffMs = 2000 * Math.pow(2, retryCount - 1);
        console.log(`   🔄 Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  // Report summary
  console.log('\n📊 CLEANUP SUMMARY:');
  console.log(`   ✅ Successful: ${successCount} batches`);
  console.log(`   ⏭️  Skipped (already PT): ${skippedCount} batches`);
  console.log(`   ❌ Failed: ${failedBatches.length} batches`);
  
  if (failedBatches.length > 0) {
    console.log('\n⚠️  Failed batches (kept original values):');
    failedBatches.forEach(b => console.log(`   - Batch ${b}`));
    console.log('\nNote: pt-BR.json was updated with successful conversions. Failed batches need manual review.');
  }

  // Rebuild nested structure
  const flattenedCleaned: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    flattenedCleaned[keys[i]] = cleanedValues[i];
  }

  const unflattened = unflattenObject(flattenedCleaned);

  // Backup original
  const backupPath = path.resolve(process.cwd(), 'client/src/locales/pt-BR.json.backup');
  await fs.writeFile(backupPath, ptBRContent, 'utf-8');
  console.log(`\n💾 Original backed up to: pt-BR.json.backup`);

  // Save cleaned version
  await fs.writeFile(ptBRPath, JSON.stringify(unflattened, null, 2) + '\n', 'utf-8');
  console.log(`✅ Cleaned version saved to: pt-BR.json\n`);

  console.log('🎉 Cleanup complete!');
  console.log('📋 Next step: Run inventory-source-language.ts to verify purity\n');
}

main().catch(console.error);
