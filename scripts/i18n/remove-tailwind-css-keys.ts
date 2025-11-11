import fs from 'fs/promises';
import path from 'path';

interface TranslationPayload {
  [key: string]: string | TranslationPayload;
}

const TAILWIND_CSS_KEYS = [
  "ui.tooltip.z50_overflowhidden_roundedmd_border",
  "validation.alert_dialog.fixed_left50_top50_z50",
  "validation.context_menu.z50_maxhradixcontextmenucontentavailableheight_minw8rem",
  "validation.context_menu.z50_minw8rem_overflowhidden_roundedmd",
  "validation.dialog.fixed_left50_top50_z50",
  "validation.dropdown_menu.z50_maxhvarradixdropdownmenucontentavailableheight_minw",
  "validation.dropdown_menu.z50_minw8rem_overflowhidden_roundedmd",
  "validation.menubar.z50_minw12rem_overflowhidden_roundedmd",
  "validation.menubar.z50_minw8rem_overflowhidden_roundedmd",
  "validation.select.relative_z50_maxhradixselectcontentavailableheight_minw8rem",
  "validation.sheet.insety0_left0_hfull_w34",
  "validation.sheet.insety0_right0_hfull_w34"
];

function deleteNestedKey(obj: any, path: string): boolean {
  const keys = path.split('.');
  let current = obj;

  // Navigate to parent
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) {
      return false; // Path doesn't exist
    }
    current = current[keys[i]];
  }

  // Delete final key
  const finalKey = keys[keys.length - 1];
  if (finalKey in current) {
    delete current[finalKey];
    return true;
  }

  return false;
}

async function main() {
  console.log('🗑️  Remove Tailwind CSS Keys from i18n');
  console.log('=======================================\n');

  const ptBRPath = path.resolve(process.cwd(), 'client/src/locales/pt-BR.json');
  const ptBRContent = await fs.readFile(ptBRPath, 'utf-8');
  const ptBR: TranslationPayload = JSON.parse(ptBRContent);

  // Backup
  const backupPath = path.resolve(process.cwd(), 'client/src/locales/pt-BR.json.backup-css-removal');
  await fs.writeFile(backupPath, ptBRContent, 'utf-8');
  console.log('💾 Backup created: pt-BR.json.backup-css-removal\n');

  console.log(`Removing ${TAILWIND_CSS_KEYS.length} Tailwind CSS keys:\n`);

  let removedCount = 0;
  let notFoundCount = 0;

  for (const key of TAILWIND_CSS_KEYS) {
    const removed = deleteNestedKey(ptBR, key);
    if (removed) {
      console.log(`   ✅ Removed: ${key}`);
      removedCount++;
    } else {
      console.log(`   ⚠️  Not found: ${key}`);
      notFoundCount++;
    }
  }

  // Save updated pt-BR.json
  await fs.writeFile(ptBRPath, JSON.stringify(ptBR, null, 2) + '\n', 'utf-8');

  console.log(`\n📊 REMOVAL SUMMARY:`);
  console.log(`   ✅ Removed: ${removedCount} keys`);
  console.log(`   ⚠️  Not found: ${notFoundCount} keys\n`);

  if (removedCount === TAILWIND_CSS_KEYS.length) {
    console.log('🎉 All Tailwind CSS keys removed from i18n!');
    console.log('📋 Next: Run inventory-source-language.ts to verify 0% contamination\n');
    console.log('⚠️  NOTE: These keys should be moved to component-level constants');
    console.log('   Example: Create constants/tailwindClasses.ts or inline in components\n');
  }
}

main().catch(console.error);
