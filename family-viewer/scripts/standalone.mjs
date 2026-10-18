import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
let html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
const jsPath = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/)?.[1];
const cssPath = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/)?.[1];
if (!jsPath || !cssPath) throw new Error('Build assets not found. Run npm run build first.');
let js = await fs.readFile(path.join(dist, jsPath.slice(1)), 'utf8');
let css = await fs.readFile(path.join(dist, cssPath.slice(1)), 'utf8');
const workerMatch = js.match(/new Worker\(new URL\("([^"]*gedcom\.worker[^"]*)",import\.meta\.url\),\{type:"module"\}\)/);
if (!workerMatch) throw new Error('Could not embed the GEDCOM worker.');
const worker = await fs.readFile(path.join(dist, workerMatch[1].slice(1)), 'utf8');
const replacement = `(()=>{const u=URL.createObjectURL(new Blob([${JSON.stringify(worker)}],{type:"text/javascript"}));const w=new Worker(u,{type:"classic"});const clear=()=>URL.revokeObjectURL(u);w.addEventListener("message",clear,{once:true});w.addEventListener("error",clear,{once:true});return w;})()`;
js = js.replace(workerMatch[0], replacement);
for (const font of await fs.readdir(path.join(root, 'public', 'fonts'))) {
  const base64 = (await fs.readFile(path.join(root, 'public', 'fonts', font))).toString('base64');
  css = css.replaceAll(`/fonts/${font}`, `data:font/ttf;base64,${base64}`);
}
const favicon = (await fs.readFile(path.join(root, 'public', 'favicon.svg'))).toString('base64');
html = html.replace(/<link[^>]+rel="preload"[^>]*>/g, '');
html = html.replace(/<link[^>]+href="[^"]+\.css"[^>]*>/, () => `<style>${css}</style>`);
html = html.replace(/<script[^>]+src="[^"]+"[^>]*><\/script>/, () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace('href="/favicon.svg"', `href="data:image/svg+xml;base64,${favicon}"`);
html = html.replace('<div id="root"></div>', '<div id="root"></div><noscript>כדי להשתמש בענפים, יש לאפשר JavaScript בדפדפן.</noscript>');
html = html.replace('<head>', '<head>\n    <!-- ענפים: self-contained, private GEDCOM viewer. No external dependencies or network requests. -->');
const destination = path.resolve(root, '..', 'anafim.html');
await fs.writeFile(destination, html);
console.log(`Standalone viewer saved: ${destination} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
