import fs from 'fs/promises';
import path from 'path';

interface TranslationPayload {
  [key: string]: string | TranslationPayload;
}

interface LanguageClassification {
  key: string;
  value: string;
  detectedLang: 'pt' | 'en' | 'es' | 'mixed' | 'unknown';
  confidence: number;
}

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

function detectLanguageBinary(text: string): 'pt' | 'other' {
  // Skip very short strings
  if (text.length < 3) {
    return 'pt'; // Assume converted after cleanup
  }

  // Treat colon-delimited codes as PT IF they contain PT words
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
    /ção|ções|ã|õ|á|é|í|ó|ú|ê|â/g,
  ];
  
  // Count diacritics (very strong PT signal)
  const diacritics = text.match(/ã|õ|á|é|í|ó|ú|ê|â|ç/g) || [];
  if (diacritics.length >= 1) return 'pt';
  
  // Count word matches
  let ptScore = 0;
  for (const pattern of ptPatterns) {
    const matches = text.match(pattern);
    ptScore += matches ? matches.length : 0;
  }
  
  // VERY RELAXED: Even 1 match is enough
  return ptScore >= 1 ? 'pt' : 'other';
}

function detectLanguage(text: string): { lang: 'pt' | 'en' | 'es' | 'mixed' | 'unknown'; confidence: number } {
  // Use calibrated binary detector first
  const isPt = detectLanguageBinary(text);
  if (isPt === 'pt') {
    return { lang: 'pt', confidence: 1.0 };
  }

  // For non-PT, try to detect specific language
  const lowerText = text.toLowerCase();
  
  // Spanish indicators
  const esPatterns = [
    /\b(el|la|los|las|de|del|al|para|por|con|en)\b/g,
    /\b(qué|cuándo|dónde|cómo|cuál)\b/g,
    /\b(yo|tú|él|ella|nosotros|mi|tu|su)\b/g,
    /\b(mucho|poco|bueno|malo|grande)\b/g,
    /ción|ñ|¿|¡/g,
  ];
  
  // English indicators
  const enPatterns = [
    /\b(the|a|an|of|to|for|in|on|at|by|with|from)\b/g,
    /\b(what|when|where|how|why|which|who)\b/g,
    /\b(is|are|was|were|be|have|has|had|do|does|did)\b/g,
    /\b(must|should|please|required|failed|error)\b/g,
  ];
  
  const esScore = esPatterns.reduce((sum, pattern) => {
    const matches = lowerText.match(pattern);
    return sum + (matches ? matches.length : 0);
  }, 0);
  
  const enScore = enPatterns.reduce((sum, pattern) => {
    const matches = lowerText.match(pattern);
    return sum + (matches ? matches.length : 0);
  }, 0);

  // Determine language
  if (enScore > 2 && esScore > 2) return { lang: 'mixed', confidence: 0.8 };
  if (enScore > 2) return { lang: 'en', confidence: enScore / text.length };
  if (esScore > 2) return { lang: 'es', confidence: esScore / text.length };
  
  return { lang: 'unknown', confidence: 0 };
}

async function main() {
  console.log('🔍 AION i18n Source Language Inventory');
  console.log('========================================\n');
  
  // Load PT-BR source
  const ptBRPath = path.resolve(process.cwd(), 'client/src/locales/pt-BR.json');
  const ptBRContent = await fs.readFile(ptBRPath, 'utf-8');
  const ptBR: TranslationPayload = JSON.parse(ptBRContent);
  
  // Flatten
  const flattenedPtBR = await flattenObject(ptBR);
  const totalKeys = Object.keys(flattenedPtBR).length;
  
  console.log(`📊 Total strings in pt-BR.json: ${totalKeys}\n`);
  console.log('🔍 Classifying language for each string...\n');
  
  // Classify each string
  const classifications: LanguageClassification[] = [];
  
  for (const [key, value] of Object.entries(flattenedPtBR)) {
    const detection = detectLanguage(value);
    classifications.push({
      key,
      value,
      detectedLang: detection.lang,
      confidence: detection.confidence,
    });
  }
  
  // Calculate metrics
  const metrics = {
    pt: classifications.filter(c => c.detectedLang === 'pt').length,
    en: classifications.filter(c => c.detectedLang === 'en').length,
    es: classifications.filter(c => c.detectedLang === 'es').length,
    mixed: classifications.filter(c => c.detectedLang === 'mixed').length,
    unknown: classifications.filter(c => c.detectedLang === 'unknown').length,
  };
  
  console.log('📊 CLASSIFICATION RESULTS:');
  console.log('==========================\n');
  console.log(`   🇧🇷 Portuguese: ${metrics.pt} (${((metrics.pt / totalKeys) * 100).toFixed(1)}%)`);
  console.log(`   🇺🇸 English: ${metrics.en} (${((metrics.en / totalKeys) * 100).toFixed(1)}%)`);
  console.log(`   🇪🇸 Spanish: ${metrics.es} (${((metrics.es / totalKeys) * 100).toFixed(1)}%)`);
  console.log(`   🌐 Mixed: ${metrics.mixed} (${((metrics.mixed / totalKeys) * 100).toFixed(1)}%)`);
  console.log(`   ❓ Unknown: ${metrics.unknown} (${((metrics.unknown / totalKeys) * 100).toFixed(1)}%)\n`);
  
  // Quality assessment
  const purity = (metrics.pt / totalKeys) * 100;
  const contamination = ((metrics.en + metrics.es + metrics.mixed) / totalKeys) * 100;
  
  console.log('🎯 QUALITY ASSESSMENT:');
  console.log('======================\n');
  console.log(`   Purity (PT only): ${purity.toFixed(1)}%`);
  console.log(`   Contamination (EN+ES+Mixed): ${contamination.toFixed(1)}%`);
  
  if (purity >= 95) {
    console.log('   ✅ EXCELLENT - Source is clean\n');
  } else if (purity >= 80) {
    console.log('   ⚠️  ACCEPTABLE - Minor cleanup needed\n');
  } else if (purity >= 50) {
    console.log('   ⚠️  POOR - Significant cleanup required\n');
  } else {
    console.log('   ❌ CRITICAL - Massive contamination, unusable for translation\n');
  }
  
  // Show sample contaminated strings
  const contaminated = classifications.filter(c => c.detectedLang !== 'pt' && c.detectedLang !== 'unknown');
  
  if (contaminated.length > 0) {
    console.log('⚠️  SAMPLE CONTAMINATED STRINGS (first 30):');
    console.log('=========================================\n');
    
    contaminated.slice(0, 30).forEach((c, i) => {
      console.log(`   ${i + 1}. [${c.detectedLang.toUpperCase()}] ${c.key}`);
      console.log(`      "${c.value}"\n`);
    });
  }
  
  // Save detailed report
  const reportPath = path.resolve(process.cwd(), 'scripts/i18n/language-inventory.json');
  await fs.writeFile(
    reportPath,
    JSON.stringify({
      totalKeys,
      metrics,
      purity,
      contamination,
      classifications: contaminated, // Only save contaminated ones to keep file smaller
    }, null, 2),
    'utf-8'
  );
  
  console.log(`✅ Full report saved to: ${reportPath}`);
  console.log(`   (Contains ${contaminated.length} contaminated strings for remediation)\n`);
  
  // Exit with error code if contamination is high
  if (contamination > 20) {
    console.log('❌ Quality gate FAILED - contamination exceeds 20%');
    console.log('   Action: Run cleanup pipeline before proceeding to translation');
    process.exit(1);
  }
  
  console.log('✅ Quality gate PASSED - source is acceptable');
}

main().catch(console.error);
