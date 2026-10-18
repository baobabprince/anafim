import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const fixtureURL = name => new URL('../fixtures/public/'+name, import.meta.url);
const uploadButton = (page,mobile) => mobile ? page.locator('.mobile-upload') : page.locator('.sidebar-upload');
async function upload(page, mobile, filename = 'sample55516le.ged') {
  await uploadButton(page,mobile).click();
  const bytes = await fs.readFile(fixtureURL(filename));
  await page.getByLabel('בחירת קובץ GEDCOM',{exact:true}).setInputFiles({name:filename,mimeType:'application/octet-stream',buffer:bytes});
  await page.getByRole('button',{name:'פתיחת האילן שלי',exact:true}).click();
}

for (const failure of ['api-unavailable','constructor-blocked','script-blocked','unresponsive']) {
  test(`an uploaded file opens when worker is ${failure}`, async ({page},testInfo) => {
    await page.addInitScript(failure => {
      if (failure === 'api-unavailable') window.Worker = undefined;
      else if (failure === 'constructor-blocked') window.Worker = class { constructor(){ throw new DOMException('CSP worker-src none','SecurityError'); } };
      else window.Worker = class {
        postMessage(){ if(failure === 'script-blocked') queueMicrotask(()=>this.onerror?.({preventDefault(){}})); }
        terminate(){}
      };
    }, failure);
    await page.goto('/');
    await upload(page,testInfo.project.name === 'mobile');
    await expect(page.locator('.focus-card h2')).toHaveText('Robert Eugene Williams');
    await page.locator('.demo-badge').click();
    await expect(page.locator('.file-main-card')).toContainText('טעינה ישירה');
    await expect(page.locator('.file-main-card')).toContainText('2.0.1');
  });
}

test('FileReader fallback supports browsers without File.arrayBuffer', async ({page},testInfo) => {
  await page.addInitScript(()=>{Object.defineProperty(File.prototype,'arrayBuffer',{value:undefined, configurable:true});});
  await page.goto('/');
  await upload(page,testInfo.project.name === 'mobile','famhistnocustomtags.ged');
  await expect(page.locator('.focus-card h2')).toHaveText('Tom Thompson');
});

test('a protected, offline preview imports external fixtures with worker-src none', async ({page},testInfo) => {
  const html = await fs.readFile(new URL('../../../anafim.html',import.meta.url),'utf8');
  const network = []; page.on('request',r=>{if(/^https?:/.test(r.url())) network.push(r.url());});
  const {width,height} = testInfo.project.use.viewport;
  await page.setContent(`<style>html,body{margin:0}iframe{border:0}</style><iframe sandbox="allow-scripts" width="${width}" height="${height}"></iframe>`);
  const restricted = html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="worker-src \'none\'; connect-src \'none\'">');
  await page.locator('iframe').evaluate((element,html)=>{element.srcdoc=html;},restricted);
  const frame=page.frameLocator('iframe');
  await expect(frame.locator('.focus-card h2')).toHaveText('תמר לוין');
  const samples = [
    ['sample555.ged','Robert Eugene Williams'],
    ['sample55516le.ged','Robert Eugene Williams'],
    ['sample55516be.ged','Robert Eugene Williams'],
    ['TGC551.ged','Charlie Accented ANSEL'],
    ['ftmcustomtags.ged','John Johnson'],
    ['legacynocustomtags.ged','William Williams'],
    ['famhistnocustomtags.ged','Tom Thompson'],
  ];
  for(const [filename,name]of samples){
    await upload(frame,testInfo.project.name === 'mobile',filename);
    await expect(frame.locator('.focus-card h2')).toHaveText(name);
  }
  expect(network).toEqual([]);
});
