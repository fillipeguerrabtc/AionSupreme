/**
 * DATASET SPLITTER - Federated Learning Data Distribution
 * 
 * Divides large datasets into N chunks for distributed training across N GPUs
 * Supports JSON, JSONL, CSV, and TXT formats
 * 
 * Features:
 * - Automatic chunk size calculation
 * - Balanced distribution
 * - Metadata tracking
 * - Support for multiple formats
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export interface DatasetInfo {
  path: string;
  format: 'json' | 'jsonl' | 'csv' | 'txt';
  totalExamples: number;
  totalSizeBytes: number;
}

export interface ChunkInfo {
  chunkIndex: number;
  startIdx: number;
  endIdx: number;
  numExamples: number;
  path: string;
}

export interface SplitResult {
  chunks: ChunkInfo[];
  totalChunks: number;
  totalExamples: number;
  avgChunkSize: number;
}

/**
 * Dataset Splitter for Federated Learning
 */
export class DatasetSplitter {
  private outputDir: string;
  
  constructor(outputDir: string = join(process.cwd(), 'datasets', 'chunks')) {
    this.outputDir = outputDir;
  }
  
  /**
   * Analyze dataset and return metadata
   */
  async analyzeDataset(datasetPath: string): Promise<DatasetInfo> {
    console.log(`[Dataset Splitter] Analyzing: ${datasetPath}`);
    
    const content = await readFile(datasetPath, 'utf-8');
    const totalSizeBytes = Buffer.byteLength(content, 'utf-8');
    
    // Detect format
    const ext = datasetPath.split('.').pop()?.toLowerCase();
    let format: DatasetInfo['format'];
    let totalExamples: number;
    
    if (ext === 'jsonl') {
      format = 'jsonl';
      const lines = content.trim().split('\n');
      totalExamples = lines.length;
    } else if (ext === 'json') {
      format = 'json';
      const data = JSON.parse(content);
      totalExamples = Array.isArray(data) ? data.length : 1;
    } else if (ext === 'csv') {
      format = 'csv';
      const lines = content.trim().split('\n');
      totalExamples = lines.length - 1; // Exclude header
    } else {
      format = 'txt';
      const lines = content.trim().split('\n');
      totalExamples = lines.length;
    }
    
    console.log(`[Dataset Splitter] Format: ${format}, Examples: ${totalExamples}, Size: ${(totalSizeBytes / 1024 / 1024).toFixed(2)} MB`);
    
    return {
      path: datasetPath,
      format,
      totalExamples,
      totalSizeBytes,
    };
  }
  
  /**
   * Split dataset into N chunks
   */
  async splitDataset(
    datasetPath: string,
    numChunks: number,
    jobId: number
  ): Promise<SplitResult> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[Dataset Splitter] 📊 Splitting dataset into ${numChunks} chunks`);
    console.log('='.repeat(80));
    
    // Analyze dataset
    const info = await this.analyzeDataset(datasetPath);
    
    // Calculate chunk size
    const chunkSize = Math.ceil(info.totalExamples / numChunks);
    
    console.log(`[Dataset Splitter] Chunk size: ${chunkSize} examples`);
    
    // Read full dataset
    const content = await readFile(datasetPath, 'utf-8');
    let examples: any[];
    
    // Parse based on format
    switch (info.format) {
      case 'jsonl':
        examples = content.trim().split('\n').map(line => JSON.parse(line));
        break;
      case 'json':
        const data = JSON.parse(content);
        examples = Array.isArray(data) ? data : [data];
        break;
      case 'csv':
        const lines = content.trim().split('\n');
        const header = lines[0];
        examples = lines.slice(1).map(line => ({ _raw: line, _header: header }));
        break;
      case 'txt':
        examples = content.trim().split('\n').map(line => ({ text: line }));
        break;
    }
    
    // Create chunks directory
    const chunksDir = join(this.outputDir, `job-${jobId}`);
    if (!existsSync(chunksDir)) {
      await mkdir(chunksDir, { recursive: true });
    }
    
    // Split into chunks
    const chunks: ChunkInfo[] = [];
    
    for (let i = 0; i < numChunks; i++) {
      const startIdx = i * chunkSize;
      const endIdx = Math.min(startIdx + chunkSize, examples.length);
      const chunkExamples = examples.slice(startIdx, endIdx);
      
      if (chunkExamples.length === 0) {
        break; // No more data
      }
      
      // Save chunk
      const chunkPath = join(chunksDir, `chunk-${i}.jsonl`);
      const chunkContent = chunkExamples
        .map(ex => JSON.stringify(ex))
        .join('\n');
      
      await writeFile(chunkPath, chunkContent);
      
      chunks.push({
        chunkIndex: i,
        startIdx,
        endIdx,
        numExamples: chunkExamples.length,
        path: chunkPath,
      });
      
      console.log(`[Dataset Splitter] ✅ Chunk ${i}: ${chunkExamples.length} examples (${startIdx}-${endIdx}) → ${chunkPath}`);
    }
    
    const avgChunkSize = chunks.reduce((sum, c) => sum + c.numExamples, 0) / chunks.length;
    
    console.log(`\n[Dataset Splitter] ✅ Split complete!`);
    console.log(`   Total chunks: ${chunks.length}`);
    console.log(`   Avg chunk size: ${avgChunkSize.toFixed(0)} examples`);
    console.log('='.repeat(80) + '\n');
    
    return {
      chunks,
      totalChunks: chunks.length,
      totalExamples: examples.length,
      avgChunkSize,
    };
  }
  
  /**
   * Get chunk path for a specific chunk index
   */
  getChunkPath(jobId: number, chunkIndex: number): string {
    return join(this.outputDir, `job-${jobId}`, `chunk-${chunkIndex}.jsonl`);
  }
  
  /**
   * Validate all chunks exist
   */
  async validateChunks(jobId: number, numChunks: number): Promise<boolean> {
    for (let i = 0; i < numChunks; i++) {
      const chunkPath = this.getChunkPath(jobId, i);
      if (!existsSync(chunkPath)) {
        console.error(`[Dataset Splitter] Missing chunk: ${chunkPath}`);
        return false;
      }
    }
    return true;
  }
}

// Singleton instance
export const datasetSplitter = new DatasetSplitter();
