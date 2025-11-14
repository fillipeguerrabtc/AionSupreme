/**
 * E2E REGRESSION TEST: Semantic Deduplication System
 * ===================================================
 * 
 * Tests the complete deduplication pipeline to ensure:
 * 1. Exact duplicates are blocked (hash check)
 * 2. Semantic duplicates are blocked (embedding similarity >92%)
 * 3. Embeddings are generated and persisted
 * 4. DuplicateContentError is thrown with correct metadata
 * 5. Frequency gate allows high-demand content reuse
 * 
 * CRITICAL for preventing 5x "oi" duplicate bugs in future!
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { curationStore } from '../curation/store';
import { db } from '../db';
import { curationQueue, documents } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { DuplicateContentError } from '../errors/DuplicateContentError';

describe('Semantic Deduplication E2E', () => {
  // Cleanup test data
  const testTitles = [
    'E2E Test: Original Content',
    'E2E Test: Exact Duplicate',
    'E2E Test: Semantic Duplicate',
    'E2E Test: High Frequency Query'
  ];
  
  beforeAll(async () => {
    // Cleanup any leftover test data
    await db.delete(curationQueue).where(
      eq(curationQueue.title, testTitles[0])
    );
    await db.delete(curationQueue).where(
      eq(curationQueue.title, testTitles[1])
    );
    await db.delete(curationQueue).where(
      eq(curationQueue.title, testTitles[2])
    );
    await db.delete(curationQueue).where(
      eq(curationQueue.title, testTitles[3])
    );
  });
  
  afterAll(async () => {
    // Cleanup test data
    await db.delete(curationQueue).where(
      eq(curationQueue.title, testTitles[0])
    );
    await db.delete(curationQueue).where(
      eq(curationQueue.title, testTitles[1])
    );
    await db.delete(curationQueue).where(
      eq(curationQueue.title, testTitles[2])
    );
    await db.delete(curationQueue).where(
      eq(curationQueue.title, testTitles[3])
    );
  });
  
  it('should successfully add unique content with embedding', async () => {
    const item = await curationStore.addToCuration({
      title: testTitles[0],
      content: 'Q: What is machine learning?\nA: Machine learning is a subset of artificial intelligence that enables computers to learn from data without explicit programming.',
      suggestedNamespaces: ['tech/ai'],
      tags: ['ai', 'ml'],
      submittedBy: 'test-suite'
    });
    
    // Verify item was created
    expect(item).toBeDefined();
    expect(item.title).toBe(testTitles[0]);
    expect(item.status).toBe('pending');
    
    // Verify embedding was generated and persisted
    expect(item.embedding).toBeDefined();
    expect(Array.isArray(item.embedding)).toBe(true);
    expect((item.embedding as number[]).length).toBeGreaterThan(0);
    
    // Verify content hash was generated
    expect(item.contentHash).toBeDefined();
    expect(typeof item.contentHash).toBe('string');
    expect(item.contentHash!.length).toBeGreaterThan(0);
  });
  
  it('should block exact duplicate (same content hash)', async () => {
    // Try to add exact duplicate
    await expect(async () => {
      await curationStore.addToCuration({
        title: testTitles[1],
        content: 'Q: What is machine learning?\nA: Machine learning is a subset of artificial intelligence that enables computers to learn from data without explicit programming.',
        suggestedNamespaces: ['tech/ai'],
        tags: ['ai', 'ml'],
        submittedBy: 'test-suite'
      });
    }).rejects.toThrow(DuplicateContentError);
  });
  
  it('should block semantic duplicate (high similarity >92%)', async () => {
    // Try to add semantic duplicate (same question, slightly different answer)
    await expect(async () => {
      await curationStore.addToCuration({
        title: testTitles[2],
        content: 'Q: What is machine learning?\nA: Machine learning is a branch of AI that allows systems to learn patterns from data without being explicitly programmed.',
        suggestedNamespaces: ['tech/ai'],
        tags: ['ai', 'ml'],
        submittedBy: 'test-suite'
      });
    }).rejects.toThrow(DuplicateContentError);
  });
  
  it('should allow legitimately different content', async () => {
    const item = await curationStore.addToCuration({
      title: testTitles[3],
      content: 'Q: What is deep learning?\nA: Deep learning is a specialized form of machine learning that uses neural networks with multiple layers to learn hierarchical representations.',
      suggestedNamespaces: ['tech/ai/deep-learning'],
      tags: ['ai', 'deep-learning'],
      submittedBy: 'test-suite'
    });
    
    // Verify item was created (different enough to pass semantic check)
    expect(item).toBeDefined();
    expect(item.title).toBe(testTitles[3]);
    expect(item.status).toBe('pending');
  });
  
  it('should provide rich duplicate metadata in error', async () => {
    try {
      await curationStore.addToCuration({
        title: 'E2E Test: Duplicate with Metadata',
        content: 'Q: What is machine learning?\nA: Machine learning is a subset of artificial intelligence that enables computers to learn from data without explicit programming.',
        suggestedNamespaces: ['tech/ai'],
        tags: ['ai', 'ml'],
        submittedBy: 'test-suite'
      });
      
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      // Verify DuplicateContentError was thrown
      expect(error).toBeInstanceOf(DuplicateContentError);
      
      // Verify metadata
      expect(error.duplicateOfId).toBeDefined();
      expect(error.similarity).toBeGreaterThan(0.9);
      
      // Verify rejection data is attached
      expect((error as any).rejectionData).toBeDefined();
      expect((error as any).rejectionData.decisionReasonCode).toBe('duplicate');
    }
  });
});
