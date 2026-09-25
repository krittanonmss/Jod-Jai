import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
try{process.loadEnvFile('.env.local');}catch{}
const env=process.env;
const project=env.SUPABASE_PROJECT_REF;
export async function api(url,token,options={}){
 const r=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(60000)});
 if(!r.ok){let detail=''; try{const error=await r.json();detail=String(error.error?.message||error.message||JSON.stringify(error));}catch{} throw new Error(`API ${new URL(url).hostname}${new URL(url).pathname}: HTTP ${r.status} ${detail}`);}
 return r.status===204?null:r.json();
}
export async function sql(query){return api(`https://api.supabase.com/v1/projects/${project}/database/query`,env.SUPABASE_ACCESS_TOKEN,{method:'POST',body:JSON.stringify({query})});}
async function setLocal(updates){
 let content=await readFile('.env.local','utf8');
 for(const [key,value] of Object.entries(updates)){
  const re=new RegExp(`^${key}=.*$`,'m');
  content=re.test(content)?content.replace(re,`${key}=${value}`):content+`\n${key}=${value}\n`;
  env[key]=value;
 }
 await writeFile('.env.local',content,{mode:0o600});
}
async function bootstrap(){
 if(!env.LINE_PAIRING_CODE)await setLocal({LINE_PAIRING_CODE:randomBytes(12).toString('hex')});
 if(!env.CRON_SECRET)await setLocal({CRON_SECRET:randomBytes(32).toString('hex')});
 if(!env.SUPABASE_URL)await setLocal({SUPABASE_URL:`https://${project}.supabase.co`});
 if(!env.SUPABASE_SECRET_KEY || process.argv.includes('--refresh-key')){
  const keys=await api(`https://api.supabase.com/v1/projects/${project}/api-keys?reveal=true`,env.SUPABASE_ACCESS_TOKEN);
  let key=keys.find(k=>k.type==='secret' && k.name==='jod-jai-backend') || keys.find(k=>k.type==='secret');
  if(!key)key=await api(`https://api.supabase.com/v1/projects/${project}/api-keys`,env.SUPABASE_ACCESS_TOKEN,{method:'POST',body:JSON.stringify({type:'secret',name:'jod-jai-backend'})});
  if(!key.api_key)throw new Error('Secret key unavailable');
  await setLocal({SUPABASE_SECRET_KEY:key.api_key});
 }
 console.log('Runtime database credentials configured locally (values hidden).');
}
async function migrate(){
 await sql(`create table if not exists public.jod_migrations(name text primary key, checksum text not null, applied_at timestamptz default now()); alter table public.jod_migrations enable row level security; revoke all on public.jod_migrations from anon, authenticated;`);
 const applied=await sql('select name,checksum from public.jod_migrations');
 for(const name of (await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort()){
  const query=await readFile('supabase/migrations/'+name,'utf8');const checksum=createHash('sha256').update(query).digest('hex');
  const previous=applied.find(r=>r.name===name);
  if(previous){if(previous.checksum!==checksum)throw new Error('Applied migration changed: '+name);continue;}
  const statement=query.replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'');
  await sql(`begin;\n${statement}\ninsert into public.jod_migrations(name,checksum) values('${name}','${checksum}');commit;`);
  console.log('Applied '+name);
 }
}
async function team(){
 const teams=await api('https://api.vercel.com/v2/teams',env.VERCEL_TOKEN);
 const found=teams.teams.find(t=>t.slug==='krittanon') || (teams.teams.length===1?teams.teams[0]:null);
 if(!found)throw new Error('Cannot uniquely select Vercel team');
 return found;
}
const runtimeKeys=['SUPABASE_URL','SUPABASE_SECRET_KEY','LINE_CHANNEL_ID','LINE_CHANNEL_SECRET','LINE_CHANNEL_ACCESS_TOKEN','LINE_ALLOWED_USER_IDS','LINE_PAIRING_CODE','CRON_SECRET','APP_URL','RETENTION_MONTHS'];
async function deploy(){
 const owner=await team();const query=`?teamId=${encodeURIComponent(owner.id)}`;
 const projects=await api('https://api.vercel.com/v9/projects'+query,env.VERCEL_TOKEN);
 let app=projects.projects.find(p=>p.name==='jod-jai');
 if(!app)app=await api('https://api.vercel.com/v11/projects'+query,env.VERCEL_TOKEN,{method:'POST',body:JSON.stringify({name:'jod-jai',framework:'nextjs',buildCommand:'npm run build'})});
 const settings=runtimeKeys.filter(key=>env[key]).map(key=>({key,value:env[key],type:'encrypted',target:['production']}));
 if(settings.length)await api(`https://api.vercel.com/v10/projects/${app.id}/env${query}&upsert=true`,env.VERCEL_TOKEN,{method:'POST',body:JSON.stringify(settings)});
 const files=[];
 async function collect(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
  const f=path.join(dir,entry.name);if(entry.isDirectory())await collect(f);else if(entry.isFile())files.push({file:f,data:(await readFile(f)).toString('base64'),encoding:'base64'});
 }}
 for(const dir of ['app','lib','public'])await collect(dir);
 for(const file of ['package.json','package-lock.json','next.config.ts','tsconfig.json','next-env.d.ts','vercel.json'])files.push({file,data:(await readFile(file)).toString('base64'),encoding:'base64'});
 const result=await api('https://api.vercel.com/v13/deployments'+query,env.VERCEL_TOKEN,{method:'POST',body:JSON.stringify({name:'jod-jai',project:app.id,target:'production',files,projectSettings:{framework:'nextjs',buildCommand:'npm run build'}})});
 await mkdir('.deploy',{recursive:true});await writeFile('.deploy/vercel.json',JSON.stringify({id:result.id,url:result.url,teamId:owner.id,projectId:app.id},null,2));
 console.log('Deployment created: https://'+result.url);
}
async function status(){
 const deploy=JSON.parse(await readFile('.deploy/vercel.json','utf8'));
 const result=await api(`https://api.vercel.com/v13/deployments/${deploy.id}?teamId=${deploy.teamId}`,env.VERCEL_TOKEN);
 console.log(JSON.stringify({state:result.readyState,url:result.url,aliases:result.alias,error:result.errorMessage}));
}
async function cron(){
 const deploy=JSON.parse(await readFile('.deploy/vercel.json','utf8'));
 const result=await api(`https://api.vercel.com/v13/deployments/${deploy.id}?teamId=${deploy.teamId}`,env.VERCEL_TOKEN);
 if(result.readyState!=='READY')throw new Error('Deployment not ready');
 const alias=result.alias?.find(a=>a.startsWith('jod-jai')&&a.endsWith('.vercel.app'))||result.url;
 const endpoint=`https://${alias}/api/jobs/run`;
 // Vault keeps the worker credential out of cron.job command text.
 const quote=s=>"'"+s.replaceAll("'","''")+"'";
 await sql(`create extension if not exists pg_cron; create extension if not exists pg_net with schema extensions;
 do $$ declare s uuid; begin
 select id into s from vault.secrets where name='jod_jai_worker_secret';
 if s is null then perform vault.create_secret(${quote(env.CRON_SECRET)},'jod_jai_worker_secret'); else perform vault.update_secret(s,${quote(env.CRON_SECRET)}); end if;
 end $$;
 select cron.schedule('jod-jai-retry','* * * * *',$job$
 select net.http_post(url:=${quote(endpoint)},headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='jod_jai_worker_secret')),body:='{}'::jsonb,timeout_milliseconds:=1000)
 where exists(select 1 from public.jod_events where (status='pending' and available_at<=now()) or (status='processing' and lease_until<now()));
 $job$);`);
 console.log('Durable retry scheduler configured for '+endpoint);
}
async function dbtest(){await sql(await readFile('tests/database.sql','utf8'));console.log('Database integration checks passed; test data rolled back.');}
async function linecheck(){
 const info=await api('https://api.line.me/v2/bot/info',env.LINE_CHANNEL_ACCESS_TOKEN);
 console.log('LINE bot: '+info.displayName+' / '+info.basicId);
 if(info.basicId!=='@332nhscs')throw new Error('Unexpected LINE OA; refusing to change webhook');
 const hook=await api('https://api.line.me/v2/bot/channel/webhook/endpoint',env.LINE_CHANNEL_ACCESS_TOKEN);
 console.log(JSON.stringify({endpoint:hook.endpoint,active:hook.active}));
}
async function linehook(){
 const info=await api('https://api.line.me/v2/bot/info',env.LINE_CHANNEL_ACCESS_TOKEN);
 if(info.basicId!=='@332nhscs')throw new Error('Unexpected LINE OA');
 const deployment=JSON.parse(await readFile('.deploy/vercel.json','utf8'));
 const state=await api(`https://api.vercel.com/v13/deployments/${deployment.id}?teamId=${deployment.teamId}`,env.VERCEL_TOKEN);
 if(state.readyState!=='READY')throw new Error('Deployment not ready');
 const alias=state.alias?.find(a=>a==='jod-jai.vercel.app')||state.alias?.[0];
 if(!alias)throw new Error('No production alias');
 const endpoint=`https://${alias}/api/line/webhook`;
 await api('https://api.line.me/v2/bot/channel/webhook/endpoint',env.LINE_CHANNEL_ACCESS_TOKEN,{method:'PUT',body:JSON.stringify({endpoint})});
 const result=await api('https://api.line.me/v2/bot/channel/webhook/test',env.LINE_CHANNEL_ACCESS_TOKEN,{method:'POST',body:JSON.stringify({endpoint})});
 console.log('Webhook configured: '+endpoint);console.log(JSON.stringify(result));
}
async function smoke(){
 const info=JSON.parse(await readFile('.deploy/vercel.json','utf8'));
 const deployment=await api(`https://api.vercel.com/v13/deployments/${info.id}?teamId=${info.teamId}`,env.VERCEL_TOKEN);
 if(deployment.readyState!=='READY')throw new Error('Deployment not ready');
 const alias=deployment.alias?.find(a=>a==='jod-jai.vercel.app')||deployment.alias?.[0]||deployment.url;
 const base='https://'+alias;
 const home=await fetch(base);if(home.status!==200||!(await home.text()).includes('Jod-Jai'))throw new Error('Homepage smoke failed');
 const health=await fetch(base+'/api/health');if(health.status!==200)throw new Error('Health failed');
 const unsigned=await fetch(base+'/api/line/webhook',{method:'POST',body:'{"events":[]}'});if(unsigned.status!==401)throw new Error('Unsigned webhook not rejected: '+unsigned.status);
 const body='{"events":[]}';const signature=createHmac('sha256',env.LINE_CHANNEL_SECRET).update(body).digest('base64');
 const signed=await fetch(base+'/api/line/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-line-signature':signature},body});if(signed.status!==200)throw new Error('Signed webhook failed: '+signed.status);
 const worker=await fetch(base+'/api/jobs/run',{method:'POST'});if(worker.status!==401)throw new Error('Worker exposed');
 const maintenance=await fetch(base+'/api/jobs/run');if(maintenance.status!==401)throw new Error('Maintenance endpoint exposed');
 const invalidExport=await fetch(base+'/api/export?token=invalid');if(invalidExport.status!==400)throw new Error('Invalid export token accepted');
 const denied={events:[{webhookEventId:'smoke-'+randomBytes(12).toString('hex'),type:'message',timestamp:Date.now(),source:{type:'user',userId:'U00000000000000000000000000000000'},message:{id:'smoke',type:'text',text:'hello'}}]};
 const deniedBody=JSON.stringify(denied);const deniedSig=createHmac('sha256',env.LINE_CHANNEL_SECRET).update(deniedBody).digest('base64');
 const deniedResult=await fetch(base+'/api/line/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-line-signature':deniedSig},body:deniedBody});if(deniedResult.status!==200)throw new Error('Owner authorization/database check failed: '+deniedResult.status);
 console.log('Live smoke passed: homepage, health, signed webhook, protected worker/maintenance, guarded export and DB-backed owner check. '+base);
}
async function maintenance(){
 const info=JSON.parse(await readFile('.deploy/vercel.json','utf8'));
 const deployment=await api(`https://api.vercel.com/v13/deployments/${info.id}?teamId=${info.teamId}`,env.VERCEL_TOKEN);
 if(deployment.readyState!=='READY')throw new Error('Deployment not ready');
 const alias=deployment.alias?.find(a=>a==='jod-jai.vercel.app')||deployment.alias?.[0]||deployment.url;
 const response=await fetch('https://'+alias+'/api/jobs/run',{headers:{Authorization:`Bearer ${env.CRON_SECRET}`}});
 if(!response.ok)throw new Error('Maintenance HTTP '+response.status);
 console.log('Retention maintenance completed successfully.');
}
async function check(){
 const p=await api(`https://api.supabase.com/v1/projects/${project}`,env.SUPABASE_ACCESS_TOKEN);console.log('Supabase: '+p.name+' / '+p.status);
 const t=await team();console.log('Vercel team: '+t.slug);
 for(const k of runtimeKeys)console.log(k+': '+(env[k]?'set':'MISSING'));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  const action=process.argv[2];
  await ({check,bootstrap,migrate,deploy,status,cron,dbtest,linecheck,linehook,smoke,maintenance}[action]||(()=>{throw new Error('Unknown command');}))();
 }catch(e){console.error(e.message);process.exitCode=1;}
}
