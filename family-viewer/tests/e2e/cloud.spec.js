import {test,expect} from '@playwright/test';import AxeBuilder from '@axe-core/playwright';
const URL='https://unit-cloud.invalid',UID='11111111-2222-4333-8444-555555555555',KEY='sb_publishable_testpublicconfiguration';
const family=name=>`0 HEAD\n1 CHAR UTF-8\n0 @C@ INDI\n1 NAME ${name} /משפחתבדיקה/\n1 SEX F\n1 BIRT\n2 DATE 1 JAN 2000\n0 TRLR`;
function session(){const exp=Math.floor(Date.now()/1000)+86400;const user={id:UID,aud:'authenticated',role:'authenticated',email:'test@example.test',app_metadata:{provider:'google',providers:['google']},user_metadata:{},created_at:new Date().toISOString()};const token=['e30',Buffer.from(JSON.stringify({sub:UID,aud:'authenticated',role:'authenticated',exp})).toString('base64url'),'signature'].join('.');return {access_token:token,refresh_token:'test-refresh-token',expires_at:exp,expires_in:86400,token_type:'bearer',user};}
async function mockCloud(context,state,authenticated=true){
 await context.addInitScript(({URL,KEY,auth})=>{localStorage.setItem('anafim-cloud-public-config-v1',JSON.stringify({url:URL,key:KEY}));if(auth)localStorage.setItem('anafim-auth-unit-cloud.invalid',JSON.stringify(auth));},{URL,KEY,auth:authenticated?session():null});
 await context.routeWebSocket('wss://unit-cloud.invalid/**',ws=>ws.close());
 await context.route('https://unit-cloud.invalid/**',async route=>{
  const req=route.request(),u=new globalThis.URL(req.url()),path=decodeURIComponent(u.pathname);const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,DELETE,PUT,PATCH,OPTIONS'};
  const json=(data,status=200)=>route.fulfill({status,headers:{...headers,'content-type':'application/json'},body:JSON.stringify(data)});
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(path==='/auth/v1/user')return json(session().user);
  if(path==='/auth/v1/logout')return json({});
  if(path==='/auth/v1/authorize'){state.authorize=req.url();return route.fulfill({status:200,headers,contentType:'text/html',body:'OAuth redirect contract reached; no real Google service used.'});}
  if(path==='/rest/v1/anafim_vault_heads')return json(state.head?[state.head]:[]);
  if(path==='/rest/v1/anafim_vault_versions')return json([...state.versions].reverse());
  const object=path.match(/\/storage\/v1\/object\/(?:authenticated\/)?anafim-vaults\/(.+)$/);
  if(object&&req.method()==='POST'){
    if(state.failNextUpload){state.failNextUpload=false;return json({message:'Temporary simulated upload failure'},400);}
    const buffer=req.postDataBuffer(),type=req.headers()['content-type'];let bytes;
    if(type?.includes('multipart/form-data')){const form=await new Response(buffer,{headers:{'content-type':type}}).formData();for(const value of form.values())if(typeof value!=='string')bytes=Buffer.from(await value.arrayBuffer());}else bytes=buffer;
    state.objects.set(object[1],bytes);return json({Key:'anafim-vaults/'+object[1]});
  }
  if(object&&req.method()==='GET'){const bytes=state.objects.get(object[1]);return route.fulfill({status:bytes?200:404,headers:{...headers,'content-type':'application/octet-stream'},body:bytes||'missing'});}
  if(path==='/rest/v1/rpc/anafim_commit_vault'){
    const p=req.postDataJSON();state.manifests.push(p);
    if((state.head?.revision_id||null)!==p.p_expected_revision)return json({code:'40001',message:'ANAFIM_CONFLICT'},409);
    state.head={user_id:UID,vault_id:p.p_vault_id,revision_id:p.p_revision_id,generation:(state.head?.generation||0)+1,envelope:p.p_envelope,encrypted_bytes:p.p_encrypted_bytes,updated_at:new Date().toISOString()};state.versions.push(state.head);return json(state.head);
  }
  return json({message:'Unexpected mock route '+path},400);
 });
}
async function virtualPasskey(page,prf=true){const cdp=await page.context().newCDPSession(page);await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',ctap2Version:'ctap2_1',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:prf}});}
async function importFamily(page,name){
 const mobile=await page.locator('.mobile-bottom-nav').isVisible();await (mobile?page.locator('.mobile-upload'):page.locator('.sidebar-upload')).click();await page.getByLabel('בחירת קובץ GEDCOM',{exact:true}).setInputFiles({name:`${name}-private.ged`,mimeType:'text/plain',buffer:Buffer.from(family(name))});await page.getByRole('button',{name:'פתיחת האילן שלי',exact:true}).click();await expect(page.locator('.focus-card h2')).toContainText(name);
}
const state=()=>({head:null,versions:[],objects:new Map(),manifests:[]});

test('cloud is honestly unconfigured and no data is sent by default; setup rejects service secrets',async({page})=>{
 const posts=[];page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});await page.goto('/');await page.locator('.cloud-entry').click();await expect(page.getByRole('dialog')).toContainText('חיבור פרויקט Supabase');
 await page.getByLabel('כתובת פרויקט Supabase',{exact:true}).fill('https://unit-cloud.invalid');await page.getByLabel('מפתח publishable / anon ציבורי',{exact:true}).fill('sb_secret_do_not_accept');await page.getByRole('button',{name:'שמירת הגדרות ציבוריות',exact:true}).click();await expect(page.locator('.cloud-error')).toContainText('מפתח שרת');expect(posts).toEqual([]);
 const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();expect(report.violations).toEqual([]);
});

