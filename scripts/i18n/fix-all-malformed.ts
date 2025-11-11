import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const badPatterns = [
  // Pattern 1: {t{"key"}} → t("key")
  { from: /\{t\{"([^"]+)"\}\}/g, to: 't("$1")' },
  
  // Pattern 2: {t('key')} in JSX expressions (should be just t('key'))
  { from: />\s*\{t\(["']([^"']+)["']\)\}\s*</g, to: '>{t("$1")}<' },
  
  // Pattern 3: title: {t("key")}, → title: t("key"),
  { from: /title:\s*\{t\(["']([^"']+)["']\)\}/g, to: 'title: t("$1")' },
  
  // Pattern 4: description: {t("key")}, → description: t("key"),
  { from: /description:\s*\{t\(["']([^"']+)["']\)\}/g, to: 'description: t("$1")' },
  
  // Pattern 5: placeholder={t("key")} in Input → placeholder="actual text"
  // We'll restore these to English literals for now
];

function fixFile(filePath: string): { fixed: number; errors: string[] } {
  let content = readFileSync(filePath, 'utf-8');
  const original = content;
  let fixed = 0;
  const errors: string[] = [];
  
  // Apply pattern fixes
  for (const pattern of badPatterns) {
    const matches = content.match(pattern.from);
    if (matches) {
      content = content.replace(pattern.from, pattern.to);
      fixed += matches.length;
    }
  }
  
  // Save if changes were made
  if (content !== original) {
    writeFileSync(filePath, content, 'utf-8');
  }
  
  return { fixed, errors };
}

const files = globSync('client/src/pages/admin/*.tsx');

console.log(`🔧 Fixing malformed i18n patterns in ${files.length} files...\n`);

let totalFixed = 0;
const allErrors: string[] = [];

for (const file of files) {
  const result = fixFile(file);
  
  if (result.fixed > 0) {
    console.log(`✅ ${file.split('/').pop()}: ${result.fixed} fixes`);
    totalFixed += result.fixed;
  }
  
  if (result.errors.length > 0) {
    allErrors.push(...result.errors.map(e => `${file}: ${e}`));
  }
}

console.log(`\n📊 Total fixes: ${totalFixed}`);

if (allErrors.length > 0) {
  console.log(`\n⚠️  Errors found:`);
  allErrors.forEach(e => console.log(`  - ${e}`));
}
