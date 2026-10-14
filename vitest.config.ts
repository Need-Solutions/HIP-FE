import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests for the business rules in src/lib (NFR-027, NFR-029). Pure functions, so plain Node (it has WebCrypto).
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
