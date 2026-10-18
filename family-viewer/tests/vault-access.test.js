import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const A='11111111-2222-4333-8444-555555555555',B='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',V='12345678-1111-4222-8333-123456789012',R1='12345678-1111-4222-8333-123456789001',R2='12345678-1111-4222-8333-123456789002',R3='12345678-1111-4222-8333-123456789003';
const sql=await fs.readFile(new URL('../supabase/migrations/202610180001_private_vault.sql',import.meta.url),'utf8');
test('real PostgreSQL RLS isolates users and immutable storage, and atomic commits reject stale writers',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
   create table auth.users(id uuid primary key);insert into auth.users values('${A}'),('${B}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id bigint generated always as identity,bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
   create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
   alter table storage.objects enable row level security;
   create policy legacy_overbroad_policy on storage.objects for all to authenticated using(true) with check(true);
   grant usage on schema public,storage,auth to anon,authenticated;grant execute on function auth.uid(),storage.foldername(text) to anon,authenticated;
   grant select,insert,update,delete on storage.objects to authenticated;grant usage,select on sequence storage.objects_id_seq to authenticated;`);
  await db.exec(sql);
  const as=async uid=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');};
  const upload=async revision=>db.query("insert into storage.objects(bucket_id,name,metadata) values('anafim-vaults',$1,'{\"size\":32}')",[`${A}/${V}/${revision}.bin`]);
  const envelope=revision=>({format:'anafim-e2ee',version:1,ownerId:A,vaultId:V,cipher:{revisionId:revision,encoding:'json'},wraps:[{method:'recovery'}]});
  const commit=(revision,expected)=>db.query('select public.anafim_commit_vault($1,$2,$3,$4::jsonb,32) as head',[V,revision,expected,JSON.stringify(envelope(revision))]);
  await as(A);await upload(R1);const first=await commit(R1,null);assert.equal(first.rows[0].head.generation,1);
  await assert.rejects(db.query("insert into public.anafim_vault_heads(user_id,vault_id,revision_id,envelope,encrypted_bytes) values($1,$2,$3,'{}',32)",[A,V,R2]));
  await as(B);assert.equal((await db.query('select * from public.anafim_vault_heads')).rows.length,0);assert.equal((await db.query('select * from public.anafim_vault_versions')).rows.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  await assert.rejects(upload(R2));await assert.rejects(commit(R2,null));
  await as(A);await upload(R2);await commit(R2,R1);await upload(R3);await assert.rejects(commit(R3,R1),e=>e.code==='40001');
  assert.equal((await db.query('select revision_id from public.anafim_vault_heads')).rows[0].revision_id,R2);assert.equal((await db.query('select * from public.anafim_vault_versions')).rows.length,2);
  const changed=await db.query("update storage.objects set metadata='{\"size\":999}' where name=$1 returning *",[`${A}/${V}/${R2}.bin`]);assert.equal(changed.rows.length,0);
  await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.anafim_vault_heads'));await assert.rejects(commit(R3,R2));
  await as(A);const removed=await db.query('select public.anafim_delete_vault($1) as paths',[R2]);assert.equal(removed.rows[0].paths.length,3);assert.equal((await db.query('select * from public.anafim_vault_heads')).rows.length,0);
 }finally{await db.close();}
});
