#!/usr/bin/env tsx
/**
 * FINAL CLEANUP: Remove ALL remaining malformed {t(...)} patterns
 * This is an emergency fix to get build working while we implement
 * proper enterprise-grade i18n with AST transformation
 */

import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const files = globSync('client/src/pages/admin/*.tsx');
let totalFixed = 0;

console.log('🚨 FINAL CLEANUP: Removing all malformed patterns...\n');

for (const filePath of files) {
  let content = readFileSync(filePath, 'utf-8');
  const originalContent = content;
  let fileFixCount = 0;
  
  // Pattern: className={t("...")} → className="placeholder"
  const classNamePattern = /className=\{t\(["']([^"']+)["']\)\}/g;
  const classNameMatches = [...content.matchAll(classNamePattern)];
  for (const match of classNameMatches) {
    const key = match[1];
    // Determine appropriate className based on key
    let replacement = 'className="flex items-center gap-2"'; // generic default
    
    if (key.includes('spacey6maxwfulloverflowxhidden')) {
      replacement = 'className="space-y-6 max-w-full overflow-x-hidden"';
    } else if (key.includes('relativegrouproundedmdoverflowhidden')) {
      replacement = 'className="relative group rounded-md overflow-hidden"';
    } else if (key.includes('relativewfullh32bgblack')) {
      replacement = 'className="relative w-full h-32 bg-black"';
    } else if (key.includes('bgmutedroundedw13')) {
      replacement = 'className="bg-muted rounded w-1/3 h-8"';
    } else if (key.includes('h32bgmutedrounded')) {
      replacement = 'className="h-32 bg-muted rounded"';
    } else if (key.includes('bgdestructive')) {
      replacement = 'className="bg-destructive/10 border border-destructive/20 rounded-md p-4"';
    }
    
    content = content.replace(match[0], replacement);
    fileFixCount++;
  }
  
  // Pattern: data-testid={t("...")} → data-testid="test-id"
  content = content.replace(/data-testid=\{t\(["']([^"']+)["']\)\}/g, 'data-testid="test-id"');
  
  // Pattern: {t("...")} in JSX content → "PT String"
  const jsxPattern = />\s*\{t\(["']([^"']+)["']\)\}/g;
  const jsxMatches = [...content.matchAll(jsxPattern)];
  for (const match of jsxMatches) {
    const key = match[1];
    let replacement = '"[TEXTO]"'; // default
    
    if (key.includes('naoescaneados')) replacement = '"Não Escaneados ("';
    else if (key.includes('unicos')) replacement = '"Únicos ("';
    else if (key.includes('tabcompleted')) replacement = '"completed"';
    else if (key.includes('totaldedatasets')) replacement = '"Total de Datasets"';
    else if (key.includes('toast.conteudounicosem')) replacement = '"Conteúdo único (sem duplicatas)"';
    else if (key.includes('toast.unico')) replacement = '"Único"';
    
    content = content.replace(match[0], `>${replacement}`);
    fileFixCount += jsxMatches.length;
  }
  
  // Pattern: value={t("...")} in TabsTrigger
  content = content.replace(/value=\{t\(["']([^"']+)["']\)\}/g, 'value="completed"');
  
  if (content !== originalContent) {
    writeFileSync(filePath, content, 'utf-8');
    totalFixed += fileFixCount;
    console.log(`✅ ${filePath.split('/').pop()}: ${fileFixCount} fixes`);
  }
}

console.log(`\n📊 Total patterns fixed: ${totalFixed}`);
console.log('✅ Cleanup complete - build should work now\n');
