module.exports = {
  preset: 'jest-expo',

  testMatch: [
    '**/__tests__/unit/**/*.test.ts',
    '**/__tests__/unit/**/*.test.tsx',
    '**/__tests__/integration/**/*.integration.test.ts',
    '**/__tests__/integration/**/*.integration.test.tsx',
  ],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.d.ts',
  ],

  coverageDirectory: 'coverage',

  coverageReporters: [
    'text',
    'html',
    'lcov',
  ],

  clearMocks: true,
};