test('Google sign-in uses a PKCE OAuth redirect, not a simulated logged-in button',async({page,context})=>{
 const s=state();await mockCloud(context,s,false);await page.goto('http://localhost:5173/');await page.locator('.cloud-entry').click();await page.getByRole('button',{name:'המשך עם Google',exact:true}).click();await expect.poll(()=>s.authorize).toBeTruthy();const u=new globalThis.URL(s.authorize);expect(u.searchParams.get('provider')).toBe('google');expect(u.searchParams.get('code_challenge')).toBeTruthy();expect(u.searchParams.get('code_challenge_method')).toBe('s256');expect(u.searchParams.get('redirect_to')).toBe('http://localhost:5173/');
});

test('a real browser PRF creates a vault, requires saved recovery, locks, recovers on a second device and syncs without plaintext uploads',async({page,context,browser},testInfo)=>{
 test.setTimeout(65000);const s=state();await mockCloud(context,s);await virtualPasskey(page);await page.goto('http://localhost:5173/');await importFamily(page,'ראשונהסודית');await page.locator('.cloud-entry').click();await page.getByRole('button',{name:'יצירת כספת עם Passkey',exact:true}).click();
 const code=await page.locator('.cloud-recovery-code').innerText();await expect(page.getByRole('button',{name:'אישור ויצירת גיבוי מוצפן',exact:true})).toBeDisabled();expect(s.head).toBeNull();
 await page.getByRole('checkbox',{name:'שמרתי את מפתח השחזור במקום בטוח',exact:true}).check();await page.getByLabel('שמונת התווים האחרונים במפתח',{exact:true}).fill(code.slice(-8));await page.getByRole('button',{name:'אישור ויצירת גיבוי מוצפן',exact:true}).click();await expect(page.getByRole('heading',{name:'הכספת פתוחה במכשיר הזה',exact:true})).toBeVisible();
 const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();expect(report.violations).toEqual([]);
 await page.getByRole('button',{name:'נעילת הכספת וסגירת האילן',exact:true}).click();await expect(page.locator('.focus-card h2')).toHaveText('תמר לוין');expect(await page.evaluate(()=>Object.values(localStorage).join(' '))).not.toContain('ראשונהסודית');
 await page.getByRole('button',{name:'פתיחה עם Passkey',exact:true}).click();await page.getByRole('button',{name:'פתיחת העותק מהענן',exact:true}).click();await expect(page.locator('.focus-card h2')).toContainText('ראשונהסודית');await page.getByRole('checkbox',{name:/סנכרון אוטומטי של אילנות/}).check();await page.getByRole('button',{name:'סגירה',exact:true}).click();
 const second=await browser.newContext({viewport:testInfo.project.use.viewport});await mockCloud(second,s);const p2=await second.newPage();await p2.goto('http://localhost:5173/');await p2.locator('.cloud-entry').click();await p2.getByRole('button',{name:'פתיחה באמצעות מפתח שחזור פרטי',exact:true}).click();await p2.getByLabel('מפתח שחזור',{exact:true}).fill(code);await p2.getByRole('button',{name:'פתיחת הכספת',exact:true}).click();await p2.getByRole('button',{name:'פתיחת העותק מהענן',exact:true}).click();await expect(p2.locator('.focus-card h2')).toContainText('ראשונהסודית');await p2.getByRole('checkbox',{name:/סנכרון אוטומטי של אילנות/}).check();await p2.getByRole('button',{name:'סגירה',exact:true}).click();
 s.failNextUpload=true;await importFamily(page,'שנייהסודית');await expect(page.locator('.cloud-strip strong')).toContainText('נדרשת בדיקה');expect(s.head.generation).toBe(1);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect.poll(()=>s.head.generation).toBe(2);await p2.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(p2.locator('.focus-card h2')).toContainText('שנייהסודית');
 // A local edit/import on device 2 cannot be silently replaced by a newer remote snapshot.
 await p2.locator('.cloud-entry').click();await p2.getByRole('checkbox',{name:/סנכרון אוטומטי של אילנות/}).uncheck();await p2.getByRole('button',{name:'סגירה',exact:true}).click();await importFamily(p2,'מקומיתשנייה');
 await importFamily(page,'שלישיתסודית');await expect.poll(()=>s.head.generation).toBe(3);await p2.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(p2.locator('.cloud-strip strong')).toContainText('נדרשת בחירת גרסה');await expect(p2.locator('.focus-card h2')).toContainText('מקומיתשנייה');
 for(const bytes of s.objects.values()){const str=bytes.toString('utf8');expect(str).not.toContain('ראשונהסודית');expect(str).not.toContain('private.ged');expect(str).not.toContain(code);}
 expect(JSON.stringify(s.manifests)).not.toContain('משפחתבדיקה');expect(JSON.stringify(s.manifests)).not.toContain('private.ged');expect(JSON.stringify(s.manifests)).not.toContain(code);await second.close();
});

test('a passkey without PRF never downgrades to Google ID encryption or uploads data',async({page,context})=>{
 const s=state();await mockCloud(context,s);await virtualPasskey(page,false);await page.goto('http://localhost:5173/');await page.locator('.cloud-entry').click();await page.getByRole('button',{name:'יצירת כספת עם Passkey',exact:true}).click();await expect(page.locator('.cloud-error')).toContainText('PRF');expect(s.head).toBeNull();expect(s.objects.size).toBe(0);
});
