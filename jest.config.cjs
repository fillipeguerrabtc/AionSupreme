/**
 * JEST CONFIGURATION - ENTERPRISE-GRADE TESTING (CommonJS)
 * 
 * Architect-approved configuration for AION KB deduplication regression suite.
 * Uses CommonJS to avoid ESM/Haste module collisions.
 */

module.exports = {
  // Use ts-jest preset (CommonJS mode for stability)
  preset: 'ts-jest',
  
  // Node.js environment
  testEnvironment: 'node',
  
  // CRITICAL: Disable ESM to avoid Haste collisions
  testEnvironmentOptions: {},
  globals: {
    'ts-jest': {
      useESM: false,
      tsconfig: {
        module: 'commonjs',
        esModuleInterop: true,
      }
    }
  },
  
  // Scope tests to server directory only
  roots: ['<rootDir>/server'],
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/tests/**/*.test.ts',
  ],
  
  // Transform TypeScript files with ts-jest
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  
  // CRITICAL: Fix ansi-styles Haste collision
  // Allow transformation of specific node_modules packages
  transformIgnorePatterns: [
    '/node_modules/(?!(ansi-styles)/)',
  ],
  
  // Module resolution
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Path aliases (match tsconfig.json)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/client/src/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@assets/(.*)$': '<rootDir>/attached_assets/$1',
  },
  
  // Coverage configuration
  collectCoverageFrom: [
    'server/**/*.ts',
    '!server/**/*.test.ts',
    '!server/**/__tests__/**',
    '!server/**/tests/**',
    '!server/index.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80,
    },
  },
  
  // Timeout for async tests
  testTimeout: 30000,
  
  // Verbose output for debugging
  verbose: true,
  
  // Clean state between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Cache directory
  cacheDirectory: '/tmp/jest-cache',
};
