import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const COMMON_MAPPINGS: Record<string, string> = {
  'Carregando...': 'common.loading',
  'Salvando...': 'common.saving',
  'Processando...': 'common.processing',
  'Aguarde...': 'common.pleaseWait',
  'Escaneando...': 'common.scanning',
  'Atualizando...': 'common.updating',
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
  'Fechar': 'common.close',
  'Detalhes': 'common.details',
  'Descrição': 'common.description',
  'Nome': 'common.name',
  'Status': 'common.status',
  'Total': 'common.total',
};

function generateKey(text: string, fileName: string): string {
  if (COMMON_MAPPINGS[text]) {
    return COMMON_MAPPINGS[text];
  }
  
  const section = fileName.replace(/Page|Tab|\.tsx/gi, '').toLowerCase();
  
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4)
    .join('');
  
  return `admin.${section}.${normalized}`;
}

function convertFile(filePath: string): number {
  let content = readFileSync(filePath, 'utf-8');
  let conversions = 0;
  const fileName = filePath.split('/').pop() || '';
  
  const stringPattern = /"([A-ZÀ-Úa-zà-ú][^"]{8,})"/g;
  
  const replacements: Array<{ from: string; to: string; key: string }> = [];
  
  let match;
  while ((match = stringPattern.exec(content)) !== null) {
    const fullMatch = match[0];
    const text = match[1];
    
    if (
      fullMatch.includes('className') ||
      fullMatch.includes('data-testid') ||
      fullMatch.includes('href') ||
      fullMatch.includes('http') ||
      text.startsWith('text-') ||
      text.startsWith('bg-') ||
      text.startsWith('border-') ||
      text === 'Content-Type' ||
      text === 'application/json' ||
      text.includes('POST') ||
      text.includes('GET') ||
      text.includes('PATCH') ||
      text.includes('DELETE')
    ) {
      continue;
    }
    
    if (content.substring(Math.max(0, match.index - 3), match.index).includes('t(')) {
      continue;
    }
    
    const hasPortuguese = /ção|para|sem|com|por|em|de|Atualiz|Salv|Busca|Filtro|Erro|Scan|Confirm|Exclu|Dados|Lista/i.test(text);
    
    if (!hasPortuguese) continue;
    
    const key = generateKey(text, fileName);
    
    const before = content.substring(Math.max(0, match.index - 50), match.index);
    const after = content.substring(match.index + fullMatch.length, Math.min(content.length, match.index + fullMatch.length + 50));
    
    const inJsxExpression = before.includes('{') && !before.includes('}') && after.includes('}');
    
    if (inJsxExpression) {
      replacements.push({
        from: fullMatch,
        to: `t("${key}")`,
        key: text
      });
    } else {
      replacements.push({
        from: fullMatch,
        to: `{t("${key}")}`,
        key: text
      });
    }
  }
  
  const uniqueReplacements = replacements.filter((r, i, arr) => 
    arr.findIndex(x => x.from === r.from) === i
  );
  
  for (const replacement of uniqueReplacements) {
    const escaped = replacement.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    const newContent = content.replace(regex, replacement.to);
    
    if (newContent !== content) {
      console.log(`   ✓ "${replacement.key.slice(0, 50)}${replacement.key.length > 50 ? '...' : ''}" → ${replacement.to}`);
      content = newContent;
      conversions++;
    }
  }
  
  if (conversions > 0) {
    writeFileSync(filePath, content, 'utf-8');
    console.log(`\n✅ Saved ${filePath} (${conversions} conversions)\n`);
  }
  
  return conversions;
}

const files = globSync('client/src/pages/admin/*.tsx');

console.log(`🔄 Processing ${files.length} admin files with regex-based cleanup...\n`);

let totalConversions = 0;

for (const file of files) {
  const fileName = file.split('/').pop() || '';
  const count = convertFile(file);
  
  if (count > 0) {
    console.log(`📝 ${fileName}: ${count} conversions`);
    totalConversions += count;
  }
}

console.log(`\n\n🎉 REGEX CLEANUP COMPLETE!`);
console.log(`📊 Total conversions: ${totalConversions}`);
console.log(`\n✅ All admin pages should now use t() for Portuguese strings`);
