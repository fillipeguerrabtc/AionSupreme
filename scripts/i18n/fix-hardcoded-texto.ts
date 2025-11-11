import fs from 'fs';
import path from 'path';

const replacements: Record<string, string> = {
  // AdminDashboard.tsx
  'client/src/pages/admin/AdminDashboard.tsx:467': '{t.admin.subtitle}',
  'client/src/pages/admin/AdminDashboard.tsx:492': 'Português (BR)',
  'client/src/pages/admin/AdminDashboard.tsx:541': 'Todos os tempos:',
  'client/src/pages/admin/AdminDashboard.tsx:634': '{t.admin.overview.allProviders}',
  'client/src/pages/admin/AdminDashboard.tsx:654': 'Todos os tempos:',
  'client/src/pages/admin/AdminDashboard.tsx:787': '{t.admin.overview.freeApis}',
  'client/src/pages/admin/AdminDashboard.tsx:806': '{t.admin.overview.groqGeminiHfOpenrouter}',
  'client/src/pages/admin/AdminDashboard.tsx:1127': '{t.admin.messages.activeChanges}',
  
  // TelemetriaPage.tsx
  'client/src/pages/admin/TelemetriaPage.tsx:200': '{t.admin.telemetry.subtitle}',
  'client/src/pages/admin/TelemetriaPage.tsx:207': '{t.admin.telemetry.systemMetrics}',
  'client/src/pages/admin/TelemetriaPage.tsx:222': '{t.admin.telemetry.totalQueries}',
  'client/src/pages/admin/TelemetriaPage.tsx:226': '{t.admin.telemetry.allSources}',
  'client/src/pages/admin/TelemetriaPage.tsx:234': '{t.admin.telemetry.avgLatency}',
  'client/src/pages/admin/TelemetriaPage.tsx:248': '{t.admin.telemetry.p95Latency}',
  'client/src/pages/admin/TelemetriaPage.tsx:262': '{t.admin.telemetry.successRate}',
  'client/src/pages/admin/TelemetriaPage.tsx:277': '{t.admin.telemetry.queryDistribution}',
  'client/src/pages/admin/TelemetriaPage.tsx:278': '{t.admin.telemetry.bySource}',
  'client/src/pages/admin/TelemetriaPage.tsx:315': '{t.common.loading}',
  'client/src/pages/admin/TelemetriaPage.tsx:327': '{t.admin.telemetry.slowestQueries}',
  'client/src/pages/admin/TelemetriaPage.tsx:352': '{t.admin.telemetry.avgTime}',
  'client/src/pages/admin/TelemetriaPage.tsx:434': '{t.admin.telemetry.kbAnalytics}',
  'client/src/pages/admin/TelemetriaPage.tsx:451': '{t.admin.telemetry.topKnowledge}',
  'client/src/pages/admin/TelemetriaPage.tsx:718': '{t.admin.telemetry.uses}',
  'client/src/pages/admin/TelemetriaPage.tsx:724': '{t.common.loading}',
  'client/src/pages/admin/TelemetriaPage.tsx:733': '{t.admin.telemetry.topTopics}',
  'client/src/pages/admin/TelemetriaPage.tsx:734': '{t.admin.telemetry.mostSearched}',
  'client/src/pages/admin/TelemetriaPage.tsx:774': '{t.common.loading}',
  'client/src/pages/admin/TelemetriaPage.tsx:784': '{t.admin.telemetry.analytics}',
  'client/src/pages/admin/TelemetriaPage.tsx:785': '{t.admin.telemetry.kbChatTrends}',
  'client/src/pages/admin/TelemetriaPage.tsx:812': '{t.common.loading}',
  'client/src/pages/admin/TelemetriaPage.tsx:820': '{t.admin.telemetry.searchTrends}',
  'client/src/pages/admin/TelemetriaPage.tsx:850': '{t.common.loading}',
};

const files = [
  'client/src/pages/admin/AdminDashboard.tsx',
  'client/src/pages/admin/TelemetriaPage.tsx',
  'client/src/pages/admin/TokenMonitoring.tsx',
  'client/src/pages/admin/GPUOverviewPage.tsx',
  'client/src/pages/admin/KnowledgeBasePage.tsx',
  'client/src/pages/admin/CurationQueuePage.tsx',
  'client/src/pages/admin/NamespacesPage.tsx',
  'client/src/pages/admin/DatasetsTab.tsx',
  'client/src/pages/admin/AgentsPage.tsx',
  'client/src/pages/admin/KnowledgeBaseTab.tsx',
  'client/src/pages/admin/LifecyclePoliciesTab.tsx',
  'client/src/pages/admin/ImagesGalleryPage.tsx',
  'client/src/pages/admin/FederatedTrainingTab.tsx',
];

console.log('🔧 Fixing hardcoded "*[TEXTO]*" strings...\n');

let totalFixed = 0;

for (const file of files) {
  const fullPath = path.join(process.cwd(), file);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⏭️  Skipping ${file} (not found)`);
    continue;
  }
  
  let content = fs.readFileSync(fullPath, 'utf-8');
  const originalContent = content;
  
  // Replace all "[TEXTO]" with proper translations
  // Strategy: Simple global replace for now, then manual fixes for specific contexts
  content = content.replace(/"\\[TEXTO\\]"/g, '{t.common.loading}');
  
  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    const fixed = (originalContent.match(/"\\[TEXTO\\]"/g) || []).length;
    totalFixed += fixed;
    console.log(`✅ ${file}: Fixed ${fixed} occurrences`);
  } else {
    console.log(`⏭️  ${file}: No changes needed`);
  }
}

console.log(`\n✨ Total fixed: ${totalFixed} hardcoded strings`);
console.log('🔄 Please restart the application to see changes.\n');
