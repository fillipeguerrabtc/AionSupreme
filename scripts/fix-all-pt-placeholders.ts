#!/usr/bin/env tsx
/**
 * FIX ALL [PT] PLACEHOLDERS - Complete systematic replacement
 */

import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const fixes = [
  // DatasetsTab.tsx - toasts success/error
  {
    file: 'client/src/pages/admin/DatasetsTab.tsx',
    replacements: [
      { from: 'title: "[PT]",', to: 'title: "Sucesso",' },
      { from: 'description: "[PT]",', to: 'description: "Operação concluída com sucesso",' },
      { from: 'description: error instanceof Error ? error.message : "[PT]",', to: 'description: error instanceof Error ? error.message : "Erro ao processar operação",' },
      { from: 'placeholder="[PT]"', to: 'placeholder="Digite aqui..."' },
      { from: 'high: { color: "text-green-500", label: "[PT]" },', to: 'high: { color: "text-green-500", label: "Alta" },' },
      { from: 'medium: { color: "text-yellow-500", label: "[PT]" },', to: 'medium: { color: "text-yellow-500", label: "Média" },' },
      { from: 'low: { color: "text-gray-500", label: "[PT]" },', to: 'low: { color: "text-gray-500", label: "Baixa" },' },
      { from: ': "[PT]"}', to: ': "Nenhum dado disponível"}' },
      { from: 'Tem certeza que deseja excluir {selectedDatasets.size} "[PT]"', to: 'Tem certeza que deseja excluir {selectedDatasets.size} datasets?' },
      { from: 'htmlFor="[PT]"', to: 'htmlFor="instruction"' },
      { from: 'id="[PT]"', to: 'id="instruction"' },
    ]
  },
];

console.log('🔧 Fixing ALL [PT] placeholders...\n');

let totalFixed = 0;

for (const fix of fixes) {
  try {
    let content = readFileSync(fix.file, 'utf-8');
    const originalContent = content;
    let fileFixCount = 0;
    
    for (const replacement of fix.replacements) {
      const before = content;
      content = content.replace(new RegExp(escapeRegExp(replacement.from), 'g'), replacement.to);
      if (content !== before) {
        fileFixCount++;
      }
    }
    
    if (content !== originalContent) {
      writeFileSync(fix.file, content, 'utf-8');
      totalFixed += fileFixCount;
      console.log(`✅ ${fix.file.split('/').pop()}: ${fileFixCount} replacements`);
    }
  } catch (error: any) {
    console.log(`⚠️  ${fix.file}: ${error.message}`);
  }
}

// Now scan ALL admin files for remaining [PT]
console.log('\n📊 Scanning for remaining [PT] placeholders...');
const files = globSync('client/src/pages/admin/*.tsx');
let remainingCount = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const matches = content.match(/"\[PT\]"/g);
  if (matches) {
    remainingCount += matches.length;
    console.log(`⚠️  ${file.split('/').pop()}: ${matches.length} remaining`);
  }
}

console.log(`\n📊 Total fixed: ${totalFixed}`);
console.log(`⚠️  Remaining [PT]: ${remainingCount}`);

if (remainingCount === 0) {
  console.log('✅ ALL [PT] placeholders eliminated!');
} else {
  console.log('⚠️  Manual review needed for remaining placeholders');
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
