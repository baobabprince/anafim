import { test, expect } from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/');await page.evaluate(()=>document.fonts.ready);});

test('the selected person and parents show complete dates, places and occupations',async({page})=>{
  await expect(page.locator('.focus-card')).toContainText('12 במאי 1985');
  await expect(page.locator('.focus-card')).toContainText('18 בספטמבר 2009');
  await expect(page.locator('.focus-card')).toContainText('אדריכלית');
  const father=page.locator('.parent-card').filter({hasText:'דוד לוין'});
  await expect(father).toContainText('8 במרץ 1954');
  await expect(father).toContainText('חיפה, ישראל');
  await expect(father).toContainText('מהנדס בניין');
  await expect(page.locator('.relative-trigger[aria-expanded=false]')).toHaveCount(3);
});

test('grandparents are visible by default, fully named, grouped by parent and navigable',async({page})=>{
  await expect(page.getByRole('button',{name:'הסתרת סבים וסבתות',exact:true})).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('.fx-grandparents .fx-grandparent-card')).toHaveCount(4);
  await expect(page.locator('.fx-side-paternal')).toContainText('מצד אבא');
  await expect(page.locator('.fx-side-paternal')).toContainText('יוסף לוין');
  await expect(page.locator('.fx-side-maternal')).toContainText('לאה שפירא');
  await page.locator('.fx-grandparents').getByRole('button',{name:'מעבר אל יוסף לוין',exact:true}).click();
  await expect(page.locator('.focus-card h2')).toHaveText('יוסף לוין');
  await expect(page.locator('.focus-card')).toContainText('6 בינואר 2002');
  await expect(page.locator('.focus-card')).toContainText('78 שנים');
});

test('profile tabs show a complete timeline, source citations and the original record',async({page})=>{
  await page.getByRole('tab',{name:'ציר זמן',exact:true}).click();
  const timeline=page.getByRole('tabpanel',{name:'ציר זמן',exact:true});
  await expect(timeline).toBeVisible();
  await expect(timeline).toContainText('18 בספטמבר 2009');
  await expect(timeline).toContainText('עם איתי כהן');
  await page.getByRole('tab',{name:/מקורות/}).click();
  const sources=page.locator('#person-panel-sources');
  await expect(sources.locator('.fx-source-card')).toHaveCount(3);
  await expect(sources).toContainText('אלבום משפחת לוין');
  await expect(sources).toContainText('מקור בדוי');
  await sources.locator('summary').click();
  await expect(sources.locator('pre')).toContainText('1 NAME תמר /לוין/');
  await page.getByRole('tab',{name:'פרטים',exact:true}).click();
  await page.getByRole('button',{name:'לקריאת הסיפור המלא',exact:true}).click();
  await expect(page.locator('#person-panel-overview')).toContainText('בכל יום שישי');
});

test('rolled-up relative nodes can be selected without opening full cards',async({page})=>{
  await page.getByRole('button',{name:'מעבר אל נועה כהן',exact:true}).click();
  await expect(page.locator('.focus-card h2')).toHaveText('נועה כהן');
  await expect(page.locator('.parent-card')).toHaveText([/איתי כהן/,/תמר לוין/]);
});

test('branch counts open a list of actual descendants and navigate to them',async({page})=>{
  await expect(page.locator('.fx-branch-stats')).toContainText('10');
  await page.locator('.fx-branch-stats').getByRole('button',{name:/3.*צאצאים/}).click();
  await expect(page.locator('.fx-branch-people>button')).toHaveCount(3);
  await page.locator('.fx-branch-people').getByRole('button').filter({hasText:'מאיה כהן'}).click();
  await expect(page.locator('.focus-card h2')).toHaveText('מאיה כהן');
});

test('all expanded information remains within narrow portrait layouts',async({page})=>{
  await expect(page.locator('#grandparents-generation')).toBeVisible();
  for(const button of await page.locator('.relative-trigger').all())await button.click();
  for(const width of [320,360,390,430,768,1024,1440]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),`width ${width}`).toBe(true);
  }
});


test('profile tabs support RTL arrow keys, Home and End',async({page})=>{
  const overview=page.getByRole('tab',{name:'פרטים',exact:true});
  await overview.focus();await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab',{name:'ציר זמן',exact:true})).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('End');
  await expect(page.getByRole('tab',{name:/מקורות/})).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('Home');
  await expect(overview).toHaveAttribute('aria-selected','true');
});


