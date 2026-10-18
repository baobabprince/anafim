import test from 'node:test';import assert from 'node:assert/strict';
import {base64url,randomBytes,createVault,unlockWithRecovery,unlockWithPasskey,encryptSnapshot,decryptSnapshot,addPasskey,snapshotFingerprint} from '../src/vault-crypto.js';
const owner='11111111-2222-4333-8444-555555555555';
const payload={format:'anafim-snapshot',version:1,raw:'0 HEAD\n0 @I@ INDI\n1 NAME משפחה /פרטית/\n0 TRLR',filename:'אילן-פרטי.ged',encoding:'utf-8',selectedId:'@I@'};
const passkey=()=>({credentialId:base64url(randomBytes(32)),rpId:'localhost',prfSalt:base64url(randomBytes(32)),secret:randomBytes(32)});
test('local AES-GCM envelope encrypts a full snapshot, including filename, and recovery decrypts it',async()=>{
 const v=await createVault(owner,passkey()),encrypted=await encryptSnapshot(v.key,v.envelope,payload);
 assert.ok(!JSON.stringify(encrypted.envelope).includes('משפחה'));
 assert.ok(!new TextDecoder().decode(encrypted.ciphertext).includes('פרטית'));
 const key=await unlockWithRecovery(encrypted.envelope,owner,v.recovery);
 assert.deepEqual(await decryptSnapshot(key,encrypted.envelope,owner,encrypted.revisionId,encrypted.ciphertext),payload);
});
test('wrong recovery, public Google identifier, tampering and cross-owner substitution fail closed',async()=>{
 const v=await createVault(owner,passkey()),cipher=await encryptSnapshot(v.key,v.envelope,payload);
 await assert.rejects(unlockWithRecovery(cipher.envelope,owner,'google-sub-is-not-a-secret'));
 await assert.rejects(unlockWithRecovery(cipher.envelope,owner,v.recovery.slice(0,-1)+'z'));
 const damaged=cipher.ciphertext.slice();damaged[0]^=1;
 await assert.rejects(decryptSnapshot(v.key,cipher.envelope,owner,cipher.revisionId,damaged));
 const other='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
 await assert.rejects(decryptSnapshot(v.key,cipher.envelope,other,cipher.revisionId,cipher.ciphertext));
 const spoof=structuredClone(cipher.envelope);spoof.ownerId=other;
 await assert.rejects(decryptSnapshot(v.key,spoof,other,cipher.revisionId,cipher.ciphertext));
});
test('a PRF-backed key wrap requires the matching credential secret, and supports a second passkey',async()=>{
 const p=passkey(),secret=p.secret.slice(),id=p.credentialId,v=await createVault(owner,p);
 const key=await unlockWithPasskey(v.envelope,owner,id,secret);
 const second=passkey(),secondSecret=second.secret.slice(),secondId=second.credentialId;
 const next=await addPasskey(v.envelope,key,second);
 const nextKey=await unlockWithPasskey(next,owner,secondId,secondSecret);
 const encrypted=await encryptSnapshot(key,next,payload);
 assert.deepEqual(await decryptSnapshot(nextKey,encrypted.envelope,owner,encrypted.revisionId,encrypted.ciphertext),payload);
 await assert.rejects(unlockWithPasskey(next,owner,id,randomBytes(32)));
 assert.equal(p.secret.every(n=>n===0),true);
});
test('nonces and revision identifiers are fresh, and revision/AAD substitution is rejected',async()=>{
 const v=await createVault(owner,passkey());const a=await encryptSnapshot(v.key,v.envelope,payload),b=await encryptSnapshot(v.key,v.envelope,payload);
 assert.notEqual(a.envelope.cipher.iv,b.envelope.cipher.iv);assert.notEqual(a.revisionId,b.revisionId);assert.notDeepEqual(a.ciphertext,b.ciphertext);
 await assert.rejects(decryptSnapshot(v.key,b.envelope,owner,b.revisionId,a.ciphertext));
 assert.equal(await snapshotFingerprint({...payload,savedAt:'a'}),await snapshotFingerprint({...payload,savedAt:'b'}));
});
