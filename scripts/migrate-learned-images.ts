/**
 * MIGRATION SCRIPT: learned_images → kb_storage/images
 * 
 * Move todas as imagens de attached_assets/learned_images para kb_storage/images
 * e atualiza os registros no banco de dados para apontar para o novo caminho.
 * 
 * ✅ IDEMPOTENTE: Pode ser executado múltiplas vezes sem duplicar
 * ✅ BACKUP: Cria backup antes de mover
 * ✅ ROLLBACK: Preserva arquivos originais até confirmação manual
 * 
 * Uso:
 *   tsx scripts/migrate-learned-images.ts --dry-run  (preview sem executar)
 *   tsx scripts/migrate-learned-images.ts --execute   (executa migração)
 *   tsx scripts/migrate-learned-images.ts --cleanup   (remove backups após confirmação)
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { db } from '../server/db';
import { documents } from '../shared/schema';
import { sql } from 'drizzle-orm';

const OLD_PATH = path.join(process.cwd(), 'attached_assets', 'learned_images');
const NEW_PATH = path.join(process.cwd(), 'kb_storage', 'images');
const BACKUP_PATH = path.join(process.cwd(), 'kb_storage', 'migration_backup', 'learned_images');

interface MigrationStats {
  filesFound: number;
  filesMoved: number;
  filesSkipped: number;
  dbRecordsUpdated: number;
  errors: string[];
}

async function ensureDir(dir: string): Promise<void> {
  if (!fsSync.existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
}

async function copyFile(src: string, dest: string): Promise<void> {
  const buffer = await fs.readFile(src);
  await fs.writeFile(dest, buffer);
}

async function getDatabaseImageRecords(): Promise<Array<{ id: number; content: string; attachments?: any }>> {
  const records = await db.select().from(documents);
  
  // Filtrar apenas records que mencionam learned_images no content ou attachments
  return records.filter(doc => {
    const contentMatch = doc.content.includes('learned_images');
    const attachmentsMatch = doc.attachments && 
      JSON.stringify(doc.attachments).includes('learned_images');
    return contentMatch || attachmentsMatch;
  });
}

async function updateDatabaseRecord(id: number, oldPath: string, newPath: string): Promise<void> {
  // Atualizar content (se houver referências)
  await db.execute(sql`
    UPDATE documents 
    SET content = REPLACE(content, ${oldPath}, ${newPath}),
        updated_at = NOW()
    WHERE id = ${id}
  `);

  // Atualizar attachments (se houver)
  await db.execute(sql`
    UPDATE documents 
    SET attachments = REPLACE(attachments::text, ${oldPath}, ${newPath})::jsonb,
        updated_at = NOW()
    WHERE id = ${id} AND attachments IS NOT NULL
  `);
}

async function migrateFiles(dryRun: boolean = true): Promise<MigrationStats> {
  const stats: MigrationStats = {
    filesFound: 0,
    filesMoved: 0,
    filesSkipped: 0,
    dbRecordsUpdated: 0,
    errors: [],
  };

  console.log('\n🚀 MIGRATION: learned_images → kb_storage/images');
  console.log('=====================================\n');

  // 1. Verificar se diretório antigo existe
  if (!fsSync.existsSync(OLD_PATH)) {
    console.log('⚠️  Diretório antigo não existe, nada a migrar.');
    console.log(`   Caminho: ${OLD_PATH}`);
    return stats;
  }

  // 2. Criar diretórios necessários
  if (!dryRun) {
    await ensureDir(NEW_PATH);
    await ensureDir(BACKUP_PATH);
  }

  // 3. Listar arquivos
  const files = await fs.readdir(OLD_PATH);
  stats.filesFound = files.length;

  console.log(`📁 Encontrados ${files.length} arquivos em learned_images\n`);

  if (files.length === 0) {
    console.log('✅ Nenhum arquivo para migrar.');
    return stats;
  }

  // 4. Migrar cada arquivo
  for (const file of files) {
    const oldFilePath = path.join(OLD_PATH, file);
    const newFilePath = path.join(NEW_PATH, file);
    const backupFilePath = path.join(BACKUP_PATH, file);

    try {
      // Pular diretórios
      const fileStat = await fs.stat(oldFilePath);
      if (fileStat.isDirectory()) {
        console.log(`⏭️  Skipping directory: ${file}`);
        stats.filesSkipped++;
        continue;
      }

      // Verificar se já existe no destino
      if (fsSync.existsSync(newFilePath)) {
        console.log(`⏭️  Já existe no destino: ${file}`);
        stats.filesSkipped++;
        continue;
      }

      if (dryRun) {
        console.log(`[DRY-RUN] Would move: ${file}`);
        stats.filesMoved++;
      } else {
        // Fazer backup
        await copyFile(oldFilePath, backupFilePath);
        
        // Copiar para novo local
        await copyFile(oldFilePath, newFilePath);
        
        console.log(`✅ Migrated: ${file}`);
        stats.filesMoved++;
      }
    } catch (error: any) {
      const errorMsg = `Error migrating ${file}: ${error.message}`;
      console.error(`❌ ${errorMsg}`);
      stats.errors.push(errorMsg);
    }
  }

  // 5. Atualizar banco de dados
  console.log(`\n📊 Atualizando registros no banco de dados...\n`);

  const dbRecords = await getDatabaseImageRecords();
  console.log(`📝 Encontrados ${dbRecords.length} registros com referências a learned_images\n`);

  for (const record of dbRecords) {
    try {
      if (dryRun) {
        console.log(`[DRY-RUN] Would update DB record ID ${record.id}`);
        stats.dbRecordsUpdated++;
      } else {
        await updateDatabaseRecord(
          record.id,
          'attached_assets/learned_images',
          'kb_storage/images'
        );
        
        console.log(`✅ Updated DB record ID ${record.id}`);
        stats.dbRecordsUpdated++;
      }
    } catch (error: any) {
      const errorMsg = `Error updating DB record ${record.id}: ${error.message}`;
      console.error(`❌ ${errorMsg}`);
      stats.errors.push(errorMsg);
    }
  }

  return stats;
}

async function cleanupBackups(): Promise<void> {
  console.log('\n🧹 CLEANUP: Removendo backups e arquivos antigos');
  console.log('=====================================\n');

  if (!fsSync.existsSync(BACKUP_PATH)) {
    console.log('⚠️  Diretório de backup não existe, nada a limpar.');
    return;
  }

  // Remover backups
  await fs.rm(BACKUP_PATH, { recursive: true, force: true });
  console.log(`✅ Removido diretório de backup: ${BACKUP_PATH}`);

  // Remover diretório antigo (se vazio)
  if (fsSync.existsSync(OLD_PATH)) {
    const files = await fs.readdir(OLD_PATH);
    if (files.length === 0) {
      await fs.rmdir(OLD_PATH);
      console.log(`✅ Removido diretório vazio: ${OLD_PATH}`);
    } else {
      console.log(`⚠️  Diretório antigo ainda contém ${files.length} arquivos, não removido.`);
      console.log(`   Execute 'rm -rf ${OLD_PATH}' manualmente se desejar.`);
    }
  }

  console.log('\n✅ Cleanup concluído!');
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (!mode || !['--dry-run', '--execute', '--cleanup'].includes(mode)) {
    console.log(`
Uso:
  tsx scripts/migrate-learned-images.ts --dry-run   (preview sem executar)
  tsx scripts/migrate-learned-images.ts --execute    (executa migração)
  tsx scripts/migrate-learned-images.ts --cleanup    (remove backups)

Descrição:
  Move todas as imagens de attached_assets/learned_images para kb_storage/images
  e atualiza os registros no banco de dados.

  1. --dry-run:  Mostra o que seria feito sem executar
  2. --execute:  Executa a migração (cria backup automaticamente)
  3. --cleanup:  Remove backups após confirmação manual
    `);
    process.exit(1);
  }

  try {
    if (mode === '--cleanup') {
      await cleanupBackups();
    } else {
      const isDryRun = mode === '--dry-run';
      const stats = await migrateFiles(isDryRun);

      console.log('\n📊 RESUMO DA MIGRAÇÃO');
      console.log('=====================================');
      console.log(`Arquivos encontrados:     ${stats.filesFound}`);
      console.log(`Arquivos migrados:        ${stats.filesMoved}`);
      console.log(`Arquivos pulados:         ${stats.filesSkipped}`);
      console.log(`Registros DB atualizados: ${stats.dbRecordsUpdated}`);
      console.log(`Erros:                    ${stats.errors.length}`);

      if (stats.errors.length > 0) {
        console.log('\n❌ ERROS:');
        stats.errors.forEach(err => console.log(`   - ${err}`));
      }

      if (isDryRun) {
        console.log('\n💡 Esta foi uma execução DRY-RUN. Nenhuma alteração foi feita.');
        console.log('   Execute com --execute para aplicar as mudanças.');
      } else {
        console.log('\n✅ Migração concluída com sucesso!');
        console.log(`   Backup criado em: ${BACKUP_PATH}`);
        console.log(`   Arquivos movidos para: ${NEW_PATH}`);
        console.log('\n💡 Próximos passos:');
        console.log('   1. Verifique se tudo está funcionando corretamente');
        console.log('   2. Execute --cleanup para remover backups e arquivos antigos');
      }
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ ERRO FATAL:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