test('grandparents can be collapsed and restored without changing the selected person',async({page})=>{
  await page.getByRole('button',{name:'הסתרת סבים וסבתות',exact:true}).click();
  await expect(page.locator('#grandparents-generation')).toBeHidden();
  await expect(page.locator('.parent-card')).toHaveCount(2);
  await expect(page.locator('.focus-card h2')).toHaveText('תמר לוין');
  await page.getByRole('button',{name:'הצגת סבים וסבתות',exact:true}).click();
  await expect(page.locator('#grandparents-generation')).toBeVisible();
  await expect(page.locator('.fx-grandparent-card')).toHaveCount(4);
});


test('grandparent branches align with and visibly connect to the corresponding parent',async({page})=>{
  for(const width of [320,390,768,1024,1440]){
    await page.setViewportSize({width,height:950});
    const geometry=await page.evaluate(()=>{
      const parents=[...document.querySelectorAll('.parent-card')];
      return [...document.querySelectorAll('.fx-grandparent-side')].map((side,index)=>{
        const s=side.getBoundingClientRect(),p=parents[index].getBoundingClientRect(),line=side.querySelector('.fx-grandparent-stem').getBoundingClientRect();
        return {centerDifference:Math.abs((s.left+s.width/2)-(p.left+p.width/2)),connectorGap:Math.abs(line.bottom-p.top)};
      });
    });
    for(const item of geometry){expect(item.centerDifference,`centers at ${width}`).toBeLessThan(1);expect(item.connectorGap,`connector at ${width}`).toBeLessThanOrEqual(2);}
  }
});

test('missing grandparents are explicit and alternative grandparent families can be selected',async({page},testInfo)=>{
  const fixture=`0 HEAD
1 CHAR UTF-8
0 @C@ INDI
1 NAME ילד /בדיקה/
1 FAMC @FR@
0 @P@ INDI
1 NAME אורי /בדיקה/
1 SEX M
1 FAMC @FB@
2 PEDI birth
1 FAMC @FA@
2 PEDI adopted
0 @M@ INDI
1 NAME נעמה /בדיקה/
1 SEX F
0 @B1@ INDI
1 NAME סבא /לידה/
1 SEX M
0 @B2@ INDI
1 NAME סבתא /לידה/
1 SEX F
0 @A1@ INDI
1 NAME סבא /אימוץ/
1 SEX M
0 @A2@ INDI
1 NAME סבתא /אימוץ/
1 SEX F
0 @FR@ FAM
1 HUSB @P@
1 WIFE @M@
1 CHIL @C@
0 @FB@ FAM
1 HUSB @B1@
1 WIFE @B2@
1 CHIL @P@
0 @FA@ FAM
1 HUSB @A1@
1 WIFE @A2@
1 CHIL @P@
0 TRLR`;
  await (testInfo.project.name==='mobile' ? page.locator('.mobile-upload') : page.locator('.sidebar-upload')).click();
  await page.getByLabel('בחירת קובץ GEDCOM',{exact:true}).setInputFiles({name:'grandparents-test.ged',mimeType:'text/plain',buffer:Buffer.from(fixture)});
  await page.getByRole('button',{name:'פתיחת האילן שלי',exact:true}).click();
  await expect(page.locator('.focus-card h2')).toHaveText('ילד בדיקה');
  await expect(page.locator('.fx-grandparent-card')).toHaveCount(2);
  await expect(page.locator('.fx-side-maternal .fx-grandparent-missing')).toContainText('לא תועדו');
  await expect(page.locator('.fx-side-paternal')).toContainText('סבא לידה');
  await page.getByRole('combobox',{name:'בחירת משפחת סבים של אורי בדיקה',exact:true}).selectOption('@FA@');
  await expect(page.locator('.fx-side-paternal')).toContainText('סבא אימוץ');
  await expect(page.locator('.fx-side-paternal')).not.toContainText('סבא לידה');
  await expect(page.locator('.fx-grandparent-card')).toHaveCount(2);
  await expect(page.locator('.focus-card h2')).toHaveText('ילד בדיקה');
});
