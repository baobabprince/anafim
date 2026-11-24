import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('preview, switch generations, download and print the selected family chart', async ({page}) => {
  await page.goto('/');
  const upload = page.getByRole('dialog');
  if (await upload.isVisible()) await upload.getByRole('button', {name: /משפחת הדגמה|דוגמה/}).first().click();
  await page.getByRole('button', {name: 'תרשים להדפסה'}).click();
  const dialog = page.getByRole('dialog', {name: 'ייצוא תרשים משפחתי'});
  await expect(dialog.locator('.chart-preview')).toContainText('תמר לוין');
  await expect(dialog.locator('.chart-preview .person[data-person-id="@I1@"] rect')).toHaveAttribute('data-sex', 'F');
  await expect(dialog.locator('.chart-preview .person[data-person-id="@I1@"] rect')).toHaveAttribute('rx', '15');
  await expect(dialog.locator('.chart-preview .person[data-person-id="@I2@"] rect')).toHaveAttribute('data-sex', 'M');
  await expect(dialog.locator('.chart-preview .person[data-person-id="@I2@"] rect')).toHaveAttribute('rx', '2');
  await expect(dialog.locator('.chart-preview')).toContainText('מין מתועד');
  await expect(dialog.locator('.chart-preview')).not.toContainText('שלמה לוין');
  await dialog.getByLabel('דורות של אבות ואימהות').selectOption('4');
  await expect(dialog.locator('.chart-preview')).toContainText('שלמה לוין');
  await dialog.getByLabel('דורות של אבות ואימהות').selectOption('6');
  await dialog.getByLabel(/הצגת ענפים צדדיים/).check();
  await expect(dialog.locator('.chart-preview')).toContainText('איתן לוין');
  const compact = dialog.getByLabel('הצגה מעגלית קומפקטית לצאצאי ענפים צדדיים');
  await expect(compact).toBeChecked();
  await compact.uncheck();
  await expect(compact).not.toBeChecked();
  await compact.check();
  await expect(dialog.locator('.chart-preview .person[data-person-id="@I1@"]')).toHaveCount(1);
  const ids = await dialog.locator('.chart-preview .person').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-person-id')));
  expect(new Set(ids).size).toBe(ids.length);
  await dialog.getByLabel('דורות צאצאים בכל ענף צדדי (ילדים = 1)').selectOption('2');
  await dialog.getByLabel('הצגת מקומות לידה ופטירה, כשמתועדים').check();
  await expect(dialog.locator('.chart-preview')).toContainText('תל אביב');
  await dialog.getByLabel('גודל נייר / PDF לרוחב').selectOption('A3');
  await expect(dialog.locator('.chart-preview svg')).toHaveAttribute('width', '420mm');
  await dialog.getByLabel('הגדלת התצוגה').selectOption('200');
  await expect(dialog.locator('.chart-preview')).toHaveCSS('--chart-zoom', '200%');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', {name: 'הורדת SVG'}).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('anafim-pedigree.svg');
  const svg = await fs.readFile(await download.path(), 'utf8');
  expect(svg).toContain('שלמה לוין');
  expect(svg).toContain('width="420mm"');
  expect(svg).toContain('data:font/ttf;base64,');
  expect(svg).toContain('data-sex="F"');
  expect(svg).toContain('data-sex="M"');
  expect(svg).toContain('מין מתועד');
  expect(svg).not.toContain('נוצר במכשיר');
  expect(svg).not.toContain('lengthAdjust=');
  expect(svg).toContain('תל אביב');
  await dialog.getByLabel('סוג התרשים').selectOption('descendants');
  await expect(dialog.getByLabel(/הצגת ענפים צדדיים/)).toHaveCount(0);
  await expect(dialog.locator('.chart-preview')).toContainText('נועה כהן');
  await expect(dialog.locator('.chart-preview')).not.toContainText('דוד לוין');
  await dialog.getByLabel('דורות של צאצאים (כולל האדם הנבחר)').selectOption('2');
  const compactDescendants = dialog.getByLabel('הצגה מעגלית לדור הצאצאים האחרון');
  await expect(compactDescendants).not.toBeChecked();
  await expect(dialog.locator('.chart-preview .branch-ring')).toHaveCount(0);
  await compactDescendants.check();
  await expect(dialog.locator('.chart-preview svg')).toHaveAttribute('data-layout', 'family-tree');
  await expect(dialog.locator('.chart-preview .branch-ring')).toHaveCount(1);
  await expect(dialog.locator('.chart-preview .person[data-compact="true"]')).toHaveCount(3);
  await compactDescendants.uncheck();
  await expect(dialog.locator('.chart-preview .branch-ring')).toHaveCount(0);
  await compactDescendants.check();
  await expect(dialog.locator('.chart-preview .person[data-person-id="@I1@"]')).toHaveCount(1);
  const descendantIds = await dialog.locator('.chart-preview .person').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-person-id')));
  expect(new Set(descendantIds).size).toBe(descendantIds.length);
  const descendantDownloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', {name: 'הורדת SVG'}).click();
  const descendantSvg = await fs.readFile(await (await descendantDownloadPromise).path(), 'utf8');
  expect(descendantSvg).toContain('תמר לוין');
  expect(descendantSvg).toContain('נועה כהן');
  expect(descendantSvg).not.toContain('שלמה לוין');
  expect(descendantSvg).toContain('דורות של צאצאים');
  expect(descendantSvg).toContain('width="420mm"');
  expect(descendantSvg).toContain('data-sex="F"');
  expect(descendantSvg).toContain('data-sex="M"');
  expect(descendantSvg).toContain('class="branch-ring"');
  expect(descendantSvg).toContain('data-compact="true"');
  expect(descendantSvg).not.toContain('נוצר במכשיר');
  await dialog.getByLabel('סוג התרשים').selectOption('ancestors');
  await expect(dialog.getByLabel('דורות של אבות ואימהות')).toHaveValue('6');
  await expect(dialog.getByLabel(/הצגת ענפים צדדיים/)).toBeChecked();
  await dialog.getByLabel('סוג התרשים').selectOption('descendants');
  await expect(dialog.getByLabel('דורות של צאצאים (כולל האדם הנבחר)')).toHaveValue('2');
  await expect(dialog.getByLabel('הצגה מעגלית לדור הצאצאים האחרון')).toBeChecked();
  await page.evaluate(() => { window.print = () => { window.chartPrintVisible = document.body.classList.contains('chart-printing') && !!document.querySelector('.chart-print-output svg') && document.querySelector('.chart-print-output svg').textContent.includes('דורות של צאצאים') && [...document.head.querySelectorAll('style')].some(style => style.textContent.includes('size: A3 landscape'));  window.dispatchEvent(new Event('afterprint')); }; });
  await dialog.getByRole('button', {name: 'הדפסה / PDF'}).click();
  await expect.poll(() => page.evaluate(() => window.chartPrintVisible)).toBe(true);
  await expect(page.locator('body')).not.toHaveClass(/chart-printing/);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('recorded divorce and widowhood are distinct in preview, download and print', async ({page}, testInfo) => {
  const fixture = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @A@ INDI
1 NAME מיקוד /בדיקה/
0 @B@ INDI
1 NAME בן /ראשון/
0 @C@ INDI
1 NAME בן /שני/
0 @D@ INDI
1 NAME בן /שלישי/
1 DEAT Y
0 @FD@ FAM
1 HUSB @A@
1 WIFE @B@
1 DIV Y
0 @FW@ FAM
1 HUSB @A@
1 WIFE @C@
1 EVEN
2 TYPE Widowhood
0 @FN@ FAM
1 HUSB @A@
1 WIFE @D@
0 TRLR`;
  await page.goto('/');
  if (!(await page.getByRole('dialog').isVisible())) await (testInfo.project.name === 'mobile' ? page.locator('.mobile-upload') : page.locator('.sidebar-upload')).click();
  await page.getByLabel('בחירת קובץ GEDCOM', {exact:true}).setInputFiles({name:'status.ged', mimeType:'text/plain', buffer:Buffer.from(fixture)});
  await page.getByRole('button', {name:'פתיחת האילן שלי', exact:true}).click();
  await expect(page.locator('.focus-card h2')).toContainText('מיקוד בדיקה');
  await page.getByRole('button', {name:'תרשים להדפסה'}).click();
  const dialog = page.getByRole('dialog', {name:'ייצוא תרשים משפחתי'});
  const preview = dialog.locator('.chart-preview');
  await expect(preview.locator('[data-family-id="@FD@"][data-relation="partner"] .union-ended')).toHaveCount(2);
  await expect(preview.locator('[data-family-id="@FW@"][data-relation="partner"] .union-ended')).toHaveCount(2);
  await expect(preview.locator('[data-family-id="@FN@"][data-relation="partner"] .union-ended')).toHaveCount(0);
  await expect(preview.locator('.union-status')).toHaveCount(2);
  await expect(preview).toContainText('גירושין');
  await expect(preview).toContainText('התאלמנות');
  await dialog.getByLabel('סוג התרשים').selectOption('descendants');
  await expect(preview.locator('.union-status')).toHaveCount(2);
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', {name:'הורדת SVG'}).click();
  const svg = await fs.readFile(await (await downloadPromise).path(), 'utf8');
  expect(svg).toContain('union-ended');
  expect(svg).toContain('גירושין');
  expect(svg).toContain('התאלמנות');
  await page.evaluate(() => { window.print = () => { window.endedUnionPrintCount = document.querySelectorAll('.chart-print-output .union-status').length; window.dispatchEvent(new Event('afterprint')); }; });
  await dialog.getByRole('button', {name:'הדפסה / PDF'}).click();
  await expect.poll(() => page.evaluate(() => window.endedUnionPrintCount)).toBe(2);
});
