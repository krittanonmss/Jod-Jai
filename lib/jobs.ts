import {db,assertDb} from './db';
import {processEvent} from './bot';
import {pushMessages,LineEvent,Message} from './line';
import {isAuthorizedUser} from './access';
export async function drainJobs(budgetMs=190000){
 const deadline=Date.now()+budgetMs;let processed=0;
 while(Date.now()<deadline){
  const {data,error}=await db().rpc('jod_claim_job');assertDb(error);
  const job=data?.[0];if(!job)break;
  try {
   if(!await isAuthorizedUser(job.user_id)){
    const done=await db().from('jod_events').update({status:'done',payload:{},response:null}).eq('id',job.id).eq('lease_token',job.lease_token);assertDb(done.error);continue;
   }
   let messages:Message[]=job.response;
   if(!messages){
    messages=await processEvent(job.payload as LineEvent);
    const saved=await db().from('jod_events').update({response:messages}).eq('id',job.id).eq('lease_token',job.lease_token).select('id');assertDb(saved.error);
    if(!saved.data?.length)continue;
   }
   // A persisted response and stable LINE retry key prevent duplicate notifications after crashes.
   if(messages.length)await pushMessages(job.user_id,messages,job.id);
   const done=await db().from('jod_events').update({status:'done',payload:{},response:null,lease_until:null,last_error:null}).eq('id',job.id).eq('lease_token',job.lease_token);assertDb(done.error);processed++;
  }catch(error){
   const safeError=error instanceof Error?error.message.slice(0,160):'Processing failed';
   // No images, tokens, raw OCR text or user message contents in logs.
   console.error('Job failed',job.id,safeError);
   const update=await db().from('jod_events').update({status:job.attempts>=5?'dead':'pending',lease_until:null,last_error:safeError,available_at:new Date(Date.now()+Math.min(300,2**job.attempts*10)*1000).toISOString()}).eq('id',job.id).eq('lease_token',job.lease_token);assertDb(update.error);
  }
 }
 return processed;
}
