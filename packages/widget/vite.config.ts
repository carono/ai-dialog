import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Builds a single self-contained IIFE bundle widget.js,
// which is embedded into any site via <script src>.
export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {
      entry: 'src/main.tsx',
      name: 'AIDialog',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    // We don't split CSS into a separate file — styles are inlined into the Shadow DOM as a string.
    cssCodeSplit: false,
    target: 'es2018',
  },
});
