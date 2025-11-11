import fs from 'fs/promises';
import path from 'path';

interface TranslationPayload {
  [key: string]: string | TranslationPayload;
}

interface QAReport {
  locale: string;
  totalKeys: number;
  identicalToSource: number;
  suspiciousStrings: Array<{
    key: string;
    source: string;
    translation: string;
    issue: string;
  }>;
  languageDetectionFailed: number;
  interpolationMismatches: number;
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

function detectLanguage(text: string): 'pt' | 'en' | 'es' | 'unknown' {
  const lowerText = text.toLowerCase();
  
  // Portuguese indicators
  const ptPatterns = [
    /\b(o|a|os|as|de|do|da|dos|das|para|por|com|em|no|na)\b/g,
    /\b(que|quando|onde|como|porque|qual)\b/g,
    /\b(eu|você|nós|eles|meu|seu)\b/g,
    /ç|ã|õ|á|é|í|ó|ú|â|ê|ô/g,
  ];
  
  // Spanish indicators
  const esPatterns = [
    /\b(el|la|los|las|de|del|al|para|por|con|en)\b/g,
    /\b(qué|cuándo|dónde|cómo|cuál)\b/g,
    /\b(yo|tú|él|ella|nosotros|mi|tu|su)\b/g,
    /ñ|¿|¡/g,
  ];
  
  // English indicators
  const enPatterns = [
    /\b(the|a|an|of|to|for|in|on|at|by|with|from)\b/g,
    /\b(what|when|where|how|why|which|who)\b/g,
    /\b(i|you|he|she|we|they|my|your|his|her)\b/g,
  ];
  
  const ptScore = ptPatterns.reduce((sum, pattern) => {
    const matches = lowerText.match(pattern);
    return sum + (matches ? matches.length : 0);
  }, 0);
  
  const esScore = esPatterns.reduce((sum, pattern) => {
    const matches = lowerText.match(pattern);
    return sum + (matches ? matches.length : 0);
  }, 0);
  
  const enScore = enPatterns.reduce((sum, pattern) => {
    const matches = lowerText.match(pattern);
    return sum + (matches ? matches.length : 0);
  }, 0);
  
  // Need at least 2 matches to be confident
  if (ptScore < 2 && esScore < 2 && enScore < 2) {
    return 'unknown';
  }
  
  if (ptScore > esScore && ptScore > enScore) return 'pt';
  if (esScore > ptScore && esScore > enScore) return 'es';
  if (enScore > ptScore && enScore > esScore) return 'en';
  
  return 'unknown';
}

function extractInterpolations(text: string): string[] {
  const patterns = [
    /\{[^}]+\}/g,        // {variable}
    /\{\{[^}]+\}\}/g,    // {{variable}}
    /\$\{[^}]+\}/g,      // ${variable}
    /\{[0-9]+\}/g,       // {0}, {1}
  ];
  
  const interpolations: string[] = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    interpolations.push(...matches);
  }
  
  return interpolations.sort();
}

function checkInterpolationMatch(source: string, translation: string): boolean {
  const sourceVars = extractInterpolations(source);
  const translationVars = extractInterpolations(translation);
  
  if (sourceVars.length !== translationVars.length) return false;
  
  return sourceVars.every((v, i) => v === translationVars[i]);
}

async function qaLocale(
  sourceLocale: Record<string, string>,
  targetLocale: Record<string, string>,
  targetLang: 'en-US' | 'es-ES'
): Promise<QAReport> {
  const expectedLang = targetLang === 'en-US' ? 'en' : 'es';
  const report: QAReport = {
    locale: targetLang,
    totalKeys: Object.keys(targetLocale).length,
    identicalToSource: 0,
    suspiciousStrings: [],
    languageDetectionFailed: 0,
    interpolationMismatches: 0,
  };
  
  for (const [key, sourceValue] of Object.entries(sourceLocale)) {
    const targetValue = targetLocale[key];
    
    if (!targetValue) {
      report.suspiciousStrings.push({
        key,
        source: sourceValue,
        translation: '(missing)',
        issue: 'Missing translation',
      });
      continue;
    }
    
    // Check if identical to source (likely not translated)
    if (sourceValue === targetValue) {
      report.identicalToSource++;
      // Only flag as suspicious if it's not a technical term
      if (sourceValue.length > 10 && !sourceValue.match(/^[A-Z_]+$/)) {
        report.suspiciousStrings.push({
          key,
          source: sourceValue,
          translation: targetValue,
          issue: 'Identical to source (not translated)',
        });
      }
    }
    
    // Language detection (skip short strings and technical terms)
    if (targetValue.length > 15 && !targetValue.match(/^[A-Z_]+$/)) {
      const detectedLang = detectLanguage(targetValue);
      if (detectedLang !== expectedLang && detectedLang !== 'unknown') {
        report.languageDetectionFailed++;
        report.suspiciousStrings.push({
          key,
          source: sourceValue,
          translation: targetValue,
          issue: `Expected ${expectedLang}, detected ${detectedLang}`,
        });
      }
    }
    
    // Check interpolation preservation
    if (!checkInterpolationMatch(sourceValue, targetValue)) {
      report.interpolationMismatches++;
      report.suspiciousStrings.push({
        key,
        source: sourceValue,
        translation: targetValue,
        issue: 'Interpolation variables mismatch',
      });
    }
  }
  
  return report;
}

