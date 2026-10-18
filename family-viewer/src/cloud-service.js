import {createClient} from '@supabase/supabase-js';
import {encryptSnapshot,decryptSnapshot,validateEnvelope,MAX_CIPHER_BYTES} from './vault-crypto.js';
export const CONFIG_KEY='anafim-cloud-public-config-v1';
export const BUCKET='anafim-vaults';
export class VaultConflict extends Error{constructor(){super('נמצאה גרסה חדשה יותר בענן. שום גרסה לא נדרסה. יש לבחור איזה עותק להמשיך.');this.name='VaultConflict';}}
export function validateCloudConfig(config){
  const url=new URL(String(config.url).trim());
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('כתובת Supabase חייבת להיות HTTPS.');
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('הזינו כתובת בסיס של פרויקט Supabase, ללא נתיב או סודות.');
  const key=String(config.key).trim();if(key.startsWith('sb_secret_')||key.length>4096)throw new Error('אסור להזין מפתח שרת פרטי או service_role בדפדפן.');
  if(!/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(key)){
    let claims;try{claims=JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/')));}catch{throw new Error('נדרש מפתח publishable או anon ציבורי.');}
    if(claims.role!=='anon')throw new Error('רק מפתח anon ציבורי מותר. לעולם לא service_role.');
  }return {url:url.origin,key};
}
export function loadCloudConfig(){
 const candidates=[];
 if(import.meta.env?.VITE_SUPABASE_URL&&import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY)candidates.push({url:import.meta.env.VITE_SUPABASE_URL,key:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY});
 try{if(typeof document!=='undefined'){const text=document.getElementById('anafim-cloud-config')?.textContent;if(text)candidates.push(JSON.parse(text));}}catch{}
 try{candidates.push(JSON.parse(localStorage.getItem(CONFIG_KEY)));}catch{}
 for(const candidate of candidates){try{if(candidate)return validateCloudConfig(candidate);}catch{}}
 return null;
}
export function saveCloudConfig(config){const safe=validateCloudConfig(config);localStorage.setItem(CONFIG_KEY,JSON.stringify(safe));return safe;}
export function cloudEnvironment(){return typeof window!=='undefined'&&window.isSecureContext&&['http:','https:'].includes(location.protocol)&&!!location.hostname;}
export function makeCloudClient(config){return createClient(config.url,config.key,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'anafim-auth-'+new URL(config.url).hostname},global:{headers:{'X-Client-Info':'anafim-web-e2ee/2'},fetch:async(input,init={})=>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);const cancel=()=>controller.abort();
 if(init.signal?.aborted)controller.abort();else init.signal?.addEventListener('abort',cancel,{once:true});
 try{return await fetch(input,{...init,signal:controller.signal});}finally{clearTimeout(timer);init.signal?.removeEventListener('abort',cancel);}
 }}});}
const check=result=>{if(result.error){if(result.error.code==='40001'||result.error.message?.includes('ANAFIM_CONFLICT'))throw new VaultConflict();throw new Error(result.error.message||'הענן אינו זמין כרגע.');}return result.data;};
export const objectPath=(uid,vaultId,revisionId)=>`${uid}/${vaultId}/${revisionId}.bin`;
export class VaultGateway{
 constructor(client,uid){this.client=client;this.uid=uid;}
 async head(){return check(await this.client.from('anafim_vault_heads').select('*').eq('user_id',this.uid).maybeSingle());}
 async history(){return check(await this.client.from('anafim_vault_versions').select('*').eq('user_id',this.uid).order('generation',{ascending:false}).limit(10))||[];}
 async save(key,envelope,payload,expectedRevision){
   validateEnvelope(envelope,this.uid);const {ciphertext,envelope:next,revisionId}=await encryptSnapshot(key,envelope,payload);
   check(await this.client.storage.from(BUCKET).upload(objectPath(this.uid,envelope.vaultId,revisionId),new Blob([ciphertext],{type:'application/octet-stream'}),{contentType:'application/octet-stream',upsert:false,cacheControl:'0'}));
   // Do not delete the uploaded object on an ambiguous RPC/network failure:
   // the commit might have succeeded while its response was lost.
   return check(await this.client.rpc('anafim_commit_vault',{p_vault_id:envelope.vaultId,p_revision_id:revisionId,p_expected_revision:expectedRevision||null,p_envelope:next,p_encrypted_bytes:ciphertext.length}));
 }
 async read(key,head){
   if(head.user_id!==this.uid||head.encrypted_bytes>MAX_CIPHER_BYTES||head.envelope?.vaultId!==head.vault_id)throw new Error('פרטי הכספת אינם תקינים.');
   validateEnvelope(head.envelope,this.uid);
   const blob=check(await this.client.storage.from(BUCKET).download(objectPath(this.uid,head.vault_id,head.revision_id)));
   if(blob.size!==head.encrypted_bytes)throw new Error('גודל גרסת הענן אינו תואם. האילן המקומי נשמר.');
   return decryptSnapshot(key,head.envelope,this.uid,head.revision_id,await blob.arrayBuffer());
 }
 subscribe(onChange){const channel=this.client.channel('anafim-vault-'+this.uid).on('postgres_changes',{event:'*',schema:'public',table:'anafim_vault_heads',filter:`user_id=eq.${this.uid}`},onChange).subscribe();return ()=>this.client.removeChannel(channel);}
 async delete(expectedRevision){const paths=check(await this.client.rpc('anafim_delete_vault',{p_expected_revision:expectedRevision}));for(let i=0;i<(paths||[]).length;i+=100)check(await this.client.storage.from(BUCKET).remove(paths.slice(i,i+100)));}
}
