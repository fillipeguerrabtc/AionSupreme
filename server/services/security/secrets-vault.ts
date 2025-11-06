/**
 * SECRETS VAULT - AES-256-GCM ENCRYPTION
 * =======================================
 * 
 * Production-grade secrets management com:
 * - ✅ AES-256-GCM encryption
 * - ✅ Key rotation support
 * - ✅ Secure key derivation (PBKDF2)
 * - ✅ Automatic expiration
 * - ✅ Audit logging
 * 
 * NUNCA MAIS armazenar credentials em plaintext!
 */

import crypto from 'crypto';
import { db } from '../../db';
import { sql } from 'drizzle-orm';

// Encryption config
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const PBKDF2_ITERATIONS = 100000;

interface EncryptedSecret {
  encrypted: string; // Base64
  iv: string; // Base64
  authTag: string; // Base64
  salt: string; // Base64
  algorithm: string;
  keyVersion: number;
}

interface SecretMetadata {
  name: string;
  createdAt: Date;
  expiresAt?: Date;
  rotatedAt?: Date;
  accessCount: number;
}

export class SecretsVault {
  private masterSecret: string;
  private keyVersion: number = 1;

  constructor() {
    // Master key from environment
    // PRODUCTION: MANDATORY (throw error if missing)
    // DEVELOPMENT: Optional (generates warning only)
    this.masterSecret = process.env.SECRETS_MASTER_KEY || '';
    
    if (!this.masterSecret) {
      const isProduction = process.env.NODE_ENV === 'production';
      
      if (isProduction) {
        throw new Error(
          '🚨 SECRETS_MASTER_KEY environment variable is REQUIRED in production! ' +
          'Generate one with: openssl rand -hex 32'
        );
      } else {
        console.warn('⚠️  [SecretsVault] No SECRETS_MASTER_KEY set in development mode');
        console.warn('⚠️  [SecretsVault] Encryption is DISABLED - secrets will be stored in plaintext!');
        console.warn('⚠️  [SecretsVault] Set SECRETS_MASTER_KEY to enable encryption');
      }
    } else {
      console.log('[SecretsVault] ✅ Initialized with AES-256-GCM encryption (per-secret key derivation)');
    }
  }

