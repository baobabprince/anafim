import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const custom = `0 HEAD\n1 SOUR TEST\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 @C@ INDI\n1 NAME דנה /ישראלי/\n1 SEX F\n1 BIRT\n2 DATE 5 JAN 1990\n2 PLAC באר שבע, ישראל\n1 FAMC @F1@\n1 NOTE סיפור משפחתי מיוחד\n0 @P@ INDI\n1 NAME אריה /ישראלי/\n1 SEX M\n1 BIRT\n2 DATE ABT 1960\n0 @M@ INDI\n1 NAME עליזה /ישראלי/\n1 SEX F\n0 @S@ INDI\n1 NAME דניאל /ישראלי/\n1 SEX M\n0 @F1@ FAM\n1 HUSB @P@\n1 WIFE @M@\n1 CHIL @C@\n1 CHIL @S@\n0 TRLR`;
async function openUpload(page, mobile) {
  await (mobile ? page.locator('.mobile-upload') : page.locator('.sidebar-upload')).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function chooseFile(page, content = custom, name = 'משפחת-ישראלי.ged') {
  await page.getByLabel('בחירת קובץ GEDCOM', {exact:true}).setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(content)});
}
test.beforeEach(async ({page}) => {
  await page.goto('/');
  await page.evaluate(()=>document.fonts.ready);
});

test('focused tree, collapsed relatives, navigation and history work', async ({page}) => {
  await expect(page.locator('.focus-card h2')).toHaveText('תמר לוין');
  await expect(page.locator('.parent-card')).toHaveCount(2);
  await expect(page.locator('.relative-trigger[aria-expanded="false"]')).toHaveCount(3);
  const children = page.locator('.relative-section').filter({has:page.locator('#relatives-children')});
  await children.locator('.relative-trigger').click();
  await expect(children.locator('.relative-person')).toHaveCount(3);
  await children.getByRole('button').filter({hasText:'נועה כהן'}).click();
  await expect(page.locator('.focus-card h2')).toHaveText('נועה כהן');
  await expect(page.locator('.parent-card')).toHaveText([/איתי כהן/,/תמר לוין/]);
  await page.getByRole('button',{name:'חזרה לאדם הקודם',exact:true}).click();
  await expect(page.locator('.focus-card h2')).toHaveText('תמר לוין');
  await page.getByRole('button',{name:'מעבר למבט המשפחתי של דוד לוין',exact:true}).click();
  await expect(page.locator('.focus-card h2')).toHaveText('דוד לוין');
  await expect(page.locator('.parent-card')).toHaveText([/יוסף לוין/,/מרים לוין/]);
});

test('search by name, keyboard selection and searchable directory work', async ({page}) => {
  const input = page.getByRole('combobox');
  await input.fill('רחל');
  await expect(page.getByRole('option')).toHaveCount(1);
  await input.press('ArrowDown'); await input.press('Enter');
  await expect(page.locator('.focus-card h2')).toHaveText('רחל לוין');
  await expect(page.locator('.parent-card')).toHaveText([/משה שפירא/,/לאה שפירא/]);
  await input.fill('2014'); await input.press('Enter');
  await expect(page.locator('.directory-person')).toHaveCount(1);
  await expect(page.locator('.directory-person')).toContainText('יואב כהן');
  await page.getByRole('button',{name:'ניקוי החיפוש',exact:true}).last().click();
  await expect(page.locator('.directory-person')).toHaveCount(24);
  await page.getByRole('button',{name:/^נשים/}).click();
  await expect(page.locator('.directory-person')).toHaveCount(13);
  await page.getByLabel('מיון אנשים').selectOption('birth');
  await expect(page.locator('.directory-person').first()).toContainText('רבקה לוין');
});

