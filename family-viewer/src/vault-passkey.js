// Passkeys unlock client-side encryption only. Google/Supabase authenticates the account.
// No client-only WebAuthn assertion is accepted as server authentication.
import {base64url,unbase64url,randomBytes} from './vault-crypto.js';
export function passkeyEnvironment(){return typeof window!=='undefined'&&window.isSecureContext&&!!location.hostname&&typeof PublicKeyCredential!=='undefined'&&!!navigator.credentials?.create&&!!navigator.credentials?.get;}
function environment(){if(!passkeyEnvironment())throw new Error('Passkey דורש אתר HTTPS ודפדפן תומך. קובץ HTML מקומי אינו מספיק.');}
function message(error){
  if(error?.name==='NotAllowedError'||error?.name==='AbortError')return new Error('פעולת מפתח הגישה בוטלה או לא הושלמה. לא הועלו נתונים.');
  if(error?.name==='SecurityError')return new Error('כתובת האתר אינה מתאימה למפתח הגישה. נסו מפתח שחזור וכתובת קבועה.');
  return error;
}
function secretFrom(credential){const result=credential?.getClientExtensionResults?.().prf?.results?.first;if(!result||result.byteLength!==32)throw new Error('מפתח הגישה או הדפדפן אינם מספקים PRF להצפנה. לא נשתמש במזהה Google כתחליף. אפשר לפתוח כספת קיימת באמצעות מפתח השחזור.');return new Uint8Array(result);}
export async function registerPasskey(user,existingEnvelope){
  environment();const salt=existingEnvelope?.prfSalt||base64url(randomBytes(32));const rpId=location.hostname;
  const id=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.id)));
  try{
    const credential=await navigator.credentials.create({publicKey:{challenge:randomBytes(32),rp:{id:rpId,name:'ענפים — כספת פרטית'},user:{id,name:user.email||user.id,displayName:'ענפים — האילן הפרטי'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],timeout:90000,attestation:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'},excludeCredentials:(existingEnvelope?.wraps||[]).filter(w=>w.method==='passkey-prf'&&w.rpId===rpId).map(w=>({id:unbase64url(w.credentialId),type:'public-key'})),extensions:{prf:{eval:{first:unbase64url(salt,32)}},credProps:true}}});
    if(!credential)throw new Error('לא נוצר מפתח גישה.');let secret;
    if(credential.getClientExtensionResults().prf?.results?.first)secret=secretFrom(credential);
    else{
      if(!credential.getClientExtensionResults().prf?.enabled)throw new Error('מפתח הגישה אינו תומך ב־PRF. הכספת לא נוצרה ולא הועלו נתונים.');
      const assertion=await navigator.credentials.get({publicKey:{challenge:randomBytes(32),rpId,allowCredentials:[{type:'public-key',id:credential.rawId}],userVerification:'required',timeout:90000,extensions:{prf:{eval:{first:unbase64url(salt,32)}}}}});secret=secretFrom(assertion);
    }
    return {credentialId:base64url(credential.rawId),rpId,prfSalt:salt,secret};
  }catch(error){throw message(error);}
}
export async function authenticatePasskey(envelope){
  environment();const rpId=location.hostname;const wraps=envelope.wraps.filter(w=>w.method==='passkey-prf'&&w.rpId===rpId);
  if(!wraps.length)throw new Error('מפתח הגישה נרשם בכתובת אתר אחרת. פתחו באמצעות מפתח שחזור ואז הוסיפו Passkey לכתובת הזו.');
  try{const credential=await navigator.credentials.get({publicKey:{rpId,challenge:randomBytes(32),timeout:90000,userVerification:'required',allowCredentials:wraps.map(w=>({type:'public-key',id:unbase64url(w.credentialId)})),extensions:{prf:{eval:{first:unbase64url(envelope.prfSalt,32)}}}}});return {credentialId:base64url(credential.rawId),secret:secretFrom(credential)};}catch(error){throw message(error);}
}