  /**
   * Encrypt a secret with per-secret key derivation
   * Falls back to plaintext if no master key (development only)
   */
  encrypt(plaintext: string): EncryptedSecret {
    // Plaintext fallback (development only)
    if (!this.masterSecret) {
      console.warn('[SecretsVault] ⚠️  Storing in PLAINTEXT (no master key)');
      return {
        encrypted: Buffer.from(plaintext, 'utf8').toString('base64'),
        iv: '',
        authTag: '',
        salt: '',
        algorithm: 'none', // Indicates plaintext
        keyVersion: 0,
      };
    }

    try {
      // Generate random IV (Initialization Vector)
      const iv = crypto.randomBytes(IV_LENGTH);

      // Generate random salt para este secret específico
      const salt = crypto.randomBytes(SALT_LENGTH);

      // Derive unique key for THIS secret using PBKDF2
      const derivedKey = crypto.pbkdf2Sync(
        this.masterSecret,
        salt,
        PBKDF2_ITERATIONS,
        KEY_LENGTH,
        'sha512'
      );

      // Create cipher with derived key
      const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);

      // Encrypt
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      // Get authentication tag (GCM mode)
      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        salt: salt.toString('base64'),
        algorithm: ALGORITHM,
        keyVersion: this.keyVersion,
      };

    } catch (error: any) {
      console.error('[SecretsVault] Encryption failed:', error.message);
      throw new Error(`Failed to encrypt secret: ${error.message}`);
    }
  }

  /**
   * Decrypt a secret using per-secret salt
   * Handles plaintext fallback for development
   */
  decrypt(encryptedSecret: EncryptedSecret): string {
    // Plaintext fallback (development)
    if (encryptedSecret.algorithm === 'none') {
      return Buffer.from(encryptedSecret.encrypted, 'base64').toString('utf8');
    }

    if (!this.masterSecret) {
      throw new Error('Cannot decrypt: SECRETS_MASTER_KEY not set');
    }

    try {
      const iv = Buffer.from(encryptedSecret.iv, 'base64');
      const authTag = Buffer.from(encryptedSecret.authTag, 'base64');
      const salt = Buffer.from(encryptedSecret.salt, 'base64');

      // Derive same key using stored salt
      const derivedKey = crypto.pbkdf2Sync(
        this.masterSecret,
        salt,
        PBKDF2_ITERATIONS,
        KEY_LENGTH,
        'sha512'
      );

      // Create decipher with derived key
      const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let decrypted = decipher.update(encryptedSecret.encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;

    } catch (error: any) {
      console.error('[SecretsVault] Decryption failed:', error.message);
      throw new Error('Failed to decrypt secret (corrupted or wrong key)');
    }
  }

  /**
   * Store encrypted secret in database
   */
  async store(name: string, plaintext: string, expiresInDays?: number): Promise<void> {
    const encrypted = this.encrypt(plaintext);

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    await db.execute(sql`
      INSERT INTO secrets_vault (name, encrypted_data, expires_at, created_at, access_count)
      VALUES (
        ${name},
        ${JSON.stringify(encrypted)},
        ${expiresAt},
        NOW(),
        0
      )
      ON CONFLICT (name) DO UPDATE SET
        encrypted_data = ${JSON.stringify(encrypted)},
        expires_at = ${expiresAt},
        rotated_at = NOW()
    `);

    console.log(`[SecretsVault] ✅ Stored encrypted secret: ${name}`);
  }

  /**
   * Retrieve and decrypt secret from database
   */
  async retrieve(name: string): Promise<string | null> {
    try {
      const result = await db.execute(sql`
        SELECT encrypted_data, expires_at, access_count
        FROM secrets_vault
        WHERE name = ${name}
      `);

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0] as any;

      // Check expiration
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        console.warn(`[SecretsVault] Secret '${name}' has expired`);
        await this.delete(name);
        return null;
      }

      // Increment access count
      await db.execute(sql`
        UPDATE secrets_vault
        SET access_count = access_count + 1
        WHERE name = ${name}
      `);

      // Decrypt
      // node-postgres already parses jsonb columns into objects - no need to JSON.parse!
      const encryptedSecret = row.encrypted_data as EncryptedSecret;
      return this.decrypt(encryptedSecret);

    } catch (error: any) {
      console.error(`[SecretsVault] Failed to retrieve secret '${name}':`, error.message);
      return null;
    }
  }

  /**
   * Delete secret
   */
  async delete(name: string): Promise<void> {
    await db.execute(sql`
      DELETE FROM secrets_vault WHERE name = ${name}
    `);
    console.log(`[SecretsVault] ✅ Deleted secret: ${name}`);
  }

  /**
   * Rotate secret (re-encrypt com nova key version)
   */
  async rotate(name: string): Promise<void> {
    const plaintext = await this.retrieve(name);
    if (!plaintext) {
      throw new Error(`Secret '${name}' not found`);
    }

    // Re-encrypt com key version atualizada
    this.keyVersion++;
    await this.store(name, plaintext);
    
    console.log(`[SecretsVault] ✅ Rotated secret: ${name} (key version: ${this.keyVersion})`);
  }

  /**
   * List all secrets (metadata only, sem decrypt)
   */
  async list(): Promise<SecretMetadata[]> {
    const result = await db.execute(sql`
      SELECT name, created_at, expires_at, rotated_at, access_count
      FROM secrets_vault
      ORDER BY created_at DESC
    `);

    return (result.rows || []).map((row: any) => ({
      name: row.name,
      createdAt: new Date(row.created_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      rotatedAt: row.rotated_at ? new Date(row.rotated_at) : undefined,
      accessCount: row.access_count || 0,
    }));
  }

  /**
   * Cleanup expired secrets (run periodically)
   */
  async cleanupExpired(): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM secrets_vault
      WHERE expires_at IS NOT NULL AND expires_at < NOW()
    `);

    const deleted = result.rowCount || 0;
    if (deleted > 0) {
      console.log(`[SecretsVault] 🗑️  Cleaned up ${deleted} expired secrets`);
    }

    return deleted;
  }

}

// Singleton
export const secretsVault = new SecretsVault();

/**
 * Helper: Encrypt/Decrypt Kaggle credentials
 */
export async function storeKaggleCredentials(
  username: string,
  apiKey: string,
  identifier: string = 'default'
): Promise<void> {
  const secretName = `kaggle:${identifier}:${username}`;
  const payload = JSON.stringify({ username, key: apiKey });
  
  await secretsVault.store(secretName, payload, 90); // Expire in 90 days
}

export async function retrieveKaggleCredentials(
  identifier: string = 'default',
  username?: string
): Promise<{ username: string; key: string } | null> {
  const secretName = username
    ? `kaggle:${identifier}:${username}`
    : await findKaggleSecret(identifier);

  if (!secretName) return null;

  const payload = await secretsVault.retrieve(secretName);
  if (!payload) return null;

  return JSON.parse(payload);
}

async function findKaggleSecret(identifier: string): Promise<string | null> {
  const secrets = await secretsVault.list();
  const kaggleSecret = secrets.find(s => s.name.startsWith(`kaggle:${identifier}:`));
  return kaggleSecret?.name || null;
}

/**
 * Helper: Encrypt/Decrypt Google credentials
 */
export async function storeGoogleCredentials(
  email: string,
  password: string,
  identifier: string = 'default'
): Promise<void> {
  const secretName = `google:${identifier}:${email}`;
  const payload = JSON.stringify({ email, password });
  
  await secretsVault.store(secretName, payload, 90);
}

export async function retrieveGoogleCredentials(
  identifier: string = 'default',
  email?: string
): Promise<{ email: string; password: string } | null> {
  const secretName = email
    ? `google:${identifier}:${email}`
    : await findGoogleSecret(identifier);

  if (!secretName) return null;

  const payload = await secretsVault.retrieve(secretName);
  if (!payload) return null;

  return JSON.parse(payload);
}

async function findGoogleSecret(identifier: string): Promise<string | null> {
  const secrets = await secretsVault.list();
  const googleSecret = secrets.find(s => s.name.startsWith(`google:${identifier}:`));
  return googleSecret?.name || null;
}