test('real file import, local persistence and deletion work', async ({page}, testInfo) => {
  const errors = []; page.on('pageerror',e=>errors.push(e.message));
  const requests = []; page.on('request',r=>{if(r.method() === 'POST')requests.push(r.url());});
  await openUpload(page,testInfo.project.name === 'mobile');
  await chooseFile(page);
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'פתיחת האילן שלי',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.focus-card h2')).toHaveText('דנה ישראלי');
  await expect(page.locator('.parent-card')).toHaveCount(2);
  await expect(page.locator('.details-card')).toContainText('5 בינואר 1990');
  await expect(page.locator('.details-card')).toContainText('סיפור משפחתי מיוחד');
  await page.reload();
  await expect(page.locator('.focus-card h2')).toHaveText('דנה ישראלי');
  await page.locator('.demo-badge').click();
  await expect(page.locator('.file-main-card')).toContainText('משפחת-ישראלי.ged');
  await page.getByRole('button',{name:'מחיקת העותק השמור מהמכשיר',exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem('anafim-gedcom-v1'))).toBeNull();
  await page.reload(); await expect(page.locator('.focus-card h2')).toHaveText('תמר לוין');
  expect(errors).toEqual([]); expect(requests).toEqual([]);
});

test('invalid file reports an error and retry preserves current data', async ({page},testInfo) => {
  await openUpload(page,testInfo.project.name === 'mobile');
  await chooseFile(page,'not a GEDCOM','bad.ged');
  await page.getByRole('button',{name:'פתיחת האילן שלי',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('לא נמצאו אנשים');
  await chooseFile(page,'%PDF-1.4','wrong.pdf');
  await expect(page.getByRole('alert')).toContainText('GEDCOM');
  await page.getByRole('button',{name:'סגירה',exact:true}).click();
  await expect(page.locator('.focus-card h2')).toHaveText('תמר לוין');
  await openUpload(page,testInfo.project.name === 'mobile');
  await chooseFile(page,custom.replace('1 WIFE @M@\n',''));
  await page.getByRole('button',{name:'פתיחת האילן שלי',exact:true}).click();
  await expect(page.locator('.focus-card h2')).toHaveText('דנה ישראלי');
  await expect(page.locator('.parent-card')).toHaveCount(1);
  expect(await page.evaluate(()=>localStorage.getItem('anafim-gedcom-v1'))).toBeNull();
});

test('Hebrew Windows-1255 file is decoded locally', async ({page},testInfo) => {
  await openUpload(page,testInfo.project.name === 'mobile');
  const head = Buffer.from('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR WINDOWS-1255\n0 @I1@ INDI\n1 NAME ');
  const name = Buffer.from([0xf0,0xf2,0xee,0xe9]); // נעמי
  const buffer = Buffer.concat([head,name,Buffer.from('\n1 SEX F\n0 TRLR')]);
  await page.getByLabel('בחירת קובץ GEDCOM',{exact:true}).setInputFiles({name:'hebrew.ged',mimeType:'text/plain',buffer});
  await page.getByRole('button',{name:'פתיחת האילן שלי',exact:true}).click();
  await expect(page.locator('.focus-card h2')).toHaveText('נעמי');
  await expect(page.locator('.no-parents')).toBeVisible();
});

test('GEDCOM download and print/PDF action work', async ({page}) => {
  await page.locator('.demo-badge').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button',{name:'הורדת קובץ GEDCOM',exact:true}).click();
  const download = await downloadPromise;
  const contents = await fs.readFile(await download.path(),'utf8');
  expect(contents).toContain('0 HEAD'); expect(contents).toContain('1 CHAR UTF-8'); expect(contents).toContain('תמר /לוין/');
  if (await page.locator('.mobile-bottom-nav').isVisible()) await page.locator('.mobile-bottom-nav button').first().click();
  else await page.locator('.brand-button').click();
  await page.evaluate(()=>{window.print=()=>{window.__printCalled=true;};});
  await page.locator('.print-button').click();
  expect(await page.evaluate(()=>window.__printCalled)).toBe(true);
  await page.emulateMedia({media:'print'});
  await expect(page.locator('#relatives-children')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
});

test('portrait layouts have no horizontal overflow', async ({page}) => {
  for (const width of [320,360,390,430,768,1024,1440]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),`width ${width}`).toBe(true);
  }
});
