/**
 * Render FamilyChartData as a printable SVG string (A4-oriented).
 */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function yearsLabel(person) {
  if (!person) return '';
  const b = person.birthYear;
  const d = person.deathYear;
  if (b && d) return `${b} – ${d}`;
  if (b) return `${b} –`;
  if (d) return `– ${d}`;
  return '';
}

function box(x, y, w, h, person, kind = 'normal') {
  if (!person) {
    return `<rect class="box box-missing" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>`;
  }
  const cls =
    kind === 'focus' ? 'box box-focus' :
    kind === 'spouse' ? 'box box-spouse' :
    'box';
  const name = esc(person.name);
  const years = esc(yearsLabel(person));
  const half = person.half ? `<text class="label" x="${x + w / 2}" y="${y + h - 6}">½</text>` : '';
  const nameY = years ? y + 22 : y + h / 2 + 5;
  const yearsEl = years
    ? `<text class="years" x="${x + w / 2}" y="${y + 40}">${years}</text>`
    : '';
  return `
    <rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>
    <text class="name" x="${x + w / 2}" y="${nameY}">${name}</text>
    ${yearsEl}
    ${half}
  `;
}

function centerRow(items, boxW, boxH, gap, totalWidth, y, kinds = []) {
  if (!items.length) return { svg: '', centers: [] };
  const n = items.length;
  const rowW = n * boxW + (n - 1) * gap;
  let x = (totalWidth - rowW) / 2;
  const parts = [];
  const centers = [];
  items.forEach((person, i) => {
    const kind = kinds[i] || 'normal';
    parts.push(box(x, y, boxW, boxH, person, kind));
    centers.push(x + boxW / 2);
    x += boxW + gap;
  });
  return { svg: parts.join(''), centers };
}

/**
 * @param {object} chart - FamilyChartData from buildFamilyChartData
 * @returns {string} SVG markup
 */
