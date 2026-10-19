import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const publicDir = path.resolve('public');
const svgPath = path.join(publicDir, 'favicon.svg');
const svgBuffer = fs.readFileSync(svgPath);

function renderPng(size, outputPath) {
  const resvg = new Resvg(svgBuffer, {
    fitTo: {
      mode: 'width',
      value: size,
    },
  });
  const image = resvg.render();
  fs.writeFileSync(outputPath, image.asPng());
  console.log(`Generated ${outputPath} (${size}x${size})`);
}

renderPng(180, path.join(publicDir, 'apple-touch-icon.png'));
renderPng(192, path.join(publicDir, 'icon-192.png'));
renderPng(512, path.join(publicDir, 'icon-512.png'));
renderPng(64, path.join(publicDir, 'favicon.png'));
