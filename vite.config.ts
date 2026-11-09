import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Pure logic only. Components and browser glue are covered by the Playwright suite.
      include: [
        'src/dbml/**',
        'src/layout/**',
        'src/share/**',
        'src/export/svg.ts',
        'src/export/mermaid.ts',
        'src/export/markdown.ts',
      ],
      exclude: [
        '**/*.test.ts',
        'src/test/**',
        'src/dbml/sql.ts',
        'src/layout/engine.ts',
        'src/layout/measure.ts',
      ],
      thresholds: { statements: 80, branches: 70, functions: 80, lines: 80 },
    },
  },
})
