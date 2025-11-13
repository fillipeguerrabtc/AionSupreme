/**
 * I18N GENERATOR SCRIPT - Google Auth Dialog
 * ==========================================
 * 
 * Generates TypeScript interface and locale objects from JSON.
 * 
 * USAGE:
 *   npx tsx scripts/generate-i18n-google-auth.ts
 * 
 * OUTPUT:
 *   Console output with TypeScript code to paste into client/src/lib/i18n.tsx
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface I18nEntry {
  key: string;
  ptBR: string;
  enUS: string;
  esES: string;
  context?: string;
}

// Read JSON
const jsonPath = path.join(__dirname, 'googleAuthDialog-i18n.json');
const entries: I18nEntry[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

console.log(`\n📦 Processing ${entries.length} i18n entries...`);

// Build nested structure
function buildNestedObject(entries: I18nEntry[], locale: 'ptBR' | 'enUS' | 'esES') {
  const result: any = {};
  
  for (const entry of entries) {
    const keys = entry.key.split('.');
    let current = result;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    const value = entry[locale] || `[TRANSLATE: ${entry.ptBR}]`;
    current[keys[keys.length - 1]] = value;
  }
  
  return result;
}

// Generate TypeScript interface
function generateTypeScriptInterface(obj: any, indent = 0): string {
  const spaces = '  '.repeat(indent);
  let result = '';
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null) {
      result += `${spaces}${key}: {\n`;
      result += generateTypeScriptInterface(value, indent + 1);
      result += `${spaces}};\n`;
    } else {
      result += `${spaces}${key}: string;\n`;
    }
  }
  
  return result;
}

// Generate TypeScript literal object
function generateTypeScriptLiteral(obj: any, indent = 0): string {
  const spaces = '  '.repeat(indent);
  let result = '';
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null) {
      result += `${spaces}${key}: {\n`;
      result += generateTypeScriptLiteral(value, indent + 1);
      result += `${spaces}},\n`;
    } else {
      // Escape quotes and newlines
      const escapedValue = JSON.stringify(value);
      result += `${spaces}${key}: ${escapedValue},\n`;
    }
  }
  
  return result;
}

const ptBRObj = buildNestedObject(entries, 'ptBR');
const enUSObj = buildNestedObject(entries, 'enUS');
const esESObj = buildNestedObject(entries, 'esES');

console.log('\n✅ GENERATION COMPLETE!\n');
console.log('=' .repeat(80));
console.log('STEP 1: ADD TO TYPESCRIPT INTERFACE (around line 793)');
console.log('=' .repeat(80));
console.log('\n// Add inside admin.gpuManagement section, BEFORE the closing brace:\n');
console.log('googleAuthDialog: {');
console.log(generateTypeScriptInterface(ptBRObj, 1).trimEnd());
console.log('};');

console.log('\n' + '='.repeat(80));
console.log('STEP 2: ADD TO PT-BR TRANSLATIONS (around line 2188)');
console.log('='.repeat(80));
console.log('\n// Add inside admin.gpuManagement section, BEFORE the closing brace:\n');
console.log('googleAuthDialog: {');
console.log(generateTypeScriptLiteral(ptBRObj, 1).trimEnd());
console.log('},');

console.log('\n' + '='.repeat(80));
console.log('STEP 3: ADD TO EN-US TRANSLATIONS (search for gpuManagement in EN section)');
console.log('='.repeat(80));
console.log('\n// Add inside admin.gpuManagement section, BEFORE the closing brace:\n');
console.log('googleAuthDialog: {');
console.log(generateTypeScriptLiteral(enUSObj, 1).trimEnd());
console.log('},');

console.log('\n' + '='.repeat(80));
console.log('STEP 4: ADD TO ES-ES TRANSLATIONS (search for gpuManagement in ES section)');
console.log('='.repeat(80));
console.log('\n// Add inside admin.gpuManagement section, BEFORE the closing brace:\n');
console.log('googleAuthDialog: {');
console.log(generateTypeScriptLiteral(esESObj, 1).trimEnd());
console.log('},');

console.log('\n' + '='.repeat(80));
console.log('⚠️  IMPORTANT: Replace [TRANSLATE: ...] placeholders with actual translations!');
console.log('='.repeat(80));
console.log('\n📋 NEXT STEPS:');
console.log('1. Copy TypeScript Interface to client/src/lib/i18n.tsx (Translations interface)');
console.log('2. Copy PT-BR translations to portuguese section');
console.log('3. Copy EN-US translations to english section (translate [TRANSLATE: ...] placeholders)');
console.log('4. Copy ES-ES translations to spanish section (translate [TRANSLATE: ...] placeholders)');
console.log('5. Run: npm run lint to check for errors');
console.log('6. Refactor GoogleAuthDialog.tsx to use new t() keys\n');
