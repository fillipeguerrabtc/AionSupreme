#!/usr/bin/env tsx
/**
 * PHASE 1.1: AST-Based String Inventory
 * 
 * Systematically scans ENTIRE codebase to:
 * 1. Identify ALL hardcoded strings (frontend + backend)
 * 2. Categorize by context (UI, error, validation, config)
 * 3. Generate type-safe translation keys
 * 4. Create remediation ledger for tracking
 * 
 * Uses ts-morph for robust AST analysis
 */

import { Project, SyntaxKind, Node, StringLiteral } from 'ts-morph';
import { writeFileSync } from 'fs';
import path from 'path';

interface StringOccurrence {
  file: string;
  line: number;
  column: number;
  value: string;
  context: 'jsx' | 'template' | 'literal' | 'object-key';
  category: 'ui' | 'error' | 'validation' | 'config' | 'unknown';
  suggestedKey: string;
  parentContext?: string;
}

interface InventoryResult {
  totalStrings: number;
  byCategory: Record<string, number>;
  byFile: Record<string, number>;
  occurrences: StringOccurrence[];
  exclusions: string[];
}

const EXCLUDED_PATTERNS = [
  /node_modules/,
  /\.test\./,
  /\.spec\./,
  /dist\//,
  /build\//,
  /scripts\/i18n\//,  // Don't scan our own scripts
];

const EXCLUDED_VALUES = [
  '', // Empty strings
  ' ', // Single spaces
  /^[0-9]+$/, // Pure numbers
  /^[a-z]$/, // Single letters
  /^\W+$/, // Only special chars
  /^http/, // URLs
  /^\/api/, // API routes
  /^data-testid/, // Test IDs
  /^className/, // CSS classes (handled separately)
];

const CATEGORY_PATTERNS = {
  ui: [
    /button|label|title|heading|placeholder|tooltip|description|message/i,
    /^(add|edit|delete|save|cancel|close|open|view|show|hide)/i,
  ],
  error: [
    /error|fail|invalid|required|must|cannot|forbidden/i,
  ],
  validation: [
    /min|max|length|pattern|format|valid/i,
  ],
  config: [
    /api|endpoint|url|path|route|key|secret/i,
  ],
};

function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_PATTERNS.some(pattern => pattern.test(filePath));
}

function shouldExcludeValue(value: string): boolean {
  return EXCLUDED_VALUES.some(pattern => {
    if (pattern instanceof RegExp) {
      return pattern.test(value);
    }
    return pattern === value;
  });
}

function categorizeString(value: string, context: string): StringOccurrence['category'] {
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (patterns.some(p => p.test(value) || p.test(context))) {
      return category as StringOccurrence['category'];
    }
  }
  return 'unknown';
}

function generateKey(value: string, category: string, file: string): string {
  // Extract meaningful parts
  const fileName = path.basename(file, path.extname(file));
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)  // Max 4 words
    .join('_');
  
  return `${category}.${fileName}.${normalized}`.substring(0, 80);
}

function analyzeStringLiteral(
  node: StringLiteral,
  sourceFile: any,
  filePath: string
): StringOccurrence | null {
  const value = node.getLiteralValue();
  
  if (shouldExcludeValue(value)) {
    return null;
  }
  
  const parent = node.getParent();
  let context: StringOccurrence['context'] = 'literal';
  let parentContext = '';
  
  // Determine context
  if (parent?.getKind() === SyntaxKind.JsxAttribute) {
    context = 'jsx';
    parentContext = parent.getFirstChildByKind(SyntaxKind.Identifier)?.getText() || '';
  } else if (parent?.getKind() === SyntaxKind.TemplateSpan) {
    context = 'template';
  } else if (parent?.getKind() === SyntaxKind.PropertyAssignment) {
    context = 'object-key';
    parentContext = parent.getName();
  }
  
  const category = categorizeString(value, parentContext);
  const suggestedKey = generateKey(value, category, filePath);
  
  const { line, column } = sourceFile.getLineAndColumnAtPos(node.getStart());
  
  return {
    file: filePath,
    line,
    column,
    value,
    context,
    category,
    suggestedKey,
    parentContext,
  };
}

