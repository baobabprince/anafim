import test from 'node:test';import assert from 'node:assert/strict';
import {validateCloudConfig,VaultGateway,VaultConflict} from '../src/cloud-service.js';
import {createVault,base64url,randomBytes} from '../src/vault-crypto.js';
const uid='11111111-2222-4333-8444-555555555555';
test('only public project configuration is accepted; server secrets are rejected',()=>{
 assert.equal(validateCloudConfig({url:'https://example.supabase.co',key:'sb_publishable_publickeyexample'}).url,'https://example.supabase.co');
 assert.throws(()=>validateCloudConfig({url:'https://example.supabase.co',key:'sb_secret_private'}));
 const jwt=`e30.${btoa(JSON.stringify({role:'service_role'}))}.signature`;
 assert.throws(()=>validateCloudConfig({url:'https://example.supabase.co',key:jwt}));
 assert.throws(()=>validateCloudConfig({url:'http://example.com',key:'sb_publishable_publickeyexample'}));
});
test('two devices upload ciphertext only, conflicts preserve the winning head and the earlier snapshot',async()=>{
 const objects=new Map(),versions=[];let current=null;
 const client={storage:{from:()=>({upload:async(path,blob,options)=>{assert.equal(options.upsert,false);objects.set(path,blob);return {data:{path},error:null};},download:async path=>({data:objects.get(path),error:null})})},rpc:async(_name,p)=>{
  if((current?.revision_id||null)!==p.p_expected_revision)return {error:{code:'40001',message:'ANAFIM_CONFLICT'}};
  current={user_id:uid,vault_id:p.p_vault_id,revision_id:p.p_revision_id,envelope:p.p_envelope,encrypted_bytes:p.p_encrypted_bytes,generation:(current?.generation||0)+1};versions.push(current);return {data:current};
 }};
 const secret=randomBytes(32),vault=await createVault(uid,{secret,credentialId:base64url(randomBytes(32)),rpId:'localhost',prfSalt:base64url(randomBytes(32))});
 const a=new VaultGateway(client,uid),b=new VaultGateway(client,uid),payload={format:'anafim-snapshot',version:1,raw:'1 NAME private-family-secret',filename:'private-file.ged',encoding:'utf-8'};
 const first=await a.save(vault.key,vault.envelope,payload,null),winner=await a.save(vault.key,first.envelope,{...payload,raw:'new private family'},first.revision_id);
 await assert.rejects(b.save(vault.key,first.envelope,{...payload,raw:'conflicting local family'},first.revision_id),VaultConflict);
 assert.equal(current.revision_id,winner.revision_id);assert.equal(versions.length,2);
 assert.equal((await a.read(vault.key,first)).raw,payload.raw);
 for(const blob of objects.values()){assert.ok(!(await blob.text()).includes('private-family-secret'));assert.ok(!(await blob.text()).includes('private-file.ged'));}
 assert.ok(!JSON.stringify(current.envelope).includes('private-file.ged'));
});
