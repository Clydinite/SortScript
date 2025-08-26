import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '@core/': path.resolve(__dirname, './src/core/'),
      '@vscode/': path.resolve(__dirname, './src/vscode/'),
    },
  },
});
