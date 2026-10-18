import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
const raw=decl=>`0 HEAD\n1 SOUR ENCODING_REGRESSION\n1 GEDC\n2 VERS 5.5.1\n${decl?`1 CHAR ${decl}\n`:''}0 @A@ INDI\n1 NAME יעל /בדיקתקידוד/\n0 TRLR`;
const fixtures=[
 {name:'utf8-without-bom.ged',buffer:Buffer.from(raw('')),warning:null},
 {name:'utf8-bom-stale-1255.ged',buffer:Buffer.concat([Buffer.from([239,187,191]),Buffer.from(raw('WINDOWS-1255'))]),warning:'הצהרת הקידוד'},
 {name:'utf8-stale-ansel.ged',buffer:Buffer.from(raw('ANSEL')),warning:'הצהרת הקידוד'},
 {name:'utf8-with-damaged-note.ged',buffer:Buffer.concat([Buffer.from(raw('UTF-8')+'\n0 @N@ NOTE damaged '),Buffer.from([255])]),warning:'תווים פגומים'},
];
async function upload(scope,mobile,fixture,manual){
 await (mobile?scope.locator('.mobile-upload'):scope.locator('.sidebar-upload')).click();
 if(manual)await scope.getByLabel('קידוד הקובץ',{exact:true}).selectOption(manual);else await expect(scope.getByLabel('קידוד הקובץ',{exact:true})).toHaveValue('auto');
 await scope.getByLabel('בחירת קובץ GEDCOM',{exact:true}).setInputFiles({name:fixture.name,buffer:fixture.buffer,mimeType:'application/octet-stream'});
 await scope.getByRole('button',{name:'פתיחת האילן שלי',exact:true}).click();
 await expect(scope.locator('.focus-card h2')).toHaveText('יעל בדיקתקידוד');await scope.locator('.demo-badge').click();
}
for(const blocked of [false,true]){
 test(`UTF-8 content wins over stale declarations and damage is warned with ${blocked?'direct fallback':'the real worker'}`,async({page},info)=>{
  if(blocked)await page.addInitScript(()=>{window.Worker=undefined;});await page.goto('/');const mobile=info.project.name==='mobile';
  for(const fixture of fixtures){await upload(page,mobile,fixture);await expect(page.locator('.metadata-list').locator('div').filter({has:page.getByText('קידוד שנקרא',{exact:true})})).toContainText('UTF-8');await expect(page.locator('.file-main-card')).toContainText(blocked?'טעינה ישירה':'עיבוד ברקע');if(fixture.warning)await expect(page.locator('.warnings-card')).toContainText(fixture.warning);}
  const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();expect(report.violations).toEqual([]);
 });
}
test('the standalone protected offline viewer includes the same UTF-8 fix without a worker',async({page},info)=>{
 const network=[];page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});const html=await fs.readFile(new URL('../../../anafim.html',import.meta.url),'utf8');
 const {width,height}=info.project.use.viewport;await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}iframe{border:0}</style><iframe sandbox="allow-scripts" width="${width}" height="${height}"></iframe>`);
 await page.locator('iframe').evaluate((el,html)=>{el.srcdoc=html;},html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="worker-src \'none\'; connect-src \'none\'">'));
 const frame=page.frameLocator('iframe');await expect(frame.locator('.focus-card h2')).toHaveText('תמר לוין');
 await upload(frame,info.project.name==='mobile',fixtures[1]);await expect(frame.locator('.warnings-card')).toContainText('הצהרת הקידוד');await expect(frame.locator('.file-main-card')).toContainText('UTF-8');expect(network).toEqual([]);
});
test('manual Windows-1255 still works when the file falsely declares UTF-8',async({page},info)=>{
 await page.goto('/');const bytes=Uint8Array.from([...raw('UTF-8')].map(c=>c.charCodeAt(0)>=0x05d0&&c.charCodeAt(0)<=0x05ea?c.charCodeAt(0)-0x05d0+0xe0:c.charCodeAt(0)));
 await upload(page,info.project.name==='mobile',{name:'manual-1255.ged',buffer:Buffer.from(bytes)},'windows-1255');await expect(page.locator('.file-main-card')).toContainText('WINDOWS-1255');await expect(page.locator('.file-main-card')).toContainText('בחירה ידנית');
});
