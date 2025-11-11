#!/usr/bin/env tsx
/**
 * FINAL [PT] FIX - Precise contextual replacement based on inventory
 */

import { readFileSync, writeFileSync } from 'fs';

const precisionFixes = [
  // AdminDashboard.tsx - error messages
  {
    file: 'client/src/pages/admin/AdminDashboard.tsx',
    from: 'const errorData = await res.json().catch(() => ({ message: "[PT]" }));',
    to: 'const errorData = await res.json().catch(() => ({ message: "Erro ao processar requisição" }));'
  },
  
  // AgentsPage.tsx - toast titles
  {
    file: 'client/src/pages/admin/AgentsPage.tsx',
    from: /title: "\[PT\]",\s*/g,
    to: 'title: "Sucesso", '
  },
  {
    file: 'client/src/pages/admin/AgentsPage.tsx',
    from: /title="\[PT\]"/g,
    to: 'title="Ação"'
  },
  {
    file: 'client/src/pages/admin/AgentsPage.tsx',
    from: /htmlFor="\[PT\]"/g,
    to: 'htmlFor="field"'
  },
  {
    file: 'client/src/pages/admin/AgentsPage.tsx',
    from: /id="\[PT\]"/g,
    to: 'id="field"'
  },
  {
    file: 'client/src/pages/admin/AgentsPage.tsx',
    from: /"\[PT\]"/g,
    to: '"Carregando..."'
  },
  
  // CurationQueuePage.tsx - all placeholders
  {
    file: 'client/src/pages/admin/CurationQueuePage.tsx',
    from: /title: "\[PT\]",/g,
    to: 'title: "Sucesso",'
  },
  {
    file: 'client/src/pages/admin/CurationQueuePage.tsx',
    from: /title="\[PT\]"/g,
    to: 'title="Ação"'
  },
  {
    file: 'client/src/pages/admin/CurationQueuePage.tsx',
    from: /placeholder="\[PT\]"/g,
    to: 'placeholder="Digite aqui..."'
  },
  {
    file: 'client/src/pages/admin/CurationQueuePage.tsx',
    from: /"Gerando..." : "\[PT\]"/,
    to: '"Gerando..." : "Gerar Descrições"'
  },
  {
    file: 'client/src/pages/admin/CurationQueuePage.tsx',
    from: /{selectedIds\.size} "\[PT\]"/g,
    to: '{selectedIds.size} itens'
  },
  {
    file: 'client/src/pages/admin/CurationQueuePage.tsx',
    from: /"video" \? "\[PT\]" : "Imagem"/,
    to: '"video" ? "Vídeo" : "Imagem"'
  },
  {
    file: 'client/src/pages/admin/CurationQueuePage.tsx',
    from: /"video" \? "\[PT\]" : "\[PT\]"/,
    to: '"video" ? "Reproduzir" : "Visualizar"'
  },
];

console.log('🎯 FINAL PRECISION FIX - Contextual [PT] replacement\n');

let totalFixed = 0;

for (const fix of precisionFixes) {
  try {
    let content = readFileSync(fix.file, 'utf-8');
    const originalContent = content;
    
    content = content.replace(fix.from, fix.to as string);
    
    if (content !== originalContent) {
      writeFileSync(fix.file, content, 'utf-8');
      totalFixed++;
      console.log(`✅ ${fix.file.split('/').pop()}`);
    }
  } catch (error: any) {
    console.log(`⚠️  ${fix.file.split('/').pop()}: ${error.message}`);
  }
}

console.log(`\n✅ ${totalFixed} files fixed with precision\n`);

// Final scan
console.log('📊 FINAL SCAN for remaining [PT]...');
const { execSync } = require('child_process');
const remaining = execSync('grep -r "\\[PT\\]" client/src/pages/admin/*.tsx 2>/dev/null | wc -l').toString().trim();

console.log(`\n${remaining === '0' ? '🎉' : '⚠️'} Remaining [PT]: ${remaining}`);

if (remaining === '0') {
  console.log('✅✅✅ ALL [PT] PLACEHOLDERS ELIMINATED! ✅✅✅');
} else {
  console.log(`\n⚠️ ${remaining} placeholders need manual review`);
}
