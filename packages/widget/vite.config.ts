import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Сборка одного самодостаточного IIFE-бандла widget.js,
// который подключается на любой сайт через <script src>.
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
    // CSS не выносим в отдельный файл — стили инлайнятся в Shadow DOM как строка.
    cssCodeSplit: false,
    target: 'es2018',
  },
});
