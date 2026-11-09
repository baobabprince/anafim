/**
 * Network settings for Transformers.js.
 *
 * - Production: the ONNX runtime (wasm) is served from this site (dist/ort/),
 *   not from cdn.jsdelivr.net.
 * - Optional Hugging Face mirror, for networks where huggingface.co is blocked:
 *     localStorage.setItem('anafim_hf_host', 'https://hf-mirror.com/')
 */
export function configureEnv(env) {
  try {
    if (import.meta.env.PROD && env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.wasmPaths = new URL(`${import.meta.env.BASE_URL}ort/`, window.location.href).href;
    }
  } catch {
    // keep the default CDN path
  }
  try {
    const host = localStorage.getItem('anafim_hf_host');
    if (host) env.remoteHost = host.endsWith('/') ? host : `${host}/`;
  } catch {
    // ignore
  }
}
