import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url);
test('README is a self-contained setup guide, matches the release, and links to existing project documents',async()=>{
 const readme=await fs.readFile(new URL('README.md',root),'utf8');
 const pkg=JSON.parse(await fs.readFile(new URL('package.json',root),'utf8'));
 const app=await fs.readFile(new URL('src/App.jsx',root),'utf8');
 assert.ok(readme.includes(pkg.version));assert.ok(app.includes(`const APP_VERSION = '${pkg.version}'`));
 for(const topic of ['SQL Editor','RLS','Authorized JavaScript origins','Authorized redirect URIs','Redirect URLs','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','anafi'+'m-cloud-config','CSP','UTF-8','Passkey','שחזור','פתרון תקלות','פרסום אטומי','גרסה 2.0.1'])assert.ok(readme.includes(topic),topic);
 for(const [,link]of readme.matchAll(/\]\(([^)]+)\)/g))if(!/^(https?:|#)/.test(link))assert.ok((await fs.stat(new URL(link,root))).isFile(),link);
 assert.equal((readme.match(/^```/gm)||[]).length%2,0,'all fenced examples close');
});
