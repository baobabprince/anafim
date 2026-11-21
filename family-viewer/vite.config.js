import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com https://huggingface.co https://*.huggingface.co https://cdn-lfs.hf.co https://cdn-lfs-us-1.hf.co https://cdn-lfs.huggingface.co http://localhost:11434 http://127.0.0.1:11434",
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'",
].join('; ');

function productionCspPlugin() {
  return {
    name: 'anafim-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      if (/http-equiv=["']Content-Security-Policy["']/i.test(html)) return html;
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key) {
    let safe = /^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(key);
    if (!safe) {
      try {
        safe = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon';
      } catch {}
    }
    if (!safe) {
      throw new Error('Cloud configuration must contain only a public publishable/anon key. Server secrets must never be bundled.');
    }
  }
  return {
    base: '/anafim/',
    plugins: [react(), productionCspPlugin()],
    server: {
      host: '0.0.0.0',
      allowedHosts: true,
      port: 5173,
    },
    preview: {
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});
