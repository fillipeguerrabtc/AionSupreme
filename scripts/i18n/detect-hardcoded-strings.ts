import { Project, SyntaxKind, Node } from 'ts-morph';
import { writeFileSync } from 'fs';

const PORTUGUESE_PATTERNS = [
  /[àáâãäåèéêëìíîïòóôõöùúûü]/i,
  /ção\b/i,
  /\b(de|para|em|com|por|sem|sobre|entre|durante|após|antes)\b/i,
  /\b(Salvar|Atualizar|Excluir|Erro|Scan|Dataset|Carregando|Buscando)\b/,
  /\b(completo|sucesso|falhou|concluído|pendente|ativo)\b/i,
];

function isProbablyPortuguese(text: string): boolean {
  if (text.trim().length < 3) return false;
  if (/^[A-Z_]+$/.test(text)) return false;
  if (/^\d+$/.test(text)) return false;
  if (text.startsWith('data-') || text.startsWith('aria-')) return false;
  if (text.includes('className') || text.includes('onClick')) return false;
  
  return PORTUGUESE_PATTERNS.some(pattern => pattern.test(text));
}

function generateSuggestedKey(filePath: string, text: string, context: string): string {
  const fileName = filePath.split('/').pop()?.replace('.tsx', '') || 'unknown';
  const section = fileName.toLowerCase().replace(/page|tab/gi, '');
  
  let keyPart = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 3)
    .join('');
  
  if (context.includes('toast') || context.includes('title') || context.includes('description')) {
    keyPart = 'toast.' + keyPart;
  } else if (context.includes('Button') || context.includes('isPending')) {
    keyPart = 'button.' + keyPart;
  } else if (context.includes('placeholder')) {
    keyPart = 'placeholder.' + keyPart;
  }
  
  return `admin.${section}.${keyPart}`;
}

interface HardcodedString {
  file: string;
  line: number;
  column: number;
  text: string;
  context: string;
  suggestedKey: string;
}

function detectHardcodedStrings(filePaths: string[]): HardcodedString[] {
  const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
  });

  const results: HardcodedString[] = [];

  for (const filePath of filePaths) {
    const sourceFile = project.addSourceFileAtPath(filePath);
    
    sourceFile.forEachDescendant((node: Node) => {
      if (Node.isStringLiteral(node)) {
        const text = node.getLiteralText();
        
        if (!isProbablyPortuguese(text)) return;
        
        const parent = node.getParent();
        const grandParent = parent?.getParent();
        
        let alreadyWrapped = false;
        let currentNode: Node | undefined = parent;
        while (currentNode) {
          if (Node.isCallExpression(currentNode)) {
            const expression = currentNode.getExpression();
            if (Node.isIdentifier(expression) && expression.getText() === 't') {
              alreadyWrapped = true;
              break;
            }
          }
          currentNode = currentNode.getParent();
        }
        
        if (alreadyWrapped) return;
        
        const lineNumber = sourceFile.getLineAndColumnAtPos(node.getStart()).line;
        const columnNumber = sourceFile.getLineAndColumnAtPos(node.getStart()).column;
        const context = parent?.getText() || '';
        
        const suggestedKey = generateSuggestedKey(filePath, text, context);
        
        results.push({
          file: filePath,
          line: lineNumber,
          column: columnNumber,
          text: text,
          context: context.slice(0, 100),
          suggestedKey,
        });
      }
      
      else if (Node.isJsxText(node)) {
        const text = node.getText().trim();
        
        if (!isProbablyPortuguese(text)) return;
        
        let alreadyWrapped = false;
        const parent = node.getParent();
        if (Node.isJsxElement(parent) || Node.isJsxSelfClosingElement(parent)) {
          const children = Node.isJsxElement(parent) ? parent.getJsxChildren() : [];
          alreadyWrapped = children.some(child => {
            if (Node.isJsxExpression(child)) {
              const expr = child.getExpression();
              if (Node.isCallExpression(expr)) {
                const callExpr = expr.getExpression();
                if (Node.isIdentifier(callExpr) && callExpr.getText() === 't') {
                  return true;
                }
              }
            }
            return false;
          });
        }
        
        if (alreadyWrapped) return;
        
        const lineNumber = sourceFile.getLineAndColumnAtPos(node.getStart()).line;
        const columnNumber = sourceFile.getLineAndColumnAtPos(node.getStart()).column;
        const context = parent?.getText() || '';
        
        const suggestedKey = generateSuggestedKey(filePath, text, context);
        
        results.push({
          file: filePath,
          line: lineNumber,
          column: columnNumber,
          text: text,
          context: context.slice(0, 100),
          suggestedKey,
        });
      }
    });
  }

  return results;
}

const allAdminFiles = [
  'client/src/pages/admin/AdminDashboard.tsx',
  'client/src/pages/admin/AgentsPage.tsx',
  'client/src/pages/admin/AutoApprovalPage.tsx',
  'client/src/pages/admin/AutoEvolutionTab.tsx',
  'client/src/pages/admin/CostHistoryTab.tsx',
  'client/src/pages/admin/CurationQueuePage.tsx',
  'client/src/pages/admin/DatasetsTab.tsx',
  'client/src/pages/admin/FederatedTrainingTab.tsx',
  'client/src/pages/admin/gpu-dashboard.tsx',
  'client/src/pages/admin/GPUManagementTab.tsx',
  'client/src/pages/admin/GPUOverviewPage.tsx',
  'client/src/pages/admin/ImageSearchPage.tsx',
  'client/src/pages/admin/ImagesGalleryPage.tsx',
  'client/src/pages/admin/JobsPage.tsx',
  'client/src/pages/admin/KnowledgeBasePage.tsx',
  'client/src/pages/admin/KnowledgeBaseTab.tsx',
  'client/src/pages/admin/LifecyclePoliciesTab.tsx',
  'client/src/pages/admin/NamespacesPage.tsx',
  'client/src/pages/admin/PermissionsPage.tsx',
  'client/src/pages/admin/TelemetriaPage.tsx',
  'client/src/pages/admin/TokenHistoryTab.tsx',
  'client/src/pages/admin/TokenMonitoring.tsx',
  'client/src/pages/admin/UsersPage.tsx',
  'client/src/pages/admin/VisionPage.tsx',
];

console.log('🔍 Detecting hardcoded Portuguese strings in ALL 24 admin pages...\n');
console.log(`Scanning ${allAdminFiles.length} files...\n`);

const results = detectHardcodedStrings(allAdminFiles);

console.log(`✅ Found ${results.length} hardcoded strings\n`);

results.slice(0, 20).forEach((result, index) => {
  console.log(`${index + 1}. ${result.file}:${result.line}:${result.column}`);
  console.log(`   Text: "${result.text}"`);
  console.log(`   Suggested key: ${result.suggestedKey}`);
  console.log(`   Context: ${result.context.slice(0, 80)}...`);
  console.log();
});

writeFileSync(
  'scripts/i18n/hardcoded-strings-inventory.json',
  JSON.stringify(results, null, 2)
);

console.log(`\n📝 Full inventory saved to: scripts/i18n/hardcoded-strings-inventory.json`);
console.log(`📊 Total hardcoded strings: ${results.length}`);

const byFile = results.reduce((acc, r) => {
  acc[r.file] = (acc[r.file] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

console.log('\n📂 Breakdown by file:');
Object.entries(byFile).forEach(([file, count]) => {
  console.log(`   ${file}: ${count} strings`);
});
