import { Project, Node, SyntaxKind } from 'ts-morph';
import { readFileSync, writeFileSync } from 'fs';

interface HardcodedString {
  file: string;
  line: number;
  column: number;
  text: string;
  context: string;
  suggestedKey: string;
}

const COMMON_STRINGS: Record<string, string> = {
  'Carregando...': 'common.loading',
  'Salvando...': 'common.saving',
  'Salvar': 'common.save',
  'Salvar Alterações': 'common.saveChanges',
  'Cancelar': 'common.cancel',
  'Confirmar': 'common.confirm',
  'Excluir': 'common.delete',
  'Editar': 'common.edit',
  'Atualizar': 'common.update',
  'Atualizando...': 'common.updating',
  'Criar': 'common.create',
  'Buscar': 'common.search',
  'Filtrar': 'common.filter',
  'Ações': 'common.actions',
  'Erro': 'common.error',
  'Sucesso': 'common.success',
  'Confirmação': 'common.confirmation',
  'Atenção': 'common.warning',
  'Fechar': 'common.close',
  'Voltar': 'common.back',
  'Próximo': 'common.next',
  'Anterior': 'common.previous',
  'Sim': 'common.yes',
  'Não': 'common.no',
  'OK': 'common.ok',
  'Detalhes': 'common.details',
  'Descrição': 'common.description',
  'Nome': 'common.name',
  'Data': 'common.date',
  'Status': 'common.status',
  'Tipo': 'common.type',
  'Total': 'common.total',
  'Nenhum resultado encontrado': 'common.noResults',
  'Processando...': 'common.processing',
  'Aguarde...': 'common.pleaseWait',
  'Escaneando...': 'common.scanning',
};

function refineKey(text: string, suggestedKey: string): string {
  if (COMMON_STRINGS[text]) {
    return COMMON_STRINGS[text];
  }
  
  const cleaned = suggestedKey.replace(/\.\w{20,}$/, match => {
    const words = text.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 4)
      .join('');
    
    return `.${words}`;
  });
  
  return cleaned;
}

function convertFile(filePath: string, textToKeyMap: Map<string, string>): number {
  const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
  });

  const sourceFile = project.addSourceFileAtPath(filePath);
  let conversionsCount = 0;
  const converted = new Set<string>();

  sourceFile.forEachDescendant((node) => {
    if (Node.isStringLiteral(node)) {
      const text = node.getLiteralText();
      const key = textToKeyMap.get(text);
      const nodePos = node.getPos();
      
      if (key && !converted.has(nodePos + text)) {
        const parent = node.getParent();
        
        let alreadyWrapped = false;
        let currentNode = parent;
        while (currentNode) {
          if (Node.isCallExpression(currentNode)) {
            const expr = currentNode.getExpression();
            if (Node.isIdentifier(expr) && expr.getText() === 't') {
              alreadyWrapped = true;
              break;
            }
          }
          currentNode = currentNode.getParent();
        }
        
        if (alreadyWrapped) return;
        
        if (Node.isJsxAttribute(parent)) {
          node.replaceWithText(`{t("${key}")}`);
        } else {
          node.replaceWithText(`t("${key}")`);
        }
        
        converted.add(nodePos + text);
        conversionsCount++;
        console.log(`   ✓ "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}" → t("${key}")`);
      }
    }
    
    else if (Node.isJsxText(node)) {
      const text = node.getText().trim();
      const key = textToKeyMap.get(text);
      const nodePos = node.getPos();
      
      if (key && text.length > 0 && !converted.has(nodePos + text)) {
        const parent = node.getParent();
        let alreadyWrapped = false;
        
        if (Node.isJsxElement(parent)) {
          const children = parent.getJsxChildren();
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
        
        const fullText = node.getText();
        const leadingWhitespace = fullText.match(/^\s*/)?.[0] || '';
        const trailingWhitespace = fullText.match(/\s*$/)?.[0] || '';
        
        node.replaceWithText(`${leadingWhitespace}{t("${key}")}${trailingWhitespace}`);
        
        converted.add(nodePos + text);
        conversionsCount++;
        console.log(`   ✓ JSX: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}" → {t("${key}")}`);
      }
    }
  });

  if (conversionsCount > 0) {
    sourceFile.saveSync();
    console.log(`\n✅ Saved ${filePath} (${conversionsCount} conversions)\n`);
  }

  return conversionsCount;
}

const inventoryPath = 'scripts/i18n/hardcoded-strings-inventory.json';
const inventory: HardcodedString[] = JSON.parse(readFileSync(inventoryPath, 'utf-8'));

console.log(`📋 Loaded ${inventory.length} hardcoded strings from inventory\n`);

const textToKeyMap = new Map<string, string>();
inventory.forEach(item => {
  const refinedKey = refineKey(item.text, item.suggestedKey);
  if (!textToKeyMap.has(item.text)) {
    textToKeyMap.set(item.text, refinedKey);
  }
});

const fileGroups = inventory.reduce((acc, item) => {
  if (!acc[item.file]) acc[item.file] = [];
  acc[item.file].push(item);
  return acc;
}, {} as Record<string, HardcodedString[]>);

let totalConversions = 0;

for (const file of Object.keys(fileGroups)) {
  console.log(`\n🔄 Processing: ${file} (${fileGroups[file].length} strings)`);
  const count = convertFile(file, textToKeyMap);
  totalConversions += count;
}

console.log(`\n\n🎉 CONVERSION COMPLETE!`);
console.log(`📊 Total conversions: ${totalConversions}/${inventory.length}`);

const uniqueKeys = Array.from(new Set(Array.from(textToKeyMap.values())));

const keysByPrefix = uniqueKeys.reduce((acc, key) => {
  const prefix = key.split('.')[0];
  if (!acc[prefix]) acc[prefix] = [];
  acc[prefix].push(key);
  return acc;
}, {} as Record<string, string[]>);

console.log(`\n📂 Keys by namespace:`);
Object.entries(keysByPrefix).forEach(([prefix, keys]) => {
  console.log(`   ${prefix}: ${keys.length} keys`);
});

const translationKeys = uniqueKeys.reduce((acc, key) => {
  const parts = key.split('.');
  let current = acc;
  
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }
  
  const lastPart = parts[parts.length - 1];
  const originalText = Array.from(textToKeyMap.entries()).find(([_, v]) => v === key)?.[0] || '';
  current[lastPart] = originalText;
  
  return acc;
}, {} as any);

writeFileSync(
  'scripts/i18n/generated-translations-pt.json',
  JSON.stringify(translationKeys, null, 2)
);

console.log(`\n✅ Generated PT translation keys: scripts/i18n/generated-translations-pt.json`);
console.log(`\n⚠️  NEXT STEPS:`);
console.log(`   1. Review the converted files (git diff)`);
console.log(`   2. Merge generated-translations-pt.json into shared/locales/pt.ts`);
console.log(`   3. Translate keys to EN/ES in shared/locales/{en,es}.ts`);
console.log(`   4. Test the application`);
