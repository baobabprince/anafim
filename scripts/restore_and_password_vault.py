#!/usr/bin/env python3
"""Restore vault sources from last good commit, then apply password-vault patches."""
from pathlib import Path
import re
import urllib.request

GOOD = '641d8255da915dda5a8bfd368e3e8b13ea52a0f9'
BASE = f'https://raw.githubusercontent.com/baobabprince/anafim/{GOOD}/'

def fetch(rel):
    url = BASE + rel
    print('fetch', url)
    return urllib.request.urlopen(url, timeout=60).read().decode()

# 1) Restore from last known-good commit
vc = fetch('family-viewer/src/vault-crypto.js')
ca = fetch('family-viewer/src/CloudAccess.jsx')
Path('family-viewer/src/vault-crypto.js').write_text(vc)
Path('family-viewer/src/CloudAccess.jsx').write_text(ca)
print('restored', len(vc), len(ca))

# 2) Patch vault-crypto: inject password support by rewriting key sections
# Replace validateEnvelope methods list and createVault signature via full rewrite of critical exports
# Simpler: append is wrong; do surgical string ops

if "password-v1" not in vc:
    vc = vc.replace(
        "if(!UUID.test(w.id)||!['recovery','passkey-prf'].includes(w.method))fail('סוג מפתח אינו נתמך.');",
        "if(!UUID.test(w.id)||!['recovery','passkey-prf','password-v1'].includes(w.method))fail('סוג מפתח אינו נתמך.');",
    )
    vc = vc.replace(
        "if(w.method==='passkey-prf'){unbase64url(w.credentialId);if(typeof w.rpId!=='string'||w.rpId.length>253||!/^[a-z0-9.-]+$/i.test(w.rpId))fail('כתובת Passkey אינה תקינה.');}",
        "if(w.method==='passkey-prf'){unbase64url(w.credentialId);if(typeof w.rpId!=='string'||w.rpId.length>253||!/^[a-z0-9.-]+$/i.test(w.rpId))fail('כתובת Passkey אינה תקינה.');}\n    if(w.method==='password-v1'){unbase64url(w.pbkdfSalt,32);if(!Number.isInteger(w.iterations)||w.iterations<100000||w.iterations>5000000)fail('פרמטרי סיסמת הכספת אינם תקינים.');}",
    )
    vc = vc.replace(
        "function wrapAAD(e,w){return aad('wrapped-dek',e.ownerId,e.vaultId,w.id,w.method,w.credentialId||'',w.rpId||'');}",
        "function wrapAAD(e,w){return aad('wrapped-dek',e.ownerId,e.vaultId,w.id,w.method,w.credentialId||'',w.rpId||'',w.pbkdfSalt||'');}",
    )
    # Replace createVault function body
    old_cv = re.search(r"export async function createVault\(ownerId,passkey\)\{[\s\S]*?\n\}", vc)
    if not old_cv:
        raise SystemExit('createVault not found')
    new_cv = r'''export const PASSWORD_MIN_LENGTH=8;
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
export function hasPasskeyWrap(e){return !!e?.wraps?.some(w=>w.method==='passkey-prf');}'''
    # Keep unlockWithPasskey after - insert new_cv replacing createVault only, then ensure unlockWithPasskey remains
    rest_start = vc.find('export async function unlockWithRecovery')
    if rest_start < 0: raise SystemExit('unlockWithRecovery missing')
    # Remove old createVault only
    vc = vc[:old_cv.start()] + new_cv + '\n' + vc[rest_start:]
    Path('family-viewer/src/vault-crypto.js').write_text(vc)
    print('patched crypto', len(vc))

