import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'VITE_'),key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(key){
  let safe=/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(key);
  if(!safe)try{safe=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon';}catch{}
  if(!safe)throw new Error('Cloud configuration must contain only a public publishable/anon key. Server secrets must never be bundled.');
 }
 return {plugins:[react()],server:{host:'0.0.0.0',allowedHosts:true,port:5173},preview:{host:'0.0.0.0',allowedHosts:true}};
});
