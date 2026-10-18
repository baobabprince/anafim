import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('primary views have no automatically detectable WCAG A/AA violations', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const scenarios = [
    ['family', async () => {}],
    ['directory', async () => page.getByRole('button', { name: 'הצגת כל האנשים', exact: true }).click()],
    ['file', async () => page.locator('.demo-badge').click()],
    ['upload', async () => {
      if (testInfo.project.name === 'mobile') await page.locator('.mobile-upload').click();
      else await page.locator('.sidebar-upload').click();
    }],
  ];
  for (const [name, open] of scenarios) {
    await open();
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
    const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(report.violations, `${name}: ${JSON.stringify(report.violations.map(v => ({id:v.id, nodes:v.nodes.map(n=>n.target)})))}`).toEqual([]);
  }
});

test('mobile navigation opens, closes with Escape, and navigates to the file', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.goto('/');
  const open = page.getByRole('button', { name: 'פתיחת תפריט', exact: true });
  await open.click();
  await expect(open).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.sidebar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(open).toHaveAttribute('aria-expanded', 'false');
  await open.click();
  await page.locator('.sidebar .nav-item').filter({hasText:'פרטי הקובץ'}).click();
  await expect(page.locator('.file-main-card')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
});


test('richer information and expanded families have no automated WCAG A/AA violations',async({page})=>{
  await page.goto('/');await page.evaluate(()=>document.fonts.ready);
  for(const state of ['timeline','sources','expanded']){
    if(state !== 'expanded')await page.locator(`#person-tab-${state}`).click();
    else{
      await page.locator('#person-tab-overview').click();
      await expect(page.locator('#grandparents-generation')).toBeVisible();
      for(const button of await page.locator('.relative-trigger').all())await button.click();
      await page.locator('.fx-branch-toggle').click();
    }
    if(state === 'sources')await page.locator('.fx-raw-record summary').click();
    await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
    const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
    expect(report.violations,`${state}: ${JSON.stringify(report.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))}`).toEqual([]);
  }
});
