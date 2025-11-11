#!/usr/bin/env tsx
/**
 * Fix hardcoded "Loading..." strings with correct t.* paths
 */

import { readFileSync, writeFileSync } from 'fs';

const fixes = [
  // AdminDashboard.tsx - linha 467: subtitle
  {
    file: 'client/src/pages/admin/AdminDashboard.tsx',
    from: '<p className="text-xs text-muted-foreground">"Loading..."</p>',
    to: '<p className="text-xs text-muted-foreground">{t.admin.subtitle}</p>'
  },
  // AdminDashboard.tsx - linha 492: nome do idioma PT-BR
  {
    file: 'client/src/pages/admin/AdminDashboard.tsx',
    from: '>"Loading..."</DropdownMenuItem>',
    to: '>Português (BR)</DropdownMenuItem>'
  },
  // AdminDashboard.tsx - outras ocorrências genéricas
  {
    file: 'client/src/pages/admin/AdminDashboard.tsx',
    from: /"Loading\.\.\."/g,
    to: '{t.common.loading}'
  },
];

console.log('🔧 Fixing hardcoded "Loading..." strings...\n');

for (const fix of fixes) {
  try {
    let content = readFileSync(fix.file, 'utf-8');
    const originalContent = content;
    
    content = content.replace(fix.from, fix.to);
    
    if (content !== originalContent) {
      writeFileSync(fix.file, content, 'utf-8');
      console.log(`✅ ${fix.file.split('/').pop()}`);
    }
  } catch (error: any) {
    console.log(`⚠️  ${fix.file}: ${error.message}`);
  }
}

// Agora fix global em TODOS os arquivos admin
const adminFiles = [
  'LifecyclePoliciesTab.tsx',
  'AgentsPage.tsx',
  'FederatedTrainingTab.tsx',
  'NamespacesPage.tsx',
  'KnowledgeBaseTab.tsx',
  'ImagesGalleryPage.tsx',
  'TokenMonitoring.tsx',
  'KnowledgeBasePage.tsx',
  'GPUOverviewPage.tsx',
  'DatasetsTab.tsx',
  'CurationQueuePage.tsx',
  'TelemetriaPage.tsx'
];

for (const file of adminFiles) {
  const filePath = `client/src/pages/admin/${file}`;
  try {
    let content = readFileSync(filePath, 'utf-8');
    const originalContent = content;
    
    // Substitui "Loading..." por {t.common.loading}
    content = content.replace(/"Loading\.\.\."/g, '{t.common.loading}');
    
    if (content !== originalContent) {
      writeFileSync(filePath, content, 'utf-8');
      console.log(`✅ ${file}`);
    }
  } catch (error: any) {
    console.log(`⚠️  ${file}: ${error.message}`);
  }
}

console.log('\n✅ All files fixed!');
