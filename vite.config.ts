import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "production-csp",
      apply: "build",
      transformIndexHtml(html) {
        return html.replace(
          "connect-src 'self' blob: data: ws://127.0.0.1:* ws://localhost:*;",
          "connect-src 'self' blob: data:;",
        );
      },
    },
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/tesseract.js/dist/worker.min.js",
          dest: "tesseract",
        },
        {
          src: "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
          dest: "tesseract/core",
        },
        {
          src: "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
          dest: "tesseract/core",
        },
        {
          src: "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
          dest: "tesseract/core",
        },
        {
          src: "node_modules/tesseract.js-core/LICENSE",
          dest: "tesseract/core",
        },
        {
          src: "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
          dest: "tesseract/lang",
        },
        { src: "LICENSE", dest: "." },
        { src: "THIRD_PARTY_NOTICES.md", dest: "." },
        { src: "node_modules/react/LICENSE", dest: "licenses/react" },
        { src: "node_modules/react-dom/LICENSE", dest: "licenses/react-dom" },
        { src: "node_modules/lucide-react/LICENSE", dest: "licenses/lucide-react" },
        { src: "node_modules/tesseract.js/LICENSE.md", dest: "licenses/tesseract.js" },
        { src: "node_modules/tesseract.js-core/LICENSE", dest: "licenses/tesseract.js-core" },
        { src: "node_modules/@zxing/browser/LICENSE", dest: "licenses/zxing-browser" },
        { src: "node_modules/@zxing/library/LICENSE", dest: "licenses/zxing-library" },
        { src: "node_modules/exifreader/LICENSE", dest: "licenses/exifreader" },
        { src: "licenses/tesseract-data.LICENSE", dest: "licenses/tesseract-data" },
      ],
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
});
