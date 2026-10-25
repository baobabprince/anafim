// Local-only envelope encryption. Identifiers are AAD/context, NEVER secret keys.
export const VAULT_FORMAT='anafim-e2ee';
export const MAX_CIPHER_BYTES=50*1024*1024;
export const MAX_PLAIN_BYTES=96*1024*1024;
const te=new TextEncoder(),td=new TextDecoder('utf-8',{fatal:true});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=message=>{throw new Error(message);};
const subtle=()=>globalThis.crypto?.subtle || fail('נדרש דפדפן עם Web Crypto וכתובת HTTPS.');
export const randomBytes=n=>crypto.getRandomValues(new Uint8Array(n));
export function base64url(input){const a=new Uint8Array(input);let s='';for(const b of a)s+=String.fromCharCode(b);return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function unbase64url(text,expected){
  if(typeof text!=='string'||text.length>8192||!text.length||!/^[\w-]+$/.test(text))fail('נתוני הצפנה אינם תקינים.');
  let a;try{a=Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}catch{fail('נתוני הצפנה אינם תקינים.');}
  if(expected&&a.length!==expected)fail('אורך נתוני ההצפנה אינו תקין.');return a;
}
const aad=(...items)=>te.encode(JSON.stringify([VAULT_FORMAT,1,...items]));
const identity=(ownerId,vaultId)=>{if(!UUID.test(ownerId)||!UUID.test(vaultId))fail('מזהה כספת אינו תקין.');};
export function validateEnvelope(e,ownerId){
  if(!e||e.format!==VAULT_FORMAT||e.version!==1||e.ownerId!==ownerId)fail('הכספת אינה שייכת לחשבון הזה או שפורמט ההצפנה אינו נתמך.');
  identity(e.ownerId,e.vaultId);unbase64url(e.prfSalt,32);
  if(!Array.isArray(e.wraps)||!e.wraps.length||e.wraps.length>16||!e.wraps.some(w=>w.method==='recovery'))fail('מעטפת מפתחות אינה תקינה.');
  for(const w of e.wraps){
    if(!UUID.test(w.id)||!['recovery','passkey-prf','password-v1'].includes(w.method))fail('סוג מפתח אינו נתמך.');
    unbase64url(w.salt,32);unbase64url(w.iv,12);unbase64url(w.wrapped,48);
    if(w.method==='passkey-prf'){unbase64url(w.credentialId);if(typeof w.rpId!=='string'||w.rpId.length>253||!/^[a-z0-9.-]+$/i.test(w.rpId))fail('כתובת Passkey אינה תקינה.');}
    if(w.method==='password-v1'){unbase64url(w.pbkdfSalt,32);if(!Number.isInteger(w.iterations)||w.iterations<100000||w.iterations>5000000)fail('פרמטרי סיסמת הכספת אינם תקינים.');}
  }return e;
}
async function kek(secret,e,w){
  if(!(secret instanceof Uint8Array)||secret.length!==32)fail('חומר מפתח אינו תקין.');
  const material=await subtle().importKey('raw',secret,'HKDF',false,['deriveKey']);
  return subtle().deriveKey({name:'HKDF',hash:'SHA-256',salt:unbase64url(w.salt,32),info:aad('key-wrap',e.ownerId,e.vaultId,w.method,w.id)},material,{name:'AES-GCM',length:256},false,['wrapKey','unwrapKey']);
}
function wrapAAD(e,w){return aad('wrapped-dek',e.ownerId,e.vaultId,w.id,w.method,w.credentialId||'',w.rpId||'',w.pbkdfSalt||'');}
async function wrap(key,e,method,secret,extra={}){
  const w={id:crypto.randomUUID(),method,salt:base64url(randomBytes(32)),iv:base64url(randomBytes(12)),...extra};
  w.wrapped=base64url(await subtle().wrapKey('raw',key,await kek(secret,e,w),{name:'AES-GCM',iv:unbase64url(w.iv,12),additionalData:wrapAAD(e,w),tagLength:128}));return w;
}
async function unwrap(e,w,secret){
  try{return await subtle().unwrapKey('raw',unbase64url(w.wrapped,48),await kek(secret,e,w),{name:'AES-GCM',iv:unbase64url(w.iv,12),additionalData:wrapAAD(e,w),tagLength:128},{name:'AES-GCM',length:256},true,['encrypt','decrypt']);}
  catch{fail('לא ניתן לפתוח את הכספת עם המפתח הזה. לא שונו נתונים.');}
}
export async function recoveryCode(secret){const digest=new Uint8Array(await subtle().digest('SHA-256',secret));return `ANAFIM1.${base64url(secret)}.${[...digest.slice(0,4)].map(n=>n.toString(16).padStart(2,'0')).join('')}`;}
export async function parseRecoveryCode(code){
  const m=String(code).trim().match(/^ANAFIM1\.([\w-]+)\.([0-9a-f]{8})$/i);if(!m)fail('פורמט מפתח השחזור אינו תקין.');
  const s=unbase64url(m[1],32);if((await recoveryCode(s)).split('.')[2]!==m[2].toLowerCase()||base64url(s)!==m[1]){s.fill(0);fail('מפתח השחזור הוקלד באופן שגוי.');}return s;
}
export const PASSWORD_MIN_LENGTH=8;
export const PBKDF2_ITERATIONS=310000;
export async function secretFromPassword(password,pbkdfSalt,iterations=PBKDF2_ITERATIONS){
  const pwd=String(password??'');
  if(pwd.length<PASSWORD_MIN_LENGTH)fail(`סיסמת הכספת חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים.`);
  if(pwd.length>512)fail('סיסמת הכספת ארוכה מדי.');
  if(!(pbkdfSalt instanceof Uint8Array)||pbkdfSalt.length!==32)fail('מלח סיסמה אינו תקין.');
  const material=await subtle().importKey('raw',te.encode(pwd),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await subtle().deriveBits({name:'PBKDF2',salt:pbkdfSalt,iterations,hash:'SHA-256'},material,256));
}
export async function createVault(ownerId,opts){
  const password=opts?.password;const passkey=opts?.passkey;
  if(!password&&!passkey)fail('יש לבחור סיסמת כספת או Passkey.');
  const vaultId=crypto.randomUUID();identity(ownerId,vaultId);
  const key=await subtle().generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
  const prfSalt=passkey?.prfSalt||base64url(randomBytes(32));
  const e={format:VAULT_FORMAT,version:1,ownerId,vaultId,prfSalt,wraps:[]};
  const recovery=randomBytes(32);let pwdSecret=null;
  try{
    if(password){const pbkdfSalt=randomBytes(32);pwdSecret=await secretFromPassword(password,pbkdfSalt,PBKDF2_ITERATIONS);e.wraps.push(await wrap(key,e,'password-v1',pwdSecret,{pbkdfSalt:base64url(pbkdfSalt),iterations:PBKDF2_ITERATIONS}));}
    if(passkey){e.wraps.push(await wrap(key,e,'passkey-prf',passkey.secret,{credentialId:passkey.credentialId,rpId:passkey.rpId}));}
    e.wraps.push(await wrap(key,e,'recovery',recovery));
    return {key,envelope:e,recovery:await recoveryCode(recovery)};
  }finally{recovery.fill(0);if(pwdSecret)pwdSecret.fill(0);if(passkey?.secret)passkey.secret.fill(0);}
}
export async function unlockWithPassword(e,ownerId,password){
  validateEnvelope(e,ownerId);const w=e.wraps.find(x=>x.method==='password-v1');if(!w)fail('לכספת הזו אין סיסמה. השתמשו במפתח שחזור או ב־Passkey.');
  const secret=await secretFromPassword(password,unbase64url(w.pbkdfSalt,32),w.iterations||PBKDF2_ITERATIONS);
  try{return await unwrap(e,w,secret);}finally{secret.fill(0);}
}
export function hasPasswordWrap(e){return !!e?.wraps?.some(w=>w.method==='password-v1');}
export function hasPasskeyWrap(e){return !!e?.wraps?.some(w=>w.method==='passkey-prf');}
export async function unlockWithRecovery(e,ownerId,code){validateEnvelope(e,ownerId);const secret=await parseRecoveryCode(code);try{return await unwrap(e,e.wraps.find(w=>w.method==='recovery'),secret);}finally{secret.fill(0);}}
export async function unlockWithPasskey(e,ownerId,credentialId,secret){validateEnvelope(e,ownerId);const w=e.wraps.find(w=>w.method==='passkey-prf'&&w.credentialId===credentialId);if(!w){secret.fill(0);fail('מפתח הגישה אינו רשום בכספת הזו.');}try{return await unwrap(e,w,secret);}finally{secret.fill(0);}}
export async function addPasskey(e,key,passkey){
  validateEnvelope(e,e.ownerId);if(e.wraps.length>=16)fail('הגעתם למספר מפתחות הגישה המותר.');
  try{return {...e,wraps:[...e.wraps,await wrap(key,e,'passkey-prf',passkey.secret,{credentialId:passkey.credentialId,rpId:passkey.rpId})]};}finally{passkey.secret.fill(0);}
}
async function transform(bytes,kind,limit){
  const stream=new Blob([bytes]).stream().pipeThrough(kind),reader=stream.getReader();const parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)fail('הקובץ המפוענח גדול מהמגבלה הבטוחה.');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
export async function encryptSnapshot(key,e,payload,revisionId=crypto.randomUUID()){
  validateEnvelope(e,e.ownerId);if(!UUID.test(revisionId))fail('מזהה גרסה אינו תקין.');
  let bytes=te.encode(JSON.stringify(payload));if(bytes.length>MAX_PLAIN_BYTES)fail('האילן גדול מדי לגיבוי מוצפן. הוא נשאר פתוח במכשיר.');
  let encoding='json';if(typeof CompressionStream!=='undefined'){bytes=await transform(bytes,new CompressionStream('gzip'),MAX_CIPHER_BYTES);encoding='json+gzip';}
  if(bytes.length+16>MAX_CIPHER_BYTES)fail('העותק המוצפן גדול מ־50MB. לא הועלו נתונים.');
  const cipher={iv:base64url(randomBytes(12)),encoding,revisionId};
  const ciphertext=new Uint8Array(await subtle().encrypt({name:'AES-GCM',iv:unbase64url(cipher.iv,12),additionalData:aad('snapshot',e.ownerId,e.vaultId,revisionId,encoding),tagLength:128},key,bytes));
  return {ciphertext,envelope:{...e,cipher},revisionId};
}
export async function decryptSnapshot(key,e,ownerId,revisionId,ciphertext){
  validateEnvelope(e,ownerId);
  if(!e.cipher||e.cipher.revisionId!==revisionId||!UUID.test(revisionId)||!['json','json+gzip'].includes(e.cipher.encoding))fail('פרטי גרסת הענן אינם תקינים.');
  const a=new Uint8Array(ciphertext);if(a.length<16||a.length>MAX_CIPHER_BYTES)fail('גודל העותק המוצפן אינו תקין.');let bytes;
  try{bytes=new Uint8Array(await subtle().decrypt({name:'AES-GCM',iv:unbase64url(e.cipher.iv,12),additionalData:aad('snapshot',ownerId,e.vaultId,revisionId,e.cipher.encoding),tagLength:128},key,a));}catch{fail('בדיקת שלמות ההצפנה נכשלה. לא הוחלף האילן המקומי.');}
  if(e.cipher.encoding==='json+gzip'){if(typeof DecompressionStream==='undefined')fail('הדפדפן אינו תומך בפתיחת הגיבוי.');bytes=await transform(bytes,new DecompressionStream('gzip'),MAX_PLAIN_BYTES);}
  if(bytes.length>MAX_PLAIN_BYTES)fail('האילן המפוענח גדול מדי.');const p=JSON.parse(td.decode(bytes));
  if(p?.format!=='anafim-snapshot'||p.version!==1||typeof p.raw!=='string'||typeof p.filename!=='string'||p.filename.length>1024||(p.encoding!==undefined&&(typeof p.encoding!=='string'||p.encoding.length>40))||(p.selectedId!==undefined&&(typeof p.selectedId!=='string'||p.selectedId.length>1024)))fail('תוכן הגיבוי אינו נתמך.');
  return p;
}
export const snapshotFromBundle=(bundle,selectedId)=>({format:'anafim-snapshot',version:1,raw:bundle.isDemo?'':bundle.raw,filename:bundle.isDemo?'':bundle.filename,encoding:bundle.encoding||'utf-8',selectedId:bundle.isDemo?'':selectedId||'',savedAt:new Date().toISOString()});
export async function snapshotFingerprint(payload){return base64url(await subtle().digest('SHA-256',te.encode(JSON.stringify([payload.raw,payload.filename,payload.encoding]))));}
