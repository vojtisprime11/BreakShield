import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals:     false,
    environment: 'node',
    include:     ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include:  ['lib/analysis/**'],
      exclude:  ['lib/analysis/types.ts'],
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines:      90,
        functions:  90,
        branches:   85,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
