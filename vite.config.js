import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        cadViewer: resolve(__dirname, 'cad-viewer.html')
      },
      output: {
        manualChunks: {
          three: ['three']
        }
      }
    }
  }
});
