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
   let timer;const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(keyRef.current)lock();},2*24*60*60*1000);};reset();
   window.addEventListener('pointerdown',reset);window.addEventListener('keydown',reset);
   return()=>{clearTimeout(timer);window.removeEventListener('pointerdown',reset);window.removeEventListener('keydown',reset);};
 },[phase]);
 const configure=()=>{try{if(user)throw new Error('יש להתנתק לפני שינוי פרויקט ענן.');const safe=saveCloudConfig({url,key:publicKey});wipe(false);setConfig(safe);setShowConfig(false);setError('');setNotice('הפרויקט הוגדר. יש לוודא שגם SQL ו־Google OAuth הוגדרו לפני ההתחברות.');}catch(e){setError(e.message);}};
 const login=()=>task(async()=>{if(!cloudEnvironment())throw new Error('התחברות לענן פועלת באתר HTTPS, לא בקובץ HTML מקומי.');const {error}=await clientRef.current.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname,scopes:'openid email profile',queryParams:{prompt:'select_account'}}});if(error)throw error;});
