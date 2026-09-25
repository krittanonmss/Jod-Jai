import {db,assertDb} from '../lib/db';
import {fallbackMessages,Message} from '../lib/line';

process.loadEnvFile('.env.local');
const apply=process.argv.includes('--apply');
const result=await db().from('jod_events')
 .select('id,status,response_original,renderer_version')
 .not('response_original','is',null)
 .in('status',['pending','dead'])
 .limit(100);
assertDb(result.error);
const rows=result.data||[];
console.log(JSON.stringify({candidates:rows.length,ids:rows.map(row=>row.id),apply},null,2));
if(!apply||!rows.length)process.exit(0);
for(const row of rows){
 const original=row.response_original as Message[];
 const update=await db().from('jod_events').update({
  response:fallbackMessages(original),renderer_version:'v1-repaired-fallback',status:'pending',available_at:new Date().toISOString(),lease_until:null,last_error:'response_repaired',
 }).eq('id',row.id).eq('status',row.status);
 assertDb(update.error);
}
console.log(`Repaired ${rows.length} persisted response(s); business effects were not re-run.`);
