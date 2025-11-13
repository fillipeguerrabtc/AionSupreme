/**
 * COOKIE SESSION SERVICE
 * ======================
 * 
 * Production-grade service for managing encrypted Google OAuth cookies.
 * Enables automated quota scraping for Kaggle/Colab without manual login.
 * 
 * KEY FEATURES:
 * - AES-256-GCM encryption for cookie storage
 * - PostgreSQL-backed persistence (ZERO in-memory!)
 * - 30-day cookie expiration with auto-refresh
 * - Single Google login serves both Kaggle + Colab
 * 
 * SECURITY:
 * - Cookies encrypted with AES-256-GCM
 * - Unique IV (initialization vector) per session
 * - Authentication tag validation
 * - Secure key derivation from SESSION_SECRET
 */

import crypto from 'crypto';
import { db } from '../db';
import { googleAuthSessions, type InsertGoogleAuthSession, type GoogleAuthSession } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export class CookieSessionService {
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_LENGTH = 32; // 256 bits
  private readonly IV_LENGTH = 16; // 128 bits
  private readonly AUTH_TAG_LENGTH = 16; // 128 bits
  
  /**
   * Derives encryption key from SESSION_SECRET
   * Uses PBKDF2 for secure key derivation
   */
  private deriveKey(): Buffer {
    const secret = process.env.SESSION_SECRET || 'aion-default-secret-2025';
    return crypto.pbkdf2Sync(secret, 'cookie-encryption-salt', 100000, this.KEY_LENGTH, 'sha256');
  }
  
  /**
   * Encrypts cookies using AES-256-GCM
   * Returns encrypted data, IV, and authentication tag
   */
  private encryptCookies(cookies: Cookie[]): { encrypted: string; iv: string; authTag: string } {
    const key = this.deriveKey();
    const iv = crypto.randomBytes(this.IV_LENGTH);
    
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    const cookiesJson = JSON.stringify(cookies);
    
    let encrypted = cipher.update(cookiesJson, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }
  
  /**
   * Decrypts cookies using AES-256-GCM
   * Validates authentication tag for integrity
   */
  private decryptCookies(encrypted: string, iv: string, authTag: string): Cookie[] {
    const key = this.deriveKey();
    const ivBuffer = Buffer.from(iv, 'hex');
    const authTagBuffer = Buffer.from(authTag, 'hex');
    
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }
  
  /**
   * Saves Google OAuth cookies to PostgreSQL (encrypted)
   * Creates or updates session for given email
   */
  async saveCookies(email: string, name: string | undefined, cookies: Cookie[]): Promise<void> {
    const { encrypted, iv, authTag } = this.encryptCookies(cookies);
    
    // 30-day expiration (cookie sessions last ~30 days)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    // Check if session exists
    const existing = await db.query.googleAuthSessions.findFirst({
      where: eq(googleAuthSessions.accountEmail, email),
    });
    
    if (existing) {
      // Update existing session
      await db.update(googleAuthSessions)
        .set({
          accountName: name,
          encryptedCookies: encrypted,
          cookieIv: iv,
          cookieAuthTag: authTag,
          isValid: true,
          lastValidated: new Date(),
          expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(googleAuthSessions.id, existing.id));
    } else {
      // Create new session
      await db.insert(googleAuthSessions).values({
        accountEmail: email,
        accountName: name,
        encryptedCookies: encrypted,
        cookieIv: iv,
        cookieAuthTag: authTag,
        isValid: true,
        lastValidated: new Date(),
        expiresAt,
        providers: ['kaggle', 'colab'], // Single Google login serves both!
      });
    }
  }
  
  /**
   * Loads cookies from PostgreSQL (decrypted)
   * Returns null if session not found or expired
   */
  async loadCookies(email: string): Promise<Cookie[] | null> {
    const session = await db.query.googleAuthSessions.findFirst({
      where: and(
        eq(googleAuthSessions.accountEmail, email),
        eq(googleAuthSessions.isValid, true)
      ),
    });
    
    if (!session) {
      return null;
    }
    
    // Check expiration
    if (session.expiresAt && session.expiresAt < new Date()) {
      // Mark as invalid
      await db.update(googleAuthSessions)
        .set({ isValid: false, updatedAt: new Date() })
        .where(eq(googleAuthSessions.id, session.id));
      return null;
    }
    
    try {
      const cookies = this.decryptCookies(
        session.encryptedCookies,
        session.cookieIv,
        session.cookieAuthTag
      );
      
      // Update last validated timestamp
      await db.update(googleAuthSessions)
        .set({ lastValidated: new Date(), updatedAt: new Date() })
        .where(eq(googleAuthSessions.id, session.id));
      
      return cookies;
    } catch (error) {
      console.error('[CookieSessionService] Failed to decrypt cookies:', error);
      // Mark as invalid if decryption fails
      await db.update(googleAuthSessions)
        .set({ isValid: false, updatedAt: new Date() })
        .where(eq(googleAuthSessions.id, session.id));
      return null;
    }
  }
  
  /**
   * Gets all valid sessions
   * Returns list of sessions with decrypted cookies
   */
  async getAllSessions(): Promise<Array<GoogleAuthSession & { cookies: Cookie[] }>> {
    const sessions = await db.query.googleAuthSessions.findMany({
      where: eq(googleAuthSessions.isValid, true),
    });
    
    const result = [];
    
    for (const session of sessions) {
      // Check expiration
      if (session.expiresAt && session.expiresAt < new Date()) {
        await db.update(googleAuthSessions)
          .set({ isValid: false, updatedAt: new Date() })
          .where(eq(googleAuthSessions.id, session.id));
        continue;
      }
      
      try {
        const cookies = this.decryptCookies(
          session.encryptedCookies,
          session.cookieIv,
          session.cookieAuthTag
        );
        result.push({ ...session, cookies });
      } catch (error) {
        console.error(`[CookieSessionService] Failed to decrypt cookies for ${session.accountEmail}:`, error);
        await db.update(googleAuthSessions)
          .set({ isValid: false, updatedAt: new Date() })
          .where(eq(googleAuthSessions.id, session.id));
      }
    }
    
    return result;
  }
  
  /**
   * Marks a session as invalid (e.g., after failed scraping)
   */
  async invalidateSession(email: string): Promise<void> {
    await db.update(googleAuthSessions)
      .set({ isValid: false, updatedAt: new Date() })
      .where(eq(googleAuthSessions.accountEmail, email));
  }
  
  /**
   * Deletes a session completely
   */
  async deleteSession(email: string): Promise<void> {
    await db.delete(googleAuthSessions)
      .where(eq(googleAuthSessions.accountEmail, email));
  }
  
  /**
   * Updates last sync timestamp
   */
  async updateLastSync(email: string): Promise<void> {
    await db.update(googleAuthSessions)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(googleAuthSessions.accountEmail, email));
  }
}

export const cookieSessionService = new CookieSessionService();
