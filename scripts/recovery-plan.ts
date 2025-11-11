#!/usr/bin/env tsx
/**
 * RECOVERY PLAN - Systematic restoration of admin pages
 * 
 * Strategy:
 * 1. Identify VALID uses of {t.common.loading} (actual loading states)
 * 2. Restore FIXED literals (language names, units, HTTP verbs)
 * 3. Keep legitimate translations
 */

import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

// Literals that should NEVER be translated
const FIXED_LITERALS = {
  // Language names
  'Português (BR)': true,
  'English (US)': true,
  'Español (ES)': true,
  
  // HTTP methods
  'POST': true,
  'GET': true,
  'PUT': true,
  'DELETE': true,
  'PATCH': true,
  
  // Units
  'ms': true,
  '%': true,
  'KB': true,
  'MB': true,
  'GB': true,
  
  // Chart labels
  'P95': true,
  'P99': true,
  'P50': true,
  
  // Status literals
  '[PT]': true,
};

// Patterns that indicate VALID translation usage
const VALID_TRANSLATION_CONTEXTS = [
  /Loading\.\.\./,  // Generic loading text
  /Carregando/,     // Portuguese loading
  /Cargando/,       // Spanish loading
];

console.log('🔍 PHASE 1: Analyzing damage...\n');

const files = globSync('client/src/pages/admin/*.tsx');
const analysis: any = {
  totalFiles: files.length,
  filesWithIssues: 0,
  issues: [] as any[],
};

for (const filePath of files) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    
    // Check for {t.common.loading} that should be literals
    if (line.includes('{t.common.loading}')) {
      // Context check: is this in a place where literal would be better?
      const contexts = [
        { pattern: />(Português|English|Español).*</, type: 'language-name' },
        { pattern: /formatter.*{t\.common\.loading}/, type: 'formatter-label' },
        { pattern: /name=.*{t\.common\.loading}/, type: 'chart-name' },
        { pattern: /value=.*{t\.common\.loading}/, type: 'attribute-value' },
      ];
      
      for (const ctx of contexts) {
        if (ctx.pattern.test(line)) {
          analysis.issues.push({
            file: filePath.split('/').pop(),
            line: lineNum,
            type: ctx.type,
            content: line.trim(),
          });
          analysis.filesWithIssues++;
          break;
        }
      }
    }
  });
}

console.log(`📊 Analysis Results:`);
console.log(`   Total files scanned: ${analysis.totalFiles}`);
console.log(`   Files with issues: ${analysis.filesWithIssues}`);
console.log(`   Total issues found: ${analysis.issues.length}\n`);

if (analysis.issues.length > 0) {
  console.log('🔴 Issues by type:');
  const byType = analysis.issues.reduce((acc: any, issue: any) => {
    acc[issue.type] = (acc[issue.type] || 0) + 1;
    return acc;
  }, {});
  
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });
  console.log();
}

// Save analysis
writeFileSync('scripts/recovery-analysis.json', JSON.stringify(analysis, null, 2));
console.log('✅ Analysis saved to scripts/recovery-analysis.json\n');

console.log('🔧 PHASE 2: Creating fixes...\n');

// Specific fixes for known issues
const fixes = [
  // AdminDashboard - language dropdown
  {
    file: 'client/src/pages/admin/AdminDashboard.tsx',
    search: />\{t\.common\.loading\}<\/DropdownMenuItem>/g,
    replace: '>Português (BR)</DropdownMenuItem>',
    description: 'Restore PT-BR language name'
  },
  
  // TelemetriaPage - chart labels
  {
    file: 'client/src/pages/admin/TelemetriaPage.tsx',
    search: /name="\{t\.common\.loading\}"/g,
    replace: 'name="Média"',
    description: 'Restore chart name label'
  },
];

let fixesApplied = 0;

for (const fix of fixes) {
  try {
    let content = readFileSync(fix.file, 'utf-8');
    const before = content;
    
    if (fix.search instanceof RegExp) {
      content = content.replace(fix.search, fix.replace);
    } else {
      content = content.replace(fix.search, fix.replace);
    }
    
    if (content !== before) {
      writeFileSync(fix.file, content, 'utf-8');
      console.log(`✅ ${fix.file.split('/').pop()}: ${fix.description}`);
      fixesApplied++;
    }
  } catch (error: any) {
    console.log(`⚠️  ${fix.file.split('/').pop()}: ${error.message}`);
  }
}

console.log(`\n📊 ${fixesApplied} fixes applied`);
console.log('\n✅ Recovery plan executed. Review changes and run LSP check.');
