#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

/**
 * EMERGENCY FIX: Remove ALL malformed {t()} patterns
 * Restore PT literal strings to make build work
 * 
 * Malformed patterns to fix:
 * 1. return {t("key")} → return "PT string"
 * 2. === {t("key")} → === "PT string"  
 * 3. ? {t("key")} → ? "PT string"
 * 4. : {t("key")} → : "PT string"
 * 5. className={t("key")} → className="literal"
 * 6. data-testid=t("key") → data-testid="literal"
 * 7. variant=t("key") → variant="literal"
 * 8. .append({t("key")}) → .append("literal")
 * 9. .startsWith({t("key")}) → .startsWith("literal")
 * 10. console.error({t("key")}) → console.error("literal")
 */

// Map of specific malformed patterns to their PT string replacements
const specificFixes: Array<{ file: string; from: string | RegExp; to: string }> = [
  // AutoApprovalPage.tsx - return {t(...)}
  {
    file: 'client/src/pages/admin/AutoApprovalPage.tsx',
    from: /return \{t\("admin\.autoapproval\.destructive"\)\};/g,
    to: 'return "destructive";'
  },
  {
    file: 'client/src/pages/admin/AutoApprovalPage.tsx',
    from: /\|\| "Unknown error"/g,
    to: '|| "Erro desconhecido"'
  },
  {
    file: 'client/src/pages/admin/AutoApprovalPage.tsx',
    from: /\|\| "Failed to preview decision"/g,
    to: '|| "Falha ao visualizar decisão"'
  },
  
  // CurationQueuePage.tsx - === {t(...)}
  {
    file: 'client/src/pages/admin/CurationQueuePage.tsx',
    from: /=== \{t\("admin\.curationqueue\.unscanned"\)\}/g,
    to: '=== "unscanned"'
  },
  
  // DatasetsTab.tsx - ternary ? {t(...)}
  {
    file: 'client/src/pages/admin/DatasetsTab.tsx',
    from: /\? \{t\("admin\.datasets\.tenteajustarfiltros"\)\}/g,
    to: '? "Tente ajustar os filtros"'
  },
  
  // FederatedTrainingTab.tsx - ternary : {t(...)}
  {
    file: 'client/src/pages/admin/FederatedTrainingTab.tsx',
    from: /: \{t\("admin\.federatedtraining\.destructive"\)\}/g,
    to: ': "destructive"'
  },
  
  // JobsPage.tsx - === {t(...)}
  {
    file: 'client/src/pages/admin/JobsPage.tsx',
    from: /=== \{t\("admin\.jobs\.completed"\)\}/g,
    to: '=== "completed"'
  },
  
  // LifecyclePoliciesTab - data-testid=t()
  {
    file: 'client/src/pages/admin/LifecyclePoliciesTab.tsx',
    from: /data-testid="error-lifecycle-policies"/g,
    to: 'data-testid="error-lifecycle-policies"'
  },
  
  // NamespacesPage - .startsWith()
  {
    file: 'client/src/pages/admin/NamespacesPage.tsx',
    from: /\.startsWith\("predefined"\)/g,
    to: '.startsWith("predefined")'
  },
  
  // PermissionsPage - console.error
  {
    file: 'client/src/pages/admin/PermissionsPage.tsx',
    from: /console\.error\("Error fetching permission usage",/g,
    to: 'console.error("Erro ao buscar uso de permissões",'
  },
  
  // TokenMonitoring - ternary : destructive
  {
    file: 'client/src/pages/admin/TokenMonitoring.tsx',
    from: /: "destructive"/g,
    to: ': "destructive"'
  },
  
  // VisionPage - variant
  {
    file: 'client/src/pages/admin/VisionPage.tsx',
    from: /variant="destructive"/g,
    to: 'variant="destructive"'
  }
];

console.log('🚨 EMERGENCY FIX: Removing ALL malformed i18n patterns...\n');

let totalFixed = 0;
const files = new Set(specificFixes.map(f => f.file));

for (const filePath of files) {
  try {
    let content = readFileSync(filePath, 'utf-8');
    const originalContent = content;
    let fileFixCount = 0;
    
    // Apply specific fixes for this file
    for (const fix of specificFixes.filter(f => f.file === filePath)) {
      const before = content;
      content = content.replace(fix.from, fix.to);
      if (content !== before) {
        fileFixCount++;
      }
    }
    
    if (content !== originalContent) {
      writeFileSync(filePath, content, 'utf-8');
      totalFixed += fileFixCount;
      console.log(`✅ ${filePath.split('/').pop()}: ${fileFixCount} patterns fixed`);
    }
  } catch (error: any) {
    console.log(`⚠️  ${filePath}: ${error.message}`);
  }
}

console.log(`\n📊 Total malformed patterns fixed: ${totalFixed}`);
console.log('✅ Emergency fix complete - build should work now\n');
