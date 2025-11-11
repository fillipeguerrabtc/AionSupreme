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

function detectLanguage(text: string): 'pt' | 'other' {
  // Skip very short strings or pure technical codes
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

async function convertBatchToPortuguese(texts: string[]): Promise<string[]> {
  const prompt = `You are a professional translator converting ANY text to AUTHENTIC Brazilian Portuguese (PT-BR).

CRITICAL RULES:
1. ALWAYS output in Brazilian Portuguese - never English, Spanish, or any other language
2. Preserve interpolation variables EXACTLY: {variable}, {{variable}}, {0}, $\{var}, etc.
3. For technical English terms commonly used in PT-BR tech (like "API", "token", "dataset"), keep them in English
4. For permission codes (like "agents:list:read"), translate to Portuguese (like "agentes:listar:ler")
5. For error messages, use clear, natural Brazilian Portuguese
6. Return ONLY the translations, one per line, in EXACT order
7. Do NOT add explanations

EXAMPLES:
"Failed to provision worker" → "Falhou ao provisionar worker"
"agents:list:read" → "agentes:listar:ler"
"Error loading data" → "Erro ao carregar dados"

Texts to convert:
${texts.join('\n')}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a professional translator converting technical software strings to authentic Brazilian Portuguese. Output in PT-BR for every line.'
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
    .split('\n')
    .filter(line => line.trim())
    .map(line => line.trim()); // TRIM to remove trailing spaces

  if (translations.length !== texts.length) {
    throw new Error(`Count mismatch: expected ${texts.length}, got ${translations.length}`);
  }

  return translations;
}

async function main() {
  console.log('🧪 DRY RUN: Testing cleanup on 1 batch (20 strings)');
  console.log('===================================================\n');

  const ptBRPath = path.resolve(process.cwd(), 'client/src/locales/pt-BR.json');
  const ptBRContent = await fs.readFile(ptBRPath, 'utf-8');
  const ptBR: TranslationPayload = JSON.parse(ptBRContent);

  const flattenedPtBR = await flattenObject(ptBR);
  const keys = Object.keys(flattenedPtBR);
  const values = Object.values(flattenedPtBR);

  // Test batch - find first batch that needs conversion
  let testBatch: string[] = [];
  let testKeys: string[] = [];
  let batchIndex = 0;

  for (let i = 0; i < values.length; i += 20) {
    const batch = values.slice(i, Math.min(i + 20, values.length));
    const hasNonPT = batch.some(v => detectLanguage(v) === 'other');
    
    if (hasNonPT) {
      testBatch = batch;
      testKeys = keys.slice(i, Math.min(i + 20, values.length));
      batchIndex = i;
      break;
    }
  }

  if (testBatch.length === 0) {
    console.log('✅ No non-PT strings found - all clean!');
    return;
  }

  console.log(`📊 Testing batch starting at index ${batchIndex}\n`);
  console.log('Sample strings (first 10):');
  testBatch.slice(0, 10).forEach((s, i) => {
    const lang = detectLanguage(s);
    console.log(`   ${i + 1}. [${lang.toUpperCase()}] "${s}"`);
  });
  console.log('');

  console.log('🔄 Converting to Brazilian Portuguese...\n');
  
  try {
    const converted = await convertBatchToPortuguese(testBatch);
    
    console.log('✅ DRY RUN PASSED!\n');
    console.log('Sample conversions (first 15):');
    for (let i = 0; i < Math.min(15, converted.length); i++) {
      console.log(`   ${i + 1}. ${testKeys[i]}`);
      console.log(`      BEFORE: "${testBatch[i]}"`);
      console.log(`      AFTER:  "${converted[i]}"`);
      console.log('');
    }

    // Quality check
    let ptCount = 0;
    let identicalCount = 0;
    
    for (let i = 0; i < converted.length; i++) {
      if (detectLanguage(converted[i]) === 'pt') ptCount++;
      if (converted[i] === testBatch[i]) identicalCount++;
    }

    const ptPercentage = (ptCount / converted.length) * 100;
    const identicalPercentage = (identicalCount / converted.length) * 100;

    console.log(`📊 Quality Metrics:`);
    console.log(`   PT detected: ${ptCount}/${converted.length} (${ptPercentage.toFixed(1)}%)`);
    console.log(`   Identical: ${identicalCount}/${converted.length} (${identicalPercentage.toFixed(1)}%)\n`);

    if (ptPercentage >= 70) {
      console.log('✅ Quality EXCELLENT - ready for full cleanup!');
      console.log(`   Next: Run cleanup-to-portuguese.ts for all ${Math.ceil(values.length / 20)} batches`);
    } else {
      console.log('⚠️  Quality INSUFFICIENT - review prompt/model');
    }

  } catch (error: any) {
    console.error('\n❌ DRY RUN FAILED!');
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
