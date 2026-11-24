import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('preview, switch generations, download and print the selected family chart', async ({page}) => {
  await page.goto('/');
  const upload = page.getByRole('dialog');
  if (await upload.isVisible()) await upload.getByRole('button', {name: /משפחת הדגמה|דוגמה/}).first().click();
  await page.getByRole('button', {name: 'תרשים להדפסה'}).click();
  const dialog = page.getByRole('dialog', {name: 'ייצוא תרשים משפחתי'});
  await expect(dialog.locator('.chart-preview')).toContainText('תמר לוין');
  await expect(dialog.locator('.chart-preview')).not.toContainText('שלמה לוין');
  await dialog.getByLabel('דורות של אבות ואימהות').selectOption('4');
  await expect(dialog.locator('.chart-preview')).toContainText('שלמה לוין');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', {name: 'הורדת SVG'}).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('anafim-pedigree.svg');
  const svg = await fs.readFile(await download.path(), 'utf8');
  expect(svg).toContain('שלמה לוין');
  await page.evaluate(() => { window.print = () => { window.chartPrintVisible = document.body.classList.contains('chart-printing') && !!document.querySelector('.chart-print-output svg'); window.dispatchEvent(new Event('afterprint')); }; });
  await dialog.getByRole('button', {name: 'הדפסה / PDF'}).click();
  expect(await page.evaluate(() => window.chartPrintVisible)).toBe(true);
  await expect(page.locator('body')).not.toHaveClass(/chart-printing/);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
