// Client-side export helpers for printable family charts: PNG rasterization
// and safe raster thumbnail conversion for embedded chart avatars.

const SAFE_RASTER_DATA_URL = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/**
 * Render an SVG string onto an offscreen canvas and trigger a PNG download.
 * Waits for document fonts before rasterizing so embedded typography matches preview.
 */
export async function exportSvgToPng(svg, { filename = 'anafim-pedigree.png', scale = 2, maxDim = 4096 } = {}) {
  if (typeof document === 'undefined') throw new Error('PNG export requires a browser environment');
  if (document.fonts?.ready) await document.fonts.ready;

  const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const vbW = viewBox ? Number(viewBox[1]) : 1200;
  const vbH = viewBox ? Number(viewBox[2]) : 800;
  if (!vbW || !vbH) throw new Error('Invalid chart viewBox');

  const factor = Math.min(scale, maxDim / Math.max(vbW, vbH));
  const width = Math.max(1, Math.round(vbW * factor));
  const height = Math.max(1, Math.round(vbH * factor));

  // Replace physical mm sizing with explicit pixel dimensions so Image draws crisply.
  const sizedSvg = svg.replace(/<svg\b([^>]*)>/, (_, attrs) => {
    const cleaned = attrs
      .replace(/\swidth="[^"]*"/, '')
      .replace(/\sheight="[^"]*"/, '');
    return `<svg${cleaned} width="${width}" height="${height}">`;
  });

  const svgUrl = URL.createObjectURL(new Blob([sizedSvg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load chart SVG into image'));
      image.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.fillStyle = '#fffef9';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Failed to encode PNG'))), 'image/png');
    });
    const pngUrl = URL.createObjectURL(pngBlob);
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(pngUrl), 60000);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/**
 * Convert a stored Blob or data URL into a validated, downscaled raster data URL
 * safe for embedding inside standalone exported SVGs.
 */
export async function photoToSafeDataUrl(photo, maxSize = 128) {
  if (!photo) return '';
  if (typeof photo === 'string') return SAFE_RASTER_DATA_URL.test(photo) ? photo : '';
  if (typeof Blob !== 'undefined' && !(photo instanceof Blob)) return '';
  if (typeof document === 'undefined') return '';

  const objectUrl = URL.createObjectURL(photo);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to decode photo'));
      image.src = objectUrl;
    });
    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    if (sw > 0 && sh > 0) {
      const side = Math.min(maxSize, Math.max(sw, sh));
      const crop = Math.min(sw, sh);
      const sx = (sw - crop) / 2;
      const sy = (sh - crop) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, sx, sy, crop, crop, 0, 0, side, side);
        const jpeg = canvas.toDataURL('image/jpeg', 0.85);
        if (SAFE_RASTER_DATA_URL.test(jpeg)) return jpeg;
      }
    }
  } catch {
    // Fall back to FileReader below.
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(SAFE_RASTER_DATA_URL.test(result) ? result : '');
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(photo);
  });
}