async function main() {
  console.log('🔍 AION i18n Translation QA Tool');
  console.log('=================================\n');
  
  // Load locales
  const ptBRPath = path.resolve(process.cwd(), 'client/src/locales/pt-BR.json');
  const enUSPath = path.resolve(process.cwd(), 'client/src/locales/en-US.json');
  const esESPath = path.resolve(process.cwd(), 'client/src/locales/es-ES.json');
  
  const ptBR: TranslationPayload = JSON.parse(await fs.readFile(ptBRPath, 'utf-8'));
  const enUS: TranslationPayload = JSON.parse(await fs.readFile(enUSPath, 'utf-8'));
  const esES: TranslationPayload = JSON.parse(await fs.readFile(esESPath, 'utf-8'));
  
  // Flatten
  const flatPtBR = await flattenObject(ptBR);
  const flatEnUS = await flattenObject(enUS);
  const flatEsES = await flattenObject(esES);
  
  console.log(`📊 Loaded ${Object.keys(flatPtBR).length} keys from PT-BR\n`);
  
  // QA EN-US
  console.log('🔍 Analyzing EN-US translations...');
  const enReport = await qaLocale(flatPtBR, flatEnUS, 'en-US');
  console.log(`   Total keys: ${enReport.totalKeys}`);
  console.log(`   Identical to source: ${enReport.identicalToSource} (${((enReport.identicalToSource / enReport.totalKeys) * 100).toFixed(1)}%)`);
  console.log(`   Language detection failed: ${enReport.languageDetectionFailed}`);
  console.log(`   Interpolation mismatches: ${enReport.interpolationMismatches}`);
  console.log(`   Total suspicious: ${enReport.suspiciousStrings.length}\n`);
  
  // QA ES-ES
  console.log('🔍 Analyzing ES-ES translations...');
  const esReport = await qaLocale(flatPtBR, flatEsES, 'es-ES');
  console.log(`   Total keys: ${esReport.totalKeys}`);
  console.log(`   Identical to source: ${esReport.identicalToSource} (${((esReport.identicalToSource / esReport.totalKeys) * 100).toFixed(1)}%)`);
  console.log(`   Language detection failed: ${esReport.languageDetectionFailed}`);
  console.log(`   Interpolation mismatches: ${esReport.interpolationMismatches}`);
  console.log(`   Total suspicious: ${esReport.suspiciousStrings.length}\n`);
  
  // Show top suspicious strings
  console.log('⚠️  Top 20 Suspicious Strings (EN-US):');
  enReport.suspiciousStrings.slice(0, 20).forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.key}`);
    console.log(`      Issue: ${s.issue}`);
    console.log(`      Source: "${s.source}"`);
    console.log(`      Translation: "${s.translation}"\n`);
  });
  
  console.log('⚠️  Top 20 Suspicious Strings (ES-ES):');
  esReport.suspiciousStrings.slice(0, 20).forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.key}`);
    console.log(`      Issue: ${s.issue}`);
    console.log(`      Source: "${s.source}"`);
    console.log(`      Translation: "${s.translation}"\n`);
  });
  
  // Save full reports
  const reportPath = path.resolve(process.cwd(), 'scripts/i18n/qa-report.json');
  await fs.writeFile(
    reportPath,
    JSON.stringify({ enUS: enReport, esES: esReport }, null, 2),
    'utf-8'
  );
  
  console.log(`✅ Full QA report saved to: ${reportPath}`);
  
  // Quality gates
  const enQualityScore = 100 - ((enReport.identicalToSource / enReport.totalKeys) * 100);
  const esQualityScore = 100 - ((esReport.identicalToSource / esReport.totalKeys) * 100);
  
  console.log('\n📈 Quality Scores:');
  console.log(`   EN-US: ${enQualityScore.toFixed(1)}% (${enQualityScore >= 70 ? '✅ PASS' : '❌ FAIL - needs review'})`);
  console.log(`   ES-ES: ${esQualityScore.toFixed(1)}% (${esQualityScore >= 70 ? '✅ PASS' : '❌ FAIL - needs review'})`);
  
  if (enQualityScore < 70 || esQualityScore < 70) {
    console.log('\n⚠️  Quality gate FAILED - manual review required');
    process.exit(1);
  }
}

main().catch(console.error);
