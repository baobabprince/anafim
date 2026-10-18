import { decodeGedcom, parseGedcom } from './gedcom.js';
self.onmessage = event => {
  try {
    const { buffer, encoding } = event.data;
    self.postMessage({ type: 'progress', progress: 5 });
    const decoded = decodeGedcom(buffer, encoding);
    const data = parseGedcom(decoded.text, progress => self.postMessage({ type: 'progress', progress }));
    if(decoded.warnings.length)data.warnings.push(...decoded.warnings);
    self.postMessage({ type: 'success', data, raw: decoded.text, encoding: decoded.encoding, encodingInfo:decoded.encodingInfo });
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message || 'לא הצלחנו לקרוא את הקובץ. נסו קובץ GEDCOM אחר.' });
  }
};