export function renderFamilyChartSvg(chart) {
  const landscape = chart.options?.orientation !== 'portrait';
  const W = landscape ? 1100 : 794;
  const H = landscape ? 780 : 1120;
  const boxW = chart.options?.generations === 4 ? 112 : 128;
  const boxH = 52;
  const gap = 12;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" direction="rtl">`);
  parts.push(`<defs><style>
    .box { fill: #faf8f4; stroke: #5c6b4a; stroke-width: 1.4; }
    .box-focus { fill: #e8f0e0; stroke: #3d4f2f; stroke-width: 2.2; }
    .box-spouse { fill: #f5efe6; stroke: #6b5a3e; stroke-width: 1.6; }
    .box-missing { fill: #f4f4f4; stroke: #bbb; stroke-dasharray: 4 3; }
    .name { font: 600 12.5px "Segoe UI", "Arial Hebrew", Arial, sans-serif; fill: #1a1a1a; text-anchor: middle; }
    .years { font: 10.5px "Segoe UI", Arial, sans-serif; fill: #555; text-anchor: middle; }
    .label { font: 9px "Segoe UI", Arial, sans-serif; fill: #6e7a5c; text-anchor: middle; }
    .title { font: 700 17px "Segoe UI", "Arial Hebrew", Arial, sans-serif; fill: #2c3a22; text-anchor: middle; }
    .subtitle { font: 11px "Segoe UI", Arial, sans-serif; fill: #666; text-anchor: middle; }
    .gen-label { font: 9px "Segoe UI", Arial, sans-serif; fill: #8a9a7a; text-anchor: middle; letter-spacing: 0.4px; }
    .line { stroke: #7a8a6a; stroke-width: 1.3; fill: none; }
  </style></defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="#fffef9"/>`);

  // Title
  parts.push(`<text class="title" x="${W / 2}" y="32">${esc(chart.title)}</text>`);
  const genLabel = chart.options?.generations === 4 ? '4 דורות' : '3 דורות';
  const cousinNote = chart.options?.includeCousins ? ' · כולל בני דודים' : '';
  parts.push(`<text class="subtitle" x="${W / 2}" y="52">${genLabel}${cousinNote} · ${esc(chart.generatedAt)} · ענפים</text>`);

  let y = 78;

  // --- Great-grandparents (gen 4) ---
  let ggpPaternalCenters = [];
  let ggpMaternalCenters = [];
  if (chart.options?.generations === 4 && chart.greatGrandparents) {
    const left = chart.greatGrandparents.paternal || [];
    const right = chart.greatGrandparents.maternal || [];
    parts.push(`<text class="gen-label" x="${W * 0.25}" y="${y}">סב-סבים מצד אבא</text>`);
    parts.push(`<text class="gen-label" x="${W * 0.75}" y="${y}">סב-סבים מצד אמא</text>`);
    y += 14;
    const halfW = W / 2 - 40;
    const leftRow = centerRow(left.slice(0, 4), boxW - 8, boxH - 4, 8, halfW, y);
    const rightRow = centerRow(right.slice(0, 4), boxW - 8, boxH - 4, 8, halfW, y);
    // shift left row to left half, right to right half
    parts.push(`<g transform="translate(20,0)">${leftRow.svg}</g>`);
    parts.push(`<g transform="translate(${W / 2 + 20},0)">${rightRow.svg}</g>`);
    ggpPaternalCenters = leftRow.centers.map(c => c + 20);
    ggpMaternalCenters = rightRow.centers.map(c => c + W / 2 + 20);
    y += boxH + 18;
  }

  // --- Grandparents ---
  const gpP = chart.grandparents?.paternal || [];
  const gpM = chart.grandparents?.maternal || [];
  parts.push(`<text class="gen-label" x="${W * 0.25}" y="${y}">סבים מצד אבא</text>`);
  parts.push(`<text class="gen-label" x="${W * 0.75}" y="${y}">סבים מצד אמא</text>`);
  y += 14;

  const halfW = W / 2 - 30;
  const gpLeft = centerRow(gpP.length ? gpP : [null], boxW, boxH, gap, halfW, y);
  const gpRight = centerRow(gpM.length ? gpM : [null], boxW, boxH, gap, halfW, y);
  parts.push(`<g transform="translate(15,0)">${gpLeft.svg}</g>`);
  parts.push(`<g transform="translate(${W / 2 + 15},0)">${gpRight.svg}</g>`);
  const gpLeftCenters = gpLeft.centers.map(c => c + 15);
  const gpRightCenters = gpRight.centers.map(c => c + W / 2 + 15);
  y += boxH + 8;

  // connector down from grandparents
  const gpLeftMid = gpLeftCenters.length ? gpLeftCenters.reduce((a, b) => a + b, 0) / gpLeftCenters.length : W * 0.25;
  const gpRightMid = gpRightCenters.length ? gpRightCenters.reduce((a, b) => a + b, 0) / gpRightCenters.length : W * 0.75;
  if (gpLeftCenters.length > 1) {
    parts.push(`<path class="line" d="M${gpLeftCenters[0]} ${y - 8} V${y + 4} H${gpLeftCenters[gpLeftCenters.length - 1]} V${y - 8}"/>`);
  }
  if (gpRightCenters.length > 1) {
    parts.push(`<path class="line" d="M${gpRightCenters[0]} ${y - 8} V${y + 4} H${gpRightCenters[gpRightCenters.length - 1]} V${y - 8}"/>`);
  }
  parts.push(`<path class="line" d="M${gpLeftMid} ${y + 4} V${y + 22}"/>`);
  parts.push(`<path class="line" d="M${gpRightMid} ${y + 4} V${y + 22}"/>`);
  y += 28;

  // --- Parents ---
  parts.push(`<text class="gen-label" x="${W / 2}" y="${y}">הורים</text>`);
  y += 12;
  const father = chart.parents?.paternal?.[0] || null;
  const mother = chart.parents?.maternal?.[0] || null;
  const parentItems = [father, mother].filter(Boolean);
  // always reserve two slots for visual balance when possible
  const parentDisplay = father || mother ? [father, mother] : [null];
  const parentsRow = centerRow(
    parentDisplay.length === 2 ? parentDisplay : parentDisplay,
    boxW + 8,
    boxH,
    80,
    W,
    y,
  );
  parts.push(parentsRow.svg);
  const parentCenters = parentsRow.centers;
  y += boxH + 6;

  if (parentCenters.length === 2) {
    parts.push(`<path class="line" d="M${parentCenters[0]} ${y - 6} V${y + 8} H${parentCenters[1]} V${y - 6}"/>`);
    parts.push(`<path class="line" d="M${(parentCenters[0] + parentCenters[1]) / 2} ${y + 8} V${y + 28}"/>`);
  } else if (parentCenters.length === 1) {
    parts.push(`<path class="line" d="M${parentCenters[0]} ${y - 6} V${y + 28}"/>`);
  }
  y += 34;

  // --- Central row: siblings + focus + spouses ---
  parts.push(`<text class="gen-label" x="${W / 2}" y="${y}">המעגל הקרוב</text>`);
  y += 14;

  const leftSibs = (chart.siblings || []).slice(0, 4);
  const spouses = (chart.spouses || []).slice(0, 2);
  const central = [
    ...leftSibs,
    chart.focus,
    ...spouses,
  ];
  const kinds = [
    ...leftSibs.map(() => 'normal'),
    'focus',
    ...spouses.map(() => 'spouse'),
  ];
  const centralBoxW = Math.min(boxW, Math.floor((W - 40 - (central.length - 1) * gap) / Math.max(central.length, 1)));
  const centralRow = centerRow(central, centralBoxW, boxH + 4, gap, W, y, kinds);
  parts.push(centralRow.svg);

  // marriage line between focus and first spouse
  if (spouses.length && centralRow.centers.length >= leftSibs.length + 2) {
    const focusCx = centralRow.centers[leftSibs.length];
    const spouseCx = centralRow.centers[leftSibs.length + 1];
    const midY = y + (boxH + 4) / 2;
    parts.push(`<path class="line" d="M${focusCx + centralBoxW / 2 - 4} ${midY} H${spouseCx - centralBoxW / 2 + 4}"/>`);
  }

  const focusCx = centralRow.centers[leftSibs.length] ?? W / 2;
  y += boxH + 10;

  // line down to children
  if ((chart.children || []).length) {
    parts.push(`<path class="line" d="M${focusCx} ${y - 10} V${y + 16}"/>`);
    y += 22;
    parts.push(`<text class="gen-label" x="${W / 2}" y="${y}">ילדים</text>`);
    y += 12;
    const kids = chart.children.slice(0, 8);
    const kidsRow = centerRow(kids, boxW - 4, boxH, gap, W, y);
    parts.push(kidsRow.svg);
    if (kidsRow.centers.length > 1) {
      parts.push(`<path class="line" d="M${kidsRow.centers[0]} ${y} V${y - 8} H${kidsRow.centers[kidsRow.centers.length - 1]} V${y}"/>`);
      const kidsMid = kidsRow.centers.reduce((a, b) => a + b, 0) / kidsRow.centers.length;
      parts.push(`<path class="line" d="M${focusCx} ${y - 22} V${y - 8}"/>`);
      // horizontal already covers; vertical from focus already drawn
      void kidsMid;
    }
    y += boxH + 16;
  }

  // --- Cousins (optional) ---
  if (chart.options?.includeCousins && chart.cousinGroups?.length) {
    parts.push(`<text class="gen-label" x="${W / 2}" y="${y}">בני דודים</text>`);
    y += 14;
    const allCousins = chart.cousinGroups.flatMap(g => g.cousins).slice(0, 10);
    if (allCousins.length) {
      const cRow = centerRow(allCousins, boxW - 10, boxH - 4, 8, W, y);
      parts.push(cRow.svg);
      y += boxH + 12;
    }
  }

  // Footer
  parts.push(`<text class="subtitle" x="${W / 2}" y="${H - 18}">ענפים · הנתונים נשארים במכשיר · Anafim</text>`);
  parts.push('</svg>');
  return parts.join('\n');
}

/** Trigger download of an SVG string as a file. */
export function downloadSvg(svgString, filename = 'family-chart.svg') {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Open a print window with the SVG scaled for A4. */
export function printSvg(svgString, orientation = 'landscape') {
  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) return;
  const page = orientation === 'portrait' ? 'A4 portrait' : 'A4 landscape';
  win.document.write(`<!DOCTYPE html><html dir="rtl"><head><title>תרשים משפחתי</title>
    <style>
      @page { size: ${page}; margin: 8mm; }
      html, body { margin: 0; padding: 0; background: #fff; }
      .wrap { display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; }
      svg { max-width: 100%; height: auto; }
      @media print { .wrap { min-height: auto; } }
    </style></head><body><div class="wrap">${svgString}</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},200);}<\/script>
    </body></html>`);
  win.document.close();
}
