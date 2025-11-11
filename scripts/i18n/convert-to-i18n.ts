import { Project, SyntaxKind, Node, SourceFile } from 'ts-morph';
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
};

function refineKey(text: string, suggestedKey: string): string {
  if (COMMON_STRINGS[text]) {
    return COMMON_STRINGS[text];
  }
  
  if (text.toLowerCase().includes('erro ao')) {
    const action = text.toLowerCase().replace('erro ao ', '').split(' ')[0];
    return suggestedKey.replace(/toast\.\w+/, `toast.error${action.charAt(0).toUpperCase() + action.slice(1)}`);
  }
  
  if (text.endsWith('...') && text.length < 20) {
    const base = text.replace('...', '').toLowerCase();
    const normalized = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return `common.${normalized.replace(/\s+/g, '')}`;
  }
  
  if (text.toLowerCase().includes('tem certeza')) {
    return suggestedKey.replace(/\.\w+$/, '.confirmDelete');
  }
  
  return suggestedKey;
}

function convertFile(filePath: string, strings: HardcodedString[]): number {
  const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
  });

  const sourceFile = project.addSourceFileAtPath(filePath);
  let conversionsCount = 0;

  const sortedStrings = strings
    .filter(s => s.file === filePath)
    .sort((a, b) => {
      if (a.line !== b.line) return b.line - a.line;
      return b.column - a.column;
    });

  for (const item of sortedStrings) {
    const refinedKey = refineKey(item.text, item.suggestedKey);
    
    const startPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(item.line - 1, item.column);
    const endPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(item.line - 1, item.column + item.text.length + 2);
    
    const nodes = sourceFile.getDescendants().filter(node => {
      const pos = node.getStart();
      return pos >= startPos && pos <= endPos;
    });

    for (const node of nodes) {
      if (Node.isStringLiteral(node) && node.getLiteralText() === item.text) {
        const parent = node.getParent();
        
        if (Node.isJsxAttribute(parent)) {
          node.replaceWithText(`{t("${refinedKey}")}`);
        } else {
          node.replaceWithText(`t("${refinedKey}")`);
        }
        
        conversionsCount++;
        console.log(`   ✓ Converted: "${item.text}" → t("${refinedKey}")`);
        break;
      }
      
      else if (Node.isJsxText(node) && node.getText().trim() === item.text) {
        const trimmed = node.getText();
        const leadingWhitespace = trimmed.match(/^\s*/)?.[0] || '';
        const trailingWhitespace = trimmed.match(/\s*$/)?.[0] || '';
        
        node.replaceWithText(`${leadingWhitespace}{t("${refinedKey}")}${trailingWhitespace}`);
        
        conversionsCount++;
        console.log(`   ✓ Converted JSX: "${item.text}" → {t("${refinedKey}")}`);
        break;
      }
    }
  }

  if (conversionsCount > 0) {
    sourceFile.saveSync();
    console.log(`\n✅ Saved ${filePath} with ${conversionsCount} conversions\n`);
  }

  return conversionsCount;
}

const inventoryPath = 'scripts/i18n/hardcoded-strings-inventory.json';
const inventory: HardcodedString[] = JSON.parse(readFileSync(inventoryPath, 'utf-8'));

console.log(`📋 Loaded ${inventory.length} hardcoded strings from inventory\n`);

const fileGroups = inventory.reduce((acc, item) => {
  if (!acc[item.file]) acc[item.file] = [];
  acc[item.file].push(item);
  return acc;
}, {} as Record<string, HardcodedString[]>);

let totalConversions = 0;

for (const [file, strings] of Object.entries(fileGroups)) {
  console.log(`\n🔄 Processing: ${file} (${strings.length} strings)`);
  const count = convertFile(file, strings);
  totalConversions += count;
}

console.log(`\n\n🎉 CONVERSION COMPLETE!`);
console.log(`📊 Total conversions: ${totalConversions}/${inventory.length}`);

const uniqueKeys = new Set<string>();
inventory.forEach(item => {
  const refinedKey = refineKey(item.text, item.suggestedKey);
  uniqueKeys.add(refinedKey);
});

const keysByPrefix = Array.from(uniqueKeys).reduce((acc, key) => {
  const prefix = key.split('.')[0];
  if (!acc[prefix]) acc[prefix] = [];
  acc[prefix].push(key);
  return acc;
}, {} as Record<string, string[]>);

console.log(`\n📂 Keys by namespace:`);
Object.entries(keysByPrefix).forEach(([prefix, keys]) => {
  console.log(`   ${prefix}: ${keys.length} keys`);
});

const translationKeys = Array.from(uniqueKeys).reduce((acc, key) => {
  const parts = key.split('.');
  let current = acc;
  
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }
  
  const lastPart = parts[parts.length - 1];
  const originalText = inventory.find(item => refineKey(item.text, item.suggestedKey) === key)?.text || '';
  current[lastPart] = originalText;
  
  return acc;
}, {} as any);

writeFileSync(
  'scripts/i18n/generated-translations-pt.json',
  JSON.stringify(translationKeys, null, 2)
);

console.log(`\n✅ Generated translation keys saved to: scripts/i18n/generated-translations-pt.json`);
console.log(`\n⚠️  NEXT STEPS:`);
console.log(`   1. Review the converted files`);
console.log(`   2. Merge generated-translations-pt.json into shared/locales/pt.ts`);
console.log(`   3. Translate to EN/ES`);
console.log(`   4. Run the app to test`);