# 3) Patch CloudAccess UI
ca = Path('family-viewer/src/CloudAccess.jsx').read_text()
if 'unlockWithPassword' not in ca:
    ca = ca.replace(
        "import {createVault,unlockWithPasskey,unlockWithRecovery,addPasskey,snapshotFromBundle,snapshotFingerprint,validateEnvelope} from './vault-crypto.js';",
        "import {createVault,unlockWithPasskey,unlockWithPassword,unlockWithRecovery,addPasskey,snapshotFromBundle,snapshotFingerprint,validateEnvelope,hasPasswordWrap,hasPasskeyWrap,PASSWORD_MIN_LENGTH} from './vault-crypto.js';",
    )
    needle="const [history,setHistory]=useState([]),[showRecovery,setShowRecovery]=useState(false),[showHistory,setShowHistory]=useState(false);"
    ca = ca.replace(needle, needle+"\n const [vaultPassword,setVaultPassword]=useState(''),[vaultPassword2,setVaultPassword2]=useState(''),[unlockPassword,setUnlockPassword]=useState('');")
    old_create=''' const create=()=>task(async stamp=>{\n   const passkey=await registerPasskey(user);assertEpoch(stamp);const initial=await createVault(user.id,passkey);assertEpoch(stamp);\n   pendingRef.current={initial};setRecovery(initial.recovery);setRecoverySaved(false);setRecoveryTail('');setPhase('recovery-setup');\n });'''
    new_create=''' const create=()=>task(async stamp=>{\n   if(vaultPassword.length<PASSWORD_MIN_LENGTH)throw new Error(`סיסמת הכספת חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים.`);\n   if(vaultPassword!==vaultPassword2)throw new Error('שתי הסיסמאות אינן זהות.');\n   const initial=await createVault(user.id,{password:vaultPassword});assertEpoch(stamp);\n   pendingRef.current={initial};setRecovery(initial.recovery);setRecoverySaved(false);setRecoveryTail('');\n   setVaultPassword('');setVaultPassword2('');setPhase('recovery-setup');\n });'''
    if old_create not in ca: raise SystemExit('create block missing')
    ca = ca.replace(old_create, new_create)
    old_ur=''' const unlockRecovery=()=>task(async stamp=>{const key=await unlockWithRecovery(headRef.current.envelope,user.id,recoveryInput);assertEpoch(stamp);setRecoveryInput('');setShowRecovery(false);await finishUnlock(stamp,key);});'''
    ca = ca.replace(old_ur, old_ur+'''\n const unlockPassword=()=>task(async stamp=>{const key=await unlockWithPassword(headRef.current.envelope,user.id,unlockPassword);assertEpoch(stamp);setUnlockPassword('');await finishUnlock(stamp,key);});''')
    old_nc='''phase==='needs-create'&&<div className="cloud-step"><span className="cloud-step-number">01</span><h3>יוצרים כספת שרק אתם יכולים לפתוח</h3><p>מפתח אקראי יצפין את האילן. Passkey עם PRF יפתח אותו באימות המכשיר; לאחר מכן תשמרו מפתח שחזור פרטי. לא נעלה דבר לפני אישור השחזור.</p>{!passkeyEnvironment()&&<p className="cloud-warning-text">הדפדפן אינו מציע Passkey. יצירת כספת דורשת מכשיר תומך.</p>}<button className="button button-primary button-full" disabled={busy||!passkeyEnvironment()} onClick={create}><KeyRound size={17}/>יצירת כספת עם Passkey</button></div>}'''
    new_nc='''phase==='needs-create'&&<div className="cloud-step"><span className="cloud-step-number">01</span><h3>יוצרים כספת שרק אתם יכולים לפתוח</h3><p>מפתח אקראי יצפין את האילן במכשיר. סיסמת הכספת (לא סיסמת Google) תפתח אותו בכל מכשיר. אחר כך תשמרו מפתח שחזור פרטי. לא נעלה דבר לפני אישור השחזור.</p><form className="cloud-recovery-form" onSubmit={e=>{e.preventDefault();create();}}><label>סיסמת כספת<input type="password" value={vaultPassword} onChange={e=>setVaultPassword(e.target.value)} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH}/></label><label>אימות סיסמה<input type="password" value={vaultPassword2} onChange={e=>setVaultPassword2(e.target.value)} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH}/></label><button className="button button-primary button-full" disabled={busy||vaultPassword.length<PASSWORD_MIN_LENGTH} type="submit"><KeyRound size={17}/>יצירת כספת עם סיסמה</button></form><p className="cloud-hint">הסיסמה נשארת אצלכם בלבד ואינה נשלחת לשרת. Google משמש רק לזיהוי החשבון.</p></div>}'''
    if old_nc not in ca: raise SystemExit('needs-create UI missing')
    ca = ca.replace(old_nc, new_nc)
    m=re.search(r"phase==='locked'&&<div className=\"cloud-step\">[\s\S]*?</div>\}", ca)
    if not m: raise SystemExit('locked UI missing')
    new_locked='''phase==='locked'&&<div className="cloud-step"><LockKeyhole size={29}/><h3>הנתונים בענן מוצפנים</h3><p>גרסה {head?.generation} · {dateLabel(head?.updated_at)}. פתחו עם סיסמת הכספת, Passkey (אם נרשם) או מפתח השחזור.</p>{hasPasswordWrap(head?.envelope)&&<form className="cloud-recovery-form" onSubmit={e=>{e.preventDefault();unlockPassword();}}><label>סיסמת כספת<input type="password" value={unlockPassword} onChange={e=>setUnlockPassword(e.target.value)} autoComplete="current-password"/></label><button className="button button-primary button-full" disabled={busy||!unlockPassword} type="submit"><KeyRound size={16}/>פתיחה עם סיסמה</button></form>}{hasPasskeyWrap(head?.envelope)&&<button className="button button-white button-full" onClick={unlockPasskey} disabled={busy||!passkeyEnvironment()}><KeyRound size={16}/>פתיחה עם Passkey</button>}<button className="cloud-link" onClick={()=>setShowRecovery(v=>!v)}>פתיחה באמצעות מפתח שחזור פרטי</button><button className="cloud-link" disabled={busy} onClick={refresh}>רענון פרטי הכספת</button>{showRecovery&&<form className="cloud-recovery-form" onSubmit={e=>{e.preventDefault();unlockRecovery();}}><label>מפתח שחזור<input type="password" dir="ltr" value={recoveryInput} onChange={e=>setRecoveryInput(e.target.value)} autoComplete="off"/></label><button className="button button-white" disabled={busy||!recoveryInput}>פתיחה</button></form>}</div>}'''
    ca = ca[:m.start()] + new_locked + ca[m.end():]
    Path('family-viewer/src/CloudAccess.jsx').write_text(ca)
    print('patched CloudAccess', len(ca))

print('done')
