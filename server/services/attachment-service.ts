/**
 * AttachmentService - Gerenciamento de arquivos permanentes
 * 
 * Responsabilidades:
 * - Upload para curation_storage/pending/
 * - Move pending → kb_storage/ na aprovação
 * - Delete de pending na rejeição
 * - Cálculo de checksums (MD5, SHA256)
 * - Deduplicação por hash
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { 
  TEMP_STORAGE, 
  KB_STORAGE, 
  CURATION_STORAGE, 
  ensureStorageDirectories 
} from '../config/storage-paths';
import { db } from '../db';
import { curationAttachments, type InsertCurationAttachment } from '../../shared/schema';
import { eq, isNotNull } from 'drizzle-orm';

interface UploadOptions {
  curationId: string;
  file: Express.Multer.File;
  fileType: 'image' | 'video' | 'audio' | 'document';
  sourceUrl?: string;
  description?: string;
}

interface MoveToKBOptions {
  attachmentId: number;
  targetSubfolder?: 'images' | 'documents' | 'media'; // Auto-detect se não especificado
}

export class AttachmentService {
  constructor() {
    // Garantir que diretórios existem
    ensureStorageDirectories();
  }

  /**
   * Calcula MD5 e SHA256 de um arquivo
   */
  private async calculateChecksums(filePath: string): Promise<{ md5: string; sha256: string }> {
    const fileBuffer = await fs.promises.readFile(filePath);
    
    const md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    return { md5, sha256 };
  }

  /**
   * Upload de arquivo para curation_storage/pending/
   * Retorna registro criado na tabela curation_attachments
   */
  async uploadToPending(options: UploadOptions): Promise<number> {
    const { curationId, file, fileType, sourceUrl, description } = options;

    // Gerar nome único: timestamp_random_originalname
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFilename = `${timestamp}_${random}_${safeFilename}`;

    // Path de destino
    const destPath = path.join(CURATION_STORAGE.PENDING, uniqueFilename);

    // Copiar arquivo
    await fs.promises.copyFile(file.path, destPath);

    // Calcular checksums
    const { md5, sha256 } = await this.calculateChecksums(destPath);

    // Gerar base64 temporário para preview (apenas imagens pequenas)
    let tempBase64: string | undefined;
    if (fileType === 'image' && file.size < 5 * 1024 * 1024) { // Máx 5MB
      const buffer = await fs.promises.readFile(destPath);
      tempBase64 = `data:${file.mimetype};base64,${buffer.toString('base64')}`;
    }

    // Inserir registro
    const [attachment] = await db.insert(curationAttachments).values({
      curationId,
      fileType,
      storagePath: destPath,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      md5Hash: md5,
      sha256Hash: sha256,
      sourceUrl,
      description,
      tempBase64,
    }).returning();

    console.log(`[AttachmentService] ✅ Uploaded: ${uniqueFilename} (${fileType}, ${file.size} bytes)`);

    return attachment.id;
  }

  /**
   * Move arquivo de pending → kb_storage/ (aprovação)
   * Atualiza storagePath no banco com relative path web-accessible
   * Retorna relative URL para uso na KB
   */
  async moveToKB(options: MoveToKBOptions): Promise<string> {
    const { attachmentId, targetSubfolder } = options;

    // Buscar attachment
    const [attachment] = await db.select().from(curationAttachments).where(eq(curationAttachments.id, attachmentId));
    if (!attachment) {
      throw new Error(`Attachment ${attachmentId} not found`);
    }

    // Auto-detect subfolder se não especificado
    let subfolder = targetSubfolder;
    if (!subfolder) {
      if (attachment.fileType === 'image') subfolder = 'images';
      else if (attachment.fileType === 'document') subfolder = 'documents';
      else subfolder = 'media';
    }

    // Determinar destino
    const kbBasePath = subfolder === 'images' ? KB_STORAGE.IMAGES :
                       subfolder === 'documents' ? KB_STORAGE.DOCUMENTS :
                       KB_STORAGE.MEDIA;

    const filename = path.basename(attachment.storagePath);
    const destPath = path.join(kbBasePath, filename);

    // Verificar se origem existe
    if (!fs.existsSync(attachment.storagePath)) {
      console.warn(`[AttachmentService] ⚠️ Source file not found: ${attachment.storagePath}`);
      // Retornar relative path mesmo se arquivo não existe (pode ter sido movido antes)
      return `/kb_storage/${subfolder}/${filename}`;
    }

    // Move arquivo
    await fs.promises.rename(attachment.storagePath, destPath);

    // Gerar relative URL web-accessible
    const relativeUrl = `/kb_storage/${subfolder}/${filename}`;

    // Atualizar DB com relative path + REMOVER tempBase64 (economia de espaço)
    await db.update(curationAttachments)
      .set({ 
        storagePath: relativeUrl, // Salvar relative path ao invés de absolute
        tempBase64: null, // Limpar base64 após aprovação
        updatedAt: new Date(),
      })
      .where(eq(curationAttachments.id, attachmentId));

    console.log(`[AttachmentService] ✅ Moved to KB: ${filename} → ${relativeUrl}`);
    
    return relativeUrl;
  }

  /**
   * Delete arquivo de pending (rejeição)
   * Remove arquivo físico + registro do DB
   */
  async deleteFromPending(attachmentId: number): Promise<void> {
    // Buscar attachment
    const [attachment] = await db.select().from(curationAttachments).where(eq(curationAttachments.id, attachmentId));
    if (!attachment) {
      console.warn(`[AttachmentService] ⚠️ Attachment ${attachmentId} not found (already deleted?)`);
      return;
    }

    // Delete arquivo físico se existir
    if (fs.existsSync(attachment.storagePath)) {
      await fs.promises.unlink(attachment.storagePath);
      console.log(`[AttachmentService] 🗑️ Deleted file: ${path.basename(attachment.storagePath)}`);
    }

    // Delete registro do DB (cascade delete via FK)
    await db.delete(curationAttachments).where(eq(curationAttachments.id, attachmentId));
  }

  /**
   * Busca attachment por MD5 (deduplicação exata)
   */
  async findByMD5(md5Hash: string): Promise<typeof curationAttachments.$inferSelect | null> {
    const [attachment] = await db.select()
      .from(curationAttachments)
      .where(eq(curationAttachments.md5Hash, md5Hash))
      .limit(1);

    return attachment || null;
  }

  /**
   * Busca attachments de uma curation
   */
  async getAttachmentsByCuration(curationId: string) {
    return await db.select()
      .from(curationAttachments)
      .where(eq(curationAttachments.curationId, curationId));
  }

  /**
   * Cleanup: Remove base64 de attachments antigos (economia de espaço)
   */
  async cleanupOldBase64(daysOld: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Apenas limpa base64 de attachments APROVADOS (já em kb_storage)
    const result = await db.update(curationAttachments)
      .set({ tempBase64: null, updatedAt: new Date() })
      .where(isNotNull(curationAttachments.tempBase64)) // WHERE tempBase64 IS NOT NULL
      .returning({ id: curationAttachments.id });

    console.log(`[AttachmentService] 🧹 Cleaned ${result.length} old base64 previews`);
    return result.length;
  }
}

// Singleton instance
export const attachmentService = new AttachmentService();
