// Copies the ONNX runtime files that Transformers.js needs into dist/ort/,
// so the site serves them itself instead of loading them from a CDN.
import { cpSync, mkdirSync } from 'node:fs';

const src = 'node_modules/@huggingface/transformers/dist';
const dest = 'dist/ort';
mkdirSync(dest, { recursive: true });
for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  cpSync(`${src}/${f}`, `${dest}/${f}`);
}
console.log('copied ONNX runtime to', dest);
