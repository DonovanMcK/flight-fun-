import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// singlefile: the built game is ONE self-contained dist/index.html that runs
// from file:// with no network — required for offline play on a plane.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { target: 'es2020', assetsInlineLimit: 100000000 },
});
