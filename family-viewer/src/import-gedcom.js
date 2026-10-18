import { decodeGedcom, parseGedcomAsync } from './gedcom.js';

export const MAX_FILE_BYTES = 30 * 1024 * 1024;

export class GedcomImportError extends Error {
  constructor(message, code, cause) {
    super(message);
    this.name = 'GedcomImportError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function abortError() {
  const error = new Error('טעינת הקובץ בוטלה.');
  error.name = 'AbortError';
  return error;
}
function checkAbort(signal) {
  if (signal?.aborted) throw abortError();
}

function guarded(promise, { signal, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      fn(value);
    };
    const abort = () => finish(reject, abortError());
    const timer = setTimeout(() => finish(reject, new GedcomImportError(
      'קריאת הקובץ ארכה זמן רב. אם הקובץ נמצא בענן, הורידו אותו למכשיר ונסו שוב.',
      'FILE_READ_TIMEOUT',
    )), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

function readWithFileReader(file, { signal, onProgress }) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const abort = () => { reader.abort(); cleanup(); reject(abortError()); };
    reader.onload = () => { cleanup(); resolve(reader.result); };
    reader.onerror = () => { cleanup(); reject(reader.error || new Error('FileReader failed')); };
    reader.onabort = () => { cleanup(); reject(abortError()); };
    reader.onprogress = e => { if (e.lengthComputable) onProgress?.(Math.round(e.loaded / e.total * 8)); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    reader.readAsArrayBuffer(file);
  });
}

export async function readFileBuffer(file, options = {}) {
  checkAbort(options.signal);
  let lastError;
  if (typeof file.arrayBuffer === 'function') {
    try {
      const buffer = await guarded(file.arrayBuffer(), options);
      checkAbort(options.signal);
      if (buffer?.byteLength) return buffer;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
    }
  }
  // FileReader also supports older Safari and some mobile document providers.
  if (typeof FileReader !== 'undefined') {
    try {
      const buffer = await guarded(readWithFileReader(file, options), options);
      checkAbort(options.signal);
      if (buffer?.byteLength) return buffer;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
    }
  }
  if (lastError?.code === 'FILE_READ_TIMEOUT') throw lastError;
  throw new GedcomImportError(
    'הדפדפן לא הצליח לקרוא את הקובץ מהמכשיר. נסו להוריד אותו מתיקיית הענן אל המכשיר ולבחור אותו שוב.',
    'FILE_READ_FAILED',
    lastError,
  );
}

function inspectFile(buffer) {
  const b = new Uint8Array(buffer);
  const prefix = new TextDecoder().decode(b.slice(0, 256)).trimStart();
  if (prefix.startsWith('%PDF')) throw new GedcomImportError(
    'זהו קובץ PDF. יש לייצא מתוכנת אילן היוחסין קובץ GEDCOM בסיומת ‎.ged.', 'PDF_NOT_GEDCOM',
  );
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7)) {
    throw new GedcomImportError('זהו קובץ ZIP דחוס. חלצו ממנו את קובץ ה־GEDCOM ובחרו את קובץ ה־‎.ged עצמו.', 'COMPRESSED_FILE');
  }
}

function tryWorker(buffer, {
  workerFactory, encoding, signal, onProgress,
  workerStartupTimeoutMs = 1800, workerIdleTimeoutMs = 20000,
}) {
  return new Promise((resolve, reject) => {
    let worker, timer, settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (worker) {
        worker.onmessage = worker.onerror = worker.onmessageerror = null;
        try { worker.terminate(); } catch { /* A failed worker must not block fallback. */ }
      }
      fn(value);
    };
    const abort = () => finish(reject, abortError());
    const armTimer = ms => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(reject, new Error('WORKER_TIMEOUT')), ms);
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    try {
      worker = workerFactory();
      worker.onerror = event => { event.preventDefault?.(); finish(reject, new Error('WORKER_UNAVAILABLE')); };
      worker.onmessageerror = () => finish(reject, new Error('WORKER_MESSAGE_FAILED'));
      worker.onmessage = event => {
        if (settled) return;
        const result = event.data;
        if (!result || typeof result !== 'object') return;
        armTimer(workerIdleTimeoutMs);
        if (result.type === 'progress') onProgress?.(10 + Math.round(Math.min(100, Math.max(0, result.progress || 0)) * 0.89));
        else if (result.type === 'success' && result.data?.order?.length) finish(resolve, {
          data: result.data, raw: result.raw, encoding: result.encoding, importMethod: 'background',
        });
        else if (result.type === 'error') finish(reject, new Error(result.error || 'WORKER_PARSE_FAILED'));
      };
      armTimer(workerStartupTimeoutMs);
      // Keep the original bytes intact: transferring this buffer used to make a
      // direct retry impossible after the worker had failed or been blocked.
      worker.postMessage({ buffer, encoding });
    } catch (error) { finish(reject, error); }
  });
}

export async function importGedcomFile(file, {
  encoding = 'auto', signal, onProgress = () => {}, onPhase = () => {}, workerFactory,
  workerStartupTimeoutMs, workerIdleTimeoutMs,
} = {}) {
  if (!file || !file.size) throw new GedcomImportError('הקובץ שבחרתם ריק.', 'EMPTY_FILE');
  if (file.size > MAX_FILE_BYTES) throw new GedcomImportError('הקובץ גדול מ־30MB. נסו לייצא אילן מצומצם יותר.', 'FILE_TOO_LARGE');
  checkAbort(signal);
  onPhase('reading');
  onProgress(1);
  const buffer = await readFileBuffer(file, { signal, onProgress });
  inspectFile(buffer);
  checkAbort(signal);
  onProgress(10);
  if (typeof workerFactory === 'function') {
    onPhase('background');
    try {
      const result = await tryWorker(buffer, {
        encoding, signal, onProgress, workerFactory, workerStartupTimeoutMs, workerIdleTimeoutMs,
      });
      checkAbort(signal);
      onProgress(100);
      return result;
    } catch (error) {
      if (error.name === 'AbortError' || signal?.aborted) throw abortError();
      // CSP, sandboxed previews, file://, unavailable Worker APIs, crashed and
      // unresponsive workers are environmental errors, not invalid GEDCOM files.
      onPhase('compatibility');
    }
  } else onPhase('parsing');
  checkAbort(signal);
  try {
    const decoded = decodeGedcom(buffer, encoding);
    const data = await parseGedcomAsync(decoded.text, {
      signal,
      onProgress: progress => onProgress(10 + Math.round(progress * 0.89)),
    });
    if (decoded.warnings?.length) data.warnings.push(...decoded.warnings);
    onProgress(100);
    return { data, raw: decoded.text, encoding: decoded.encoding, importMethod: 'direct' };
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    const code = error.code || (/לא נמצאו אנשים/.test(error.message) ? 'NO_INDIVIDUALS' : 'GEDCOM_PARSE_FAILED');
    throw new GedcomImportError(error.message || 'לא הצלחנו לקרוא את מבנה ה־GEDCOM בקובץ.', code, error);
  }
}
