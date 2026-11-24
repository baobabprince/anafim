import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url);
test('README is a self-contained setup guide, matches the release, and links to existing project documents',async()=>{
 const readme=await fs.readFile(new URL('README.md',root),'utf8');
 const pkg=JSON.parse(await fs.readFile(new URL('package.json',root),'utf8'));
 const app=await fs.readFile(new URL('src/App.jsx',root),'utf8');
 assert.ok(readme.includes(pkg.version));assert.ok(app.includes(`const APP_VERSION = '${pkg.version}'`));
 for(const topic of ['SQL Editor','RLS','Authorized JavaScript origins','Authorized redirect URIs','Redirect URLs','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','anafi'+'m-cloud-config','CSP','UTF-8','Passkey','שחזור','פתרון תקלות','פרסום אטומי',`גרסה ${pkg.version}`])assert.ok(readme.includes(topic),topic);
 for(const [,link]of readme.matchAll(/\]\(([^)]+)\)/g))if(!/^(https?:|#)/.test(link))assert.ok((await fs.stat(new URL(link,root))).isFile(),link);
 assert.equal((readme.match(/^```/gm)||[]).length%2,0,'all fenced examples close');
});

test('cloud setup documentation matches the current password, recovery and inactivity flow', async () => {
 const readme = await fs.readFile(new URL('README.md', root), 'utf8');
 const cloudGuide = await fs.readFile(new URL('CLOUD-SETUP.md', root), 'utf8');
 const app = await fs.readFile(new URL('src/CloudAccess.jsx', root), 'utf8');
 const { PASSWORD_MIN_LENGTH } = await import('../src/vault-crypto.js');
 assert.equal(PASSWORD_MIN_LENGTH, 8);
 assert.match(app, /createVault\(user\.id, \{ password: vaultPassword \}\)/);
 assert.match(app, /2 \* 24 \* 60 \* 60 \* 1000/);
 for (const doc of [readme, cloudGuide]) {
  assert.match(doc, /סיסמת כספת/);
  assert.match(doc, /לפחות 8 תווים/);
  assert.match(doc, /מפתח השחזור/);
  assert.match(doc, /יומיים ללא פעילות/);
  assert.doesNotMatch(doc, /10 דקות ללא פעילות|שמונת תווי הביקורת/);
  assert.equal((doc.match(/^```/gm) || []).length % 2, 0, 'all fenced examples close');
  for (const [, link] of doc.matchAll(/\]\(([^)]+)\)/g)) {
   if (!/^(https?:|#)/.test(link)) assert.ok((await fs.stat(new URL(link, root))).isFile(), link);
  }
 }
});
