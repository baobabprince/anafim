import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { isImageFile, resolveGedcomPhotos, validatePhotoFile } from '../src/photo-storage.js';

test('GEDCOM media paths match selected raster images by basename', () => {
  const data = {
    order: ['@A@', '@B@'],
    people: {
      '@A@': { images: ['C:\\family\\portraits\\Ada.JPG'] },
      '@B@': { images: ['missing.png'] },
    },
  };
  const image = new File(['photo'], 'ada.jpg', { type: 'image/jpeg' });
  const resolved = resolveGedcomPhotos(data, [image]);
  assert.deepEqual(resolved.photos['@A@'], [image]);
  assert.equal(resolved.matched, 1);
  assert.equal(resolved.unmatched, 1);
});

test('multiple GEDCOM photo references are all matched for one person', () => {
  const data = {
    order: ['@A@'],
    people: { '@A@': { images: ['ada.jpg', 'ada-second.jpg'] } },
  };
  const first = new File(['first'], 'ada.jpg', { type:'image/jpeg' });
  const second = new File(['second'], 'ada-second.jpg', { type:'image/jpeg' });
  const resolved = resolveGedcomPhotos(data, [first, second]);
  assert.deepEqual(resolved.photos['@A@'], [first, second]);
  assert.equal(resolved.matched, 1);
  assert.equal(resolved.unmatched, 0);
});

test('duplicate selected basenames are not assigned to the wrong person', () => {
  const data = {
    order: ['@A@'],
    people: { '@A@': { images: ['portraits/ada.jpg'] } },
  };
  const resolved = resolveGedcomPhotos(data, [
    new File(['first'], 'ada.jpg', { type:'image/jpeg' }),
    new File(['second'], 'ada.jpg', { type:'image/jpeg' }),
  ]);
  assert.equal(resolved.matched, 0);
  assert.equal(resolved.unmatched, 1);
});

test('photo validation accepts supported raster formats and rejects SVG and oversized files', () => {
  const png = new File(['photo'], 'portrait.png', { type: 'image/png' });
  const svg = new File(['<svg/>'], 'portrait.svg', { type: 'image/svg+xml' });
  const oversized = new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'portrait.jpg', { type: 'image/jpeg' });
  assert.equal(isImageFile(png), true);
  assert.equal(isImageFile(svg), false);
  assert.throws(() => validatePhotoFile(svg), /קובץ תמונה/);
  assert.throws(() => validatePhotoFile(oversized), /15MB/);
});
