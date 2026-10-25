import React,{useEffect,useRef,useState} from 'react';
import {Cloud,CloudOff,LockKeyhole,ShieldCheck,KeyRound,RefreshCw,Download,LogOut,Settings2,Upload,Check,AlertTriangle,LoaderCircle,ChevronLeft} from 'lucide-react';
import {loadCloudConfig,saveCloudConfig,CONFIG_KEY,makeCloudClient,cloudEnvironment,VaultGateway,VaultConflict} from './cloud-service.js';
import {createVault,unlockWithPasskey,unlockWithPassword,unlockWithRecovery,addPasskey,snapshotFromBundle,snapshotFingerprint,validateEnvelope,hasPasswordWrap,hasPasskeyWrap,PASSWORD_MIN_LENGTH} from './vault-crypto.js';
import {registerPasskey,authenticatePasskey,passkeyEnvironment} from './vault-passkey.js';
import setupSQL from '../supabase/migrations/202610180001_private_vault.sql?raw';

const dateLabel=value=>value?new Date(value).toLocaleString('he-IL'):'טרם נשמר';
function download(name,text,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function GoogleMark(){return <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.93a6 6 0 0 1 0-3.86V7.48H3.07a10 10 0 0 0 0 9.04l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.48l3.34 2.59C7.2 7.71 9.4 5.95 12 5.95Z"/></svg>;}

export default function CloudAccess({Dialog,bundle,selectedId,onApplySnapshot,onClear,onUpload,isModalOpen}){
 const [config,setConfig]=useState(loadCloudConfig),[open,setOpen]=useState(false),[showConfig,setShowConfig]=useState(false);
 const [url,setUrl]=useState(config?.url||''),[publicKey,setPublicKey]=useState(config?.key||'');
 const [user,setUser]=useState(null),[head,setHead]=useState(null),[phase,setPhase]=useState('signed-out'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [auto,setAuto]=useState(false),[recovery,setRecovery]=useState(''),[recoveryInput,setRecoveryInput]=useState(''),[recoverySaved,setRecoverySaved]=useState(false),[recoveryTail,setRecoveryTail]=useState('');
 const [history,setHistory]=useState([]),[showRecovery,setShowRecovery]=useState(false),[showHistory,setShowHistory]=useState(false);
 const [vaultPassword,setVaultPassword]=useState(''),[vaultPassword2,setVaultPassword2]=useState(''),[unlockPassword,setUnlockPassword]=useState('');
 const clientRef=useRef(null),gatewayRef=useRef(null),keyRef=useRef(null),headRef=useRef(null),pendingRef=useRef(null),baselineRef=useRef(null),epochRef=useRef(0),busyRef=useRef(false),pollRef=useRef(false),userIdRef=useRef(null),previousUserRef=useRef(null);
 const propsRef=useRef({bundle,selectedId,onApplySnapshot,onClear,isModalOpen});propsRef.current={bundle,selectedId,onApplySnapshot,onClear,isModalOpen};
 const autoRef=useRef(auto);autoRef.current=auto;
 const phaseRef=useRef(phase);phaseRef.current=phase;
 const updateHead=h=>{headRef.current=h;setHead(h);};
 const currentSnapshot=()=>snapshotFromBundle(propsRef.current.bundle,propsRef.current.selectedId);
 const assertEpoch=stamp=>{if(stamp!==epochRef.current){const e=new Error('הפעולה בוטלה.');e.name='AbortError';throw e;}};
 const wipe=(clearView=true)=>{epochRef.current++;keyRef.current=null;pendingRef.current=null;baselineRef.current=null;setRecovery('');setRecoveryInput('');setRecoverySaved(false);setRecoveryTail('');setHistory([]);setShowRecovery(false);setAuto(false);if(clearView)propsRef.current.onClear();};
 const lock=()=>{wipe();setPhase(headRef.current?'locked':'needs-create');setNotice('הכספת ננעלה והעותק הפתוח נסגר. מפתח הפענוח אינו נשמר בדפדפן.');};
 async function task(operation){
   if(busyRef.current)return;const stamp=epochRef.current;busyRef.current=true;setBusy(true);setError('');setNotice('');
   try{await operation(stamp);}
   catch(e){if(e.name==='AbortError'||stamp!==epochRef.current)return;if(e instanceof VaultConflict){if(pendingRef.current?.initial){pendingRef.current=null;setRecovery('');setRecoveryTail('');}setPhase('conflict');setError(e.message);}else setError(e.message||'הפעולה לא הושלמה. האילן המקומי לא הוחלף.');}
   finally{busyRef.current=false;setBusy(false);}
 }
 useEffect(()=>{
   if(!config||!cloudEnvironment())return;
   const client=makeCloudClient(config);clientRef.current=client;let active=true;
   const {data}=client.auth.onAuthStateChange((_event,session)=>{if(active)setUser(session?.user||null);});
   client.auth.getSession().then(({data,error})=>{if(active){if(error)setError('לא ניתן לחדש את ההתחברות. התחברו מחדש עם Google.');setUser(data.session?.user||null);}});
   return()=>{active=false;data.subscription.unsubscribe();client.removeAllChannels();client.auth.stopAutoRefresh();if(clientRef.current===client)clientRef.current=null;};
 },[config]);
 useEffect(()=>{
   const old=previousUserRef.current;previousUserRef.current=user?.id||null;userIdRef.current=user?.id||null;
   wipe(!!old&&old!==user?.id);updateHead(null);gatewayRef.current=null;
   if(!user){setPhase('signed-out');return;}
   const stamp=epochRef.current,gateway=new VaultGateway(clientRef.current,user.id);gatewayRef.current=gateway;setPhase('loading');
   gateway.head().then(h=>{assertEpoch(stamp);if(h)validateEnvelope(h.envelope,user.id);updateHead(h);setPhase(h?'locked':'needs-create');}).catch(e=>{if(stamp===epochRef.current){setError('לא ניתן לקרוא את הכספת. ודאו שקובץ ה־SQL הותקן ושהרשאות הפרויקט הוגדרו.');setPhase('connection-error');}});
   return()=>{epochRef.current++;keyRef.current=null;};
 },[user?.id,config]);
 async function readChoice(stamp,h=headRef.current){
   if(!h)throw new Error('לא נמצאה כספת בענן.');validateEnvelope(h.envelope,userIdRef.current);
   const payload=await gatewayRef.current.read(keyRef.current,h);assertEpoch(stamp);
   pendingRef.current={head:h,payload};
   const same=await snapshotFingerprint(currentSnapshot())===await snapshotFingerprint(payload);assertEpoch(stamp);
   if(same||(!payload.raw&&propsRef.current.bundle.isDemo)){baselineRef.current=await snapshotFingerprint(payload);updateHead(h);pendingRef.current=null;setPhase('ready');setNotice('הכספת פתוחה. אפשר להפעיל סנכרון אוטומטי.');}
   else{updateHead(h);setPhase('choice');}
 }
 async function takeRemote(stamp){
   const item=pendingRef.current;if(!item)throw new Error('יש לרענן את גרסת הענן.');
   // Pause automatic replacement while another application dialog is open.
   if(propsRef.current.isModalOpen)throw new Error('סגרו קודם את חלון פתיחת הקובץ.');
   assertEpoch(stamp);const originalBundle=propsRef.current.bundle;await propsRef.current.onApplySnapshot(item.payload,{shouldApply:()=>stamp===epochRef.current&&propsRef.current.bundle===originalBundle});assertEpoch(stamp);
   baselineRef.current=await snapshotFingerprint(item.payload);updateHead(item.head);pendingRef.current=null;setPhase('ready');setNotice('האילן נטען מהענן ופוענח רק במכשיר הזה.');
 }
 async function saveCurrent(stamp,envelope=headRef.current?.envelope,expected=headRef.current?.revision_id){
   if(!keyRef.current||!envelope)throw new Error('יש לפתוח קודם את הכספת.');
   if(propsRef.current.bundle.isDemo)throw new Error('משפחת ההדגמה אינה נשמרת בענן. פתחו את קובץ ה־GEDCOM שלכם.');
   const payload=currentSnapshot();const h=await gatewayRef.current.save(keyRef.current,envelope,payload,expected);assertEpoch(stamp);
   const fp=await snapshotFingerprint(payload);assertEpoch(stamp);baselineRef.current=fp;updateHead(h);pendingRef.current=null;setPhase('ready');setNotice('העותק המוצפן נשמר בענן.');
 }
 async function poll(){
   if(pollRef.current||busyRef.current||!gatewayRef.current||!keyRef.current||phaseRef.current!=='ready')return;
   pollRef.current=true;const stamp=epochRef.current;
   try{
     const latest=await gatewayRef.current.head();assertEpoch(stamp);
     if(!latest){lock();updateHead(null);setPhase('needs-create');setNotice('הכספת נמחקה בענן. העותק הפתוח נסגר.');return;}
     if(latest.revision_id===headRef.current?.revision_id){
       if(autoRef.current&&!propsRef.current.bundle.isDemo&&!propsRef.current.isModalOpen){
         const dirty=await snapshotFingerprint(currentSnapshot())!==baselineRef.current;assertEpoch(stamp);
         if(dirty)await task(s=>saveCurrent(s));
       }
       return;
     }
     if(latest.vault_id!==headRef.current?.vault_id||latest.generation<headRef.current?.generation){lock();setError('זהות או סדר גרסאות הכספת השתנו. נדרשת פתיחה מחדש.');updateHead(latest);return;}
     const clean=await snapshotFingerprint(currentSnapshot())===baselineRef.current;assertEpoch(stamp);
     if(!clean||!autoRef.current||propsRef.current.isModalOpen){setPhase('conflict');setNotice('יש עדכון במכשיר אחר. בחרו איזה עותק להמשיך; שום נתון לא נדרס.');return;}
     const payload=await gatewayRef.current.read(keyRef.current,latest);assertEpoch(stamp);
     // Re-check after the asynchronous download so a newly imported local file is not replaced.
     if(await snapshotFingerprint(currentSnapshot())!==baselineRef.current){setPhase('conflict');setNotice('נפתח אילן מקומי בזמן הורדת עדכון. נדרשת בחירה.');return;}
     assertEpoch(stamp);const originalBundle=propsRef.current.bundle;await propsRef.current.onApplySnapshot(payload,{shouldApply:()=>stamp===epochRef.current&&propsRef.current.bundle===originalBundle&&!propsRef.current.isModalOpen});assertEpoch(stamp);
     baselineRef.current=await snapshotFingerprint(payload);updateHead(latest);setNotice('התקבל עדכון מוצפן ממכשיר אחר.');
   }catch(e){if(stamp===epochRef.current)setNotice('הסנכרון ממתין לחיבור. האילן הפתוח נשמר; לא נדרסו גרסאות.');}
   finally{pollRef.current=false;}
 }
 const pollLatestRef=useRef(poll);pollLatestRef.current=poll;
 useEffect(()=>{
   if(!user||!gatewayRef.current)return;
   const notify=()=>pollLatestRef.current();const stop=gatewayRef.current.subscribe(notify);const timer=setInterval(notify,20000);
   const visible=()=>{if(document.visibilityState==='visible')notify();};window.addEventListener('online',notify);window.addEventListener('focus',notify);document.addEventListener('visibilitychange',visible);
   return()=>{stop();clearInterval(timer);window.removeEventListener('online',notify);window.removeEventListener('focus',notify);document.removeEventListener('visibilitychange',visible);};
 },[user?.id,phase==='loading']);
 useEffect(()=>{
   if(!auto||phase!=='ready'||bundle.isDemo||!keyRef.current)return;
   const stamp=epochRef.current;const timer=setTimeout(async()=>{if(busyRef.current)return;try{const fp=await snapshotFingerprint(currentSnapshot());assertEpoch(stamp);if(fp!==baselineRef.current)task(s=>saveCurrent(s));}catch{}},1400);
   return()=>clearTimeout(timer);
 },[bundle.raw,bundle.filename,auto,phase]);
 useEffect(()=>{
   if(phase!=='ready'&&phase!=='choice'&&phase!=='conflict')return;
   let timer;const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(keyRef.current)lock();},10*60*1000);};reset();
   window.addEventListener('pointerdown',reset);window.addEventListener('keydown',reset);
   return()=>{clearTimeout(timer);window.removeEventListener('pointerdown',reset);window.removeEventListener('keydown',reset);};
 },[phase]);
 const configure=()=>{try{if(user)throw new Error('יש להתנתק לפני שינוי פרויקט ענן.');const safe=saveCloudConfig({url,key:publicKey});wipe(false);setConfig(safe);setShowConfig(false);setError('');setNotice('הפרויקט הוגדר. יש לוודא שגם SQL ו־Google OAuth הוגדרו לפני ההתחברות.');}catch(e){setError(e.message);}};
 const login=()=>task(async()=>{if(!cloudEnvironment())throw new Error('התחברות לענן פועלת באתר HTTPS, לא בקובץ HTML מקומי.');const {error}=await clientRef.current.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname,scopes:'openid email profile',queryParams:{prompt:'select_account'}}});if(error)throw error;});
 const create=()=>task(async stamp=>{
   if(vaultPassword.length<PASSWORD_MIN_LENGTH)throw new Error(`סיסמת הכספת חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים.`);
   if(vaultPassword!==vaultPassword2)throw new Error('שתי הסיסמאות אינן זהות.');
   const initial=await createVault(user.id,{password:vaultPassword});assertEpoch(stamp);
   pendingRef.current={initial};setRecovery(initial.recovery);setRecoverySaved(false);setRecoveryTail('');
   setVaultPassword('');setVaultPassword2('');setPhase('recovery-setup');
 });
 const finishCreate=()=>task(async stamp=>{
   if(!recoverySaved||recoveryTail.trim()!==recovery.slice(-8))throw new Error('שמרו את מפתח השחזור ואשרו את שמונת התווים האחרונים שלו.');
   const initial=pendingRef.current?.initial;if(!initial)throw new Error('תהליך יצירת הכספת בוטל.');
   const payload=currentSnapshot();const h=await gatewayRef.current.save(initial.key,initial.envelope,payload,null);assertEpoch(stamp);
   keyRef.current=initial.key;baselineRef.current=await snapshotFingerprint(payload);updateHead(h);pendingRef.current=null;setRecovery('');setRecoveryTail('');setPhase('ready');setNotice('הכספת נוצרה. בענן נשמר עותק מוצפן בלבד.');
 });
 async function finishUnlock(stamp,key){
   const latest=await gatewayRef.current.head();assertEpoch(stamp);
   if(!latest||latest.vault_id!==headRef.current?.vault_id){keyRef.current=null;updateHead(latest);setPhase(latest?'locked':'needs-create');throw new Error('הכספת השתנתה בזמן שהייתה נעולה. יש לפתוח את הכספת המעודכנת.');}
   keyRef.current=key;await readChoice(stamp,latest);
 }
 const unlockPasskey=()=>task(async stamp=>{validateEnvelope(headRef.current.envelope,user.id);const result=await authenticatePasskey(headRef.current.envelope);assertEpoch(stamp);const key=await unlockWithPasskey(headRef.current.envelope,user.id,result.credentialId,result.secret);assertEpoch(stamp);await finishUnlock(stamp,key);});
 const unlockRecovery=()=>task(async stamp=>{const key=await unlockWithRecovery(headRef.current.envelope,user.id,recoveryInput);assertEpoch(stamp);setRecoveryInput('');setShowRecovery(false);await finishUnlock(stamp,key);});
 const openWithVaultPassword=()=>task(async stamp=>{const key=await unlockWithPassword(headRef.current.envelope,user.id,unlockPassword);assertEpoch(stamp);setUnlockPassword('');await finishUnlock(stamp,key);});
 const refresh=()=>task(async stamp=>{const h=await gatewayRef.current.head();assertEpoch(stamp);if(h)validateEnvelope(h.envelope,user.id);if(keyRef.current&&h&&h.vault_id===headRef.current?.vault_id)await readChoice(stamp,h);else{if(keyRef.current)wipe();updateHead(h);setPhase(h?'locked':'needs-create');}});
 const enroll=()=>task(async stamp=>{const e=headRef.current.envelope;const passkey=await registerPasskey(user,e);assertEpoch(stamp);const next=await addPasskey(e,keyRef.current,passkey);assertEpoch(stamp);await saveCurrent(stamp,next,headRef.current.revision_id);});
 const logout=()=>task(async()=>{if(!propsRef.current.bundle.isDemo&&!window.confirm('ההתנתקות תסגור גם את האילן הפתוח ותמחק את העותק המקומי שנזכר בדפדפן. העותק המוצפן בענן לא יימחק. להמשיך?'))return;wipe();updateHead(null);const {error}=await clientRef.current.auth.signOut({scope:'local'});if(error){setUser(null);throw new Error('המפתח ננעל. ניתוק ההתחברות לא הושלם; נסו שוב כשיש חיבור.');}setUser(null);setPhase('signed-out');});
 const loadHistory=()=>task(async stamp=>{const rows=await gatewayRef.current.history();assertEpoch(stamp);setHistory(rows);setShowHistory(true);});
 const chooseHistory=row=>task(async stamp=>{const payload=await gatewayRef.current.read(keyRef.current,row);assertEpoch(stamp);const latest=await gatewayRef.current.head();assertEpoch(stamp);pendingRef.current={head:latest,payload};setShowHistory(false);setPhase('choice');setNotice('נבחרה גרסה קודמת. טעינתה לא מחליפה את גרסת הענן עד לשמירה מפורשת.');});
 const erase=()=>task(async stamp=>{if(!window.confirm('למחוק לצמיתות את הכספת ואת כל גרסאותיה מהענן? לא ניתן לשחזר מחיקה זו מתוך היישום.'))return;await gatewayRef.current.delete(headRef.current.revision_id);assertEpoch(stamp);wipe();updateHead(null);setPhase('needs-create');setNotice('הכספת נמחקה. חשבון ההתחברות של Google לא נמחק.');});
 const close=()=>{if(phase==='recovery-setup'){if(!window.confirm('מפתח השחזור עדיין לא אושר והכספת לא נשמרה. לבטל את ההקמה?'))return;pendingRef.current=null;setRecovery('');setRecoveryTail('');setPhase('needs-create');}setOpen(false);};
 const unlocked=!!keyRef.current;
 const stateLabel=!config?'ענן לא הוגדר':!cloudEnvironment()?'נדרש אתר HTTPS':!user?'שמירה מוצפנת בענן':phase==='loading'?'בודקים את הכספת':phase==='ready'?(error?'הכספת פתוחה · נדרשת בדיקה':auto?'סנכרון מוצפן פעיל':'כספת פתוחה · סנכרון ידני'):phase==='choice'||phase==='conflict'?'נדרשת בחירת גרסה':unlocked?'כספת פתוחה':'הכספת נעולה';
 return <section className="cloud-strip" aria-label="חשבון וסנכרון מוצפן"><span className="cloud-strip-symbol">{unlocked?<ShieldCheck size={17}/>:<Cloud size={18}/>}</span><div><strong>{stateLabel}</strong><small>{!config?'Google · Passkey · הצפנה מקצה לקצה':user?user.email:'הצפנה במכשיר לפני העלאה · בחירה שלכם'}</small></div><button className="cloud-entry" onClick={()=>{setOpen(true);setError('');}}>{user?'ניהול הכספת':config?'כניסה עם Google':'חשבון וענן'}<ChevronLeft size={13}/></button>
 {open&&<Dialog title="הכספת המשפחתית" subtitle="חשבון אחד. המכשירים שלכם. מפתח שנשאר אצלכם." onClose={close} className="cloud-dialog">
   <div className="cloud-security-note"><ShieldCheck size={19}/><p><strong>Google מזהה את החשבון — אינו מפתח ההצפנה.</strong> האילן, שמות הקבצים והמידע המשפחתי מוצפנים במכשיר. לענן נשלחים עותק מוצפן ומטא־דאטה תפעוליים בלבד.</p></div>
   {error&&<div className="cloud-error" role="alert"><AlertTriangle size={17}/><span>{error}</span></div>}
   {notice&&<p className="cloud-notice" role="status">{notice}</p>}
   {!cloudEnvironment()&&<div className="cloud-warning"><CloudOff size={22}/><p>הצפנה וכניסה עם Google דורשות אתר HTTPS. קובץ HTML מקומי ותצוגה מוגנת ללא רשת נשארים במצב מקומי בלבד. פתחו את האתר בדפדפן מלא.</p></div>}
   {(!config||showConfig)&&!user&&<div className="cloud-configuration"><h3>חיבור פרויקט Supabase</h3><ol><li>יוצרים פרויקט ומפעילים את Google בספקי האימות.</li><li>מריצים את קובץ ה־SQL ומגדירים את כתובת האתר ואת כתובות החזרה המותרות.</li><li>מזינים כאן כתובת פרויקט ומפתח ציבורי בלבד.</li></ol><button className="cloud-link" onClick={()=>download('anafim-private-vault.sql',setupSQL)}><Download size={14}/>הורדת SQL להגדרת הענן</button><label>כתובת פרויקט Supabase<input dir="ltr" type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://your-project.supabase.co" autoComplete="off"/></label><label>מפתח publishable / anon ציבורי<input dir="ltr" value={publicKey} onChange={e=>setPublicKey(e.target.value)} autoComplete="off" spellCheck={false}/></label><p>אין להזין Client Secret, סיסמת Google, service_role או sb_secret. מפתח ההצפנה לעולם אינו מוגדר כאן.</p><button className="button button-primary" onClick={configure} disabled={busy}>שמירת הגדרות ציבוריות</button></div>}
   {config&&!user&&<div className="cloud-login"><button className="google-signin" disabled={busy||!cloudEnvironment()} onClick={login}><GoogleMark/>המשך עם Google</button><p>ההתחברות מיועדת לאילן פרטי לכל חשבון. אחרי הכניסה תיפתח כספת באמצעות Passkey או מפתח שחזור.</p><button className="cloud-link" onClick={()=>setShowConfig(v=>!v)}><Settings2 size={13}/>הגדרות חיבור לענן</button></div>}
   {user&&<div className="cloud-account"><span dir="auto">{user.email}</span><button className="cloud-link" onClick={logout} disabled={busy}><LogOut size={14}/>התנתקות</button></div>}
   {user&&phase==='needs-create'&&<div className="cloud-step"><span className="cloud-step-number">01</span><h3>יוצרים כספת שרק אתם יכולים לפתוח</h3><p>מפתח אקראי יצפין את האילן במכשיר. סיסמת הכספת (לא סיסמת Google) תפתח אותו בכל מכשיר. אחר כך תשמרו מפתח שחזור פרטי. לא נעלה דבר לפני אישור השחזור.</p><form className="cloud-recovery-form" onSubmit={e=>{e.preventDefault();create();}}><label>סיסמת כספת<input type="password" value={vaultPassword} onChange={e=>setVaultPassword(e.target.value)} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH}/></label><label>אימות סיסמה<input type="password" value={vaultPassword2} onChange={e=>setVaultPassword2(e.target.value)} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH}/></label><button className="button button-primary button-full" disabled={busy||vaultPassword.length<PASSWORD_MIN_LENGTH} type="submit"><KeyRound size={17}/>יצירת כספת עם סיסמה</button></form><p className="cloud-hint">הסיסמה נשארת אצלכם בלבד ואינה נשלחת לשרת. Google משמש רק לזיהוי החשבון.</p></div>}
   {phase==='recovery-setup'&&<div className="cloud-step"><span className="cloud-step-number">02</span><h3>שומרים מפתח שחזור — לפני שממשיכים</h3><p>המפתח יכול לפתוח את הכספת. שמרו אותו בנפרד, לא בשרת האפליקציה. אובדן כל מפתחות הגישה והשחזור משמעו אובדן הגישה לנתונים.</p><code className="cloud-recovery-code" dir="ltr">{recovery}</code><button className="button button-white" onClick={()=>download('anafim-recovery-key.txt',`ענפים — מפתח שחזור פרטי\nאל תשלחו אותו למפתח או לתמיכה.\n\n${recovery}\n\nכתובת האתר: ${location.origin}\nהחשבון: ${user?.email||''}\n`)}><Download size={16}/>הורדת מפתח שחזור פרטי</button><label className="cloud-check"><input type="checkbox" checked={recoverySaved} onChange={e=>setRecoverySaved(e.target.checked)}/>שמרתי את מפתח השחזור במקום בטוח</label><label>שמונת התווים האחרונים במפתח<input dir="ltr" value={recoveryTail} maxLength={8} onChange={e=>setRecoveryTail(e.target.value)} autoComplete="off"/></label><button className="button button-primary button-full" disabled={busy||!recoverySaved||recoveryTail!==recovery.slice(-8)} onClick={finishCreate}><ShieldCheck size={16}/>אישור ויצירת גיבוי מוצפן</button></div>}
   {user&&phase==='locked'&&<div className="cloud-step"><LockKeyhole size={29}/><h3>הנתונים בענן מוצפנים</h3><p>גרסה {head?.generation} · {dateLabel(head?.updated_at)}. פתחו עם סיסמת הכספת, Passkey (אם נרשם) או מפתח השחזור.</p>{hasPasswordWrap(head?.envelope)&&<form className="cloud-recovery-form" onSubmit={e=>{e.preventDefault();openWithVaultPassword();}}><label>סיסמת כספת<input type="password" value={unlockPassword} onChange={e=>setUnlockPassword(e.target.value)} autoComplete="current-password"/></label><button className="button button-primary button-full" disabled={busy||!unlockPassword} type="submit"><KeyRound size={16}/>פתיחה עם סיסמה</button></form>}{hasPasskeyWrap(head?.envelope)&&<button className="button button-white button-full" onClick={unlockPasskey} disabled={busy||!passkeyEnvironment()}><KeyRound size={16}/>פתיחה עם Passkey</button>}<button className="cloud-link" onClick={()=>setShowRecovery(v=>!v)}>פתיחה באמצעות מפתח שחזור פרטי</button><button className="cloud-link" disabled={busy} onClick={refresh}>רענון פרטי הכספת</button>{showRecovery&&<form className="cloud-recovery-form" onSubmit={e=>{e.preventDefault();unlockRecovery();}}><label>מפתח שחזור<input type="password" dir="ltr" value={recoveryInput} onChange={e=>setRecoveryInput(e.target.value)} autoComplete="off"/></label><button className="button button-white" disabled={busy||!recoveryInput}>פתיחה</button></form>}</div>}
   {phase==='choice'&&pendingRef.current?.payload&&<div className="cloud-step"><h3>איזה עותק לפתוח?</h3><p>בענן: <bdi>{pendingRef.current.payload.filename||'כספת ללא אילן'}</bdi>. פתיחה תחליף את התצוגה המקומית. גרסאות קודמות נשמרות מוצפנות, ואין מיזוג אוטומטי של קובצי GEDCOM.</p><div className="cloud-actions"><button className="button button-primary" disabled={busy} onClick={()=>task(takeRemote)}><Download size={15}/>פתיחת העותק מהענן</button>{!bundle.isDemo&&<button className="button button-white" disabled={busy} onClick={()=>task(s=>saveCurrent(s))}><Upload size={15}/>שמירת האילן המקומי במקום העותק בענן</button>}</div></div>}
   {phase==='conflict'&&<div className="cloud-step"><AlertTriangle size={25}/><h3>שני מכשירים, בלי דריסה שקטה</h3><p>יש הבדל בין האילן המקומי לגרסת הענן. לא נשמור ולא נחליף נתונים עד שתבחרו.</p><button className="button button-primary" disabled={busy} onClick={refresh}><RefreshCw size={16}/>בדיקת הגרסה החדשה ובחירת עותק</button></div>}
   {phase==='ready'&&<div className="cloud-step"><div className="cloud-ready"><Check size={19}/><h3>הכספת פתוחה במכשיר הזה</h3></div><p>גרסה {head?.generation} · {dateLabel(head?.updated_at)}. המפתח נשמר בזיכרון בלבד. נעילה אוטומטית אחרי 10 דקות ללא פעילות.</p><label className="cloud-check"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)} disabled={busy}/>סנכרון אוטומטי של אילנות שאפתח, כל עוד הכספת פתוחה</label><div className="cloud-actions"><button className="button button-primary" disabled={busy||bundle.isDemo} onClick={()=>task(s=>saveCurrent(s))}><Upload size={15}/>שמירה מוצפנת עכשיו</button><button className="button button-white" disabled={busy} onClick={refresh}><RefreshCw size={15}/>בדיקת עדכונים</button><button className="button button-white" disabled={busy} onClick={lock}><LockKeyhole size={15}/>נעילת הכספת וסגירת האילן</button></div>{bundle.isDemo&&<button className="cloud-link" onClick={()=>{setOpen(false);requestAnimationFrame(onUpload);}}>פתיחת קובץ GEDCOM לסנכרון</button>}<details className="cloud-more"><summary>מפתחות גישה, גרסאות ופרטיות</summary><p>מפתח השחזור אינו ניתן לשחזור על ידי המפתח. אפשר לרשום Passkey נוסף כשיש לכם גישה לכספת. פעולה זו אינה מבטלת מפתחות ישנים.</p><button className="cloud-link" disabled={busy||bundle.isDemo} onClick={enroll}><KeyRound size={14}/>הוספת Passkey במכשיר הזה</button><button className="cloud-link" disabled={busy} onClick={loadHistory}>עשר הגרסאות האחרונות בענן</button><button className="cloud-link cloud-danger" disabled={busy} onClick={erase}>מחיקת הכספת וכל גרסאותיה מהענן</button><p>למפתח ולספק הענן גלויים חשבון ההתחברות, מזהי גרסאות, זמני עדכון, גודל מוצפן ומעטפות מפתח מוצפנות — לא תוכן האילן. העותק המקומי האופציונלי בדפדפן אינו מוצפן.</p></details></div>}
   {showHistory&&<div className="cloud-history"><h3>גרסאות מוצפנות</h3>{history.map(row=><button key={row.revision_id} disabled={busy} onClick={()=>chooseHistory(row)}>גרסה {row.generation}<span>{dateLabel(row.updated_at)}</span><ChevronLeft size={13}/></button>)}</div>}
   {user&&phase==='connection-error'&&<button className="button button-white" disabled={busy} onClick={refresh}><RefreshCw size={15}/>ניסיון חיבור נוסף</button>}
   {busy&&<div className="cloud-working" role="status"><LoaderCircle size={17} className="spin"/>מבצעים את הפעולה באופן מאובטח…</div>}
   <p className="cloud-bottom-note">גישה לענן אינה מעניקה מפתח פענוח. ההגנה תלויה גם בשלמות קוד הלקוח והמכשיר. אין לשלוח מפתח שחזור לצוות התמיכה.</p>
 </Dialog>}
 </section>;
}