async function scanProject(): Promise<InventoryResult> {
  console.log('🔍 Initializing AST-based string inventory...\n');
  
  const project = new Project({
    tsConfigFilePath: path.join(process.cwd(), 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });
  
  // Add source files
  const patterns = [
    'client/src/**/*.{ts,tsx}',
    'server/**/*.ts',
    'shared/**/*.ts',
  ];
  
  console.log('📁 Adding source files...');
  patterns.forEach(pattern => {
    project.addSourceFilesAtPaths(pattern);
  });
  
  const sourceFiles = project.getSourceFiles();
  console.log(`✅ Found ${sourceFiles.length} files to analyze\n`);
  
  const occurrences: StringOccurrence[] = [];
  const exclusions: string[] = [];
  const byFile: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  
  let processedFiles = 0;
  
  for (const sourceFile of sourceFiles) {
    const filePath = sourceFile.getFilePath();
    
    if (shouldExcludeFile(filePath)) {
      exclusions.push(filePath);
      continue;
    }
    
    const stringLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral);
    let fileCount = 0;
    
    for (const literal of stringLiterals) {
      const occurrence = analyzeStringLiteral(literal, sourceFile, filePath);
      if (occurrence) {
        occurrences.push(occurrence);
        fileCount++;
        byCategory[occurrence.category] = (byCategory[occurrence.category] || 0) + 1;
      }
    }
    
    if (fileCount > 0) {
      byFile[filePath] = fileCount;
      processedFiles++;
      
      if (processedFiles % 10 === 0) {
        console.log(`⏳ Processed ${processedFiles} files...`);
      }
    }
  }
  
  console.log(`\n✅ Analysis complete!\n`);
  
  return {
    totalStrings: occurrences.length,
    byCategory,
    byFile,
    occurrences,
    exclusions,
  };
}

async function main() {
  const startTime = Date.now();
  
  try {
    const result = await scanProject();
    
    // Write detailed inventory
    const inventoryPath = 'scripts/i18n/string-inventory.json';
    writeFileSync(inventoryPath, JSON.stringify(result, null, 2));
    
    // Write summary report
    const summaryPath = 'scripts/i18n/string-inventory-summary.md';
    const summary = `# String Inventory Summary
Generated: ${new Date().toISOString()}
Analysis Time: ${((Date.now() - startTime) / 1000).toFixed(2)}s

## Overview
- **Total Strings**: ${result.totalStrings}
- **Files with Strings**: ${Object.keys(result.byFile).length}
- **Excluded Files**: ${result.exclusions.length}

## By Category
${Object.entries(result.byCategory)
  .sort(([, a], [, b]) => b - a)
  .map(([cat, count]) => `- **${cat}**: ${count} (${((count / result.totalStrings) * 100).toFixed(1)}%)`)
  .join('\n')}

## Top 10 Files by String Count
${Object.entries(result.byFile)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 10)
  .map(([file, count], i) => `${i + 1}. \`${file}\`: ${count} strings`)
  .join('\n')}

## Next Steps
1. Review \`string-inventory.json\` for detailed occurrences
2. Create shared translation registry with type-safe keys
3. Build codemod to transform strings to i18n calls
4. Populate PT-BR/EN-US/ES-ES locales
5. Add ESLint rule to prevent new hardcoded strings

## Sample Occurrences
${result.occurrences.slice(0, 5).map(occ => 
  `- \`${occ.file}:${occ.line}\` [${occ.category}] "${occ.value.substring(0, 50)}..." → \`${occ.suggestedKey}\``
).join('\n')}
`;
    
    writeFileSync(summaryPath, summary);
    
    // Console output
    console.log('📊 INVENTORY RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Strings: ${result.totalStrings}`);
    console.log(`Files Analyzed: ${Object.keys(result.byFile).length}`);
    console.log('\nBy Category:');
    Object.entries(result.byCategory)
      .sort(([, a], [, b]) => b - a)
      .forEach(([cat, count]) => {
        console.log(`  ${cat.padEnd(12)}: ${count.toString().padStart(6)} (${((count / result.totalStrings) * 100).toFixed(1)}%)`);
      });
    
    console.log(`\n✅ Inventory saved to:`);
    console.log(`   ${inventoryPath}`);
    console.log(`   ${summaryPath}`);
    console.log('\n🎯 Ready for Phase 1.2: Shared translation registry\n');
    
  } catch (error) {
    console.error('❌ Error during analysis:', error);
    process.exit(1);
  }
}

main();
