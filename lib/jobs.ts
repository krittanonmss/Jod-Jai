import {db,assertDb} from './db';
import {processEvent} from './bot';
import {pushMessages,LineDeliveryError,LineEvent,Message} from './line';
import {isAuthorizedUser} from './access';
import {text} from './messages';

type EventJob={id:string;user_id:string;lease_token:string;attempts:number;payload:LineEvent;response:Message[]|null;ack_status:string;ack_lease_token:string|null;};

async function deliverAck(ack:EventJob){
 try{
  await pushMessages(ack.user_id,[text('รับรูปแล้ว กำลังอ่านสลิป...')],`${ack.id}:ack`);
  const updated=await db().from('jod_events').update({ack_status:'accepted',ack_accepted_at:new Date().toISOString(),ack_lease_until:null,ack_last_error:null}).eq('id',ack.id).eq('ack_lease_token',ack.ack_lease_token);assertDb(updated.error);
 }catch(error){
  const message=error instanceof LineDeliveryError?`${error.kind}: ${error.message}`:error instanceof Error?error.message:'Acknowledgement failed';
  const retryAt=new Date(Date.now()+Math.min(300,2**Math.min(ack.attempts,5)*10)*1000).toISOString();
  const updated=await db().from('jod_events').update({ack_status:'processing',ack_lease_until:retryAt,ack_last_error:message.slice(0,160)}).eq('id',ack.id).eq('ack_lease_token',ack.ack_lease_token);assertDb(updated.error);
 }
}
export async function drainJobs(budgetMs=190000){
 const deadline=Date.now()+budgetMs;let processed=0;
 while(Date.now()<deadline){
  const pendingAck=await db().rpc('jod_claim_pending_ack');assertDb(pendingAck.error);
  const ack=pendingAck.data?.[0] as EventJob|undefined;
  if(ack){await deliverAck(ack);continue;}
  const {data,error}=await db().rpc('jod_claim_job');assertDb(error);
  const job=data?.[0] as EventJob|undefined;if(!job)break;
  try {
   const claimedAck=await db().rpc('jod_claim_ack',{p_event_id:job.id});assertDb(claimedAck.error);
   const jobAck=claimedAck.data?.[0] as EventJob|undefined;
   if(jobAck)await deliverAck(jobAck);
   if(!await isAuthorizedUser(job.user_id)){
    const done=await db().from('jod_events').update({status:'done',payload:{},lease_until:null,last_error:'authorization_revoked'}).eq('id',job.id).eq('lease_token',job.lease_token);assertDb(done.error);continue;
   }
   let messages:Message[]|null=job.response;
   if(!messages){
    messages=await processEvent(job.payload as LineEvent);
    const saved=await db().from('jod_events').update({response:messages,result_saved_at:new Date().toISOString(),renderer_version:'v1'}).eq('id',job.id).eq('lease_token',job.lease_token).select('id');assertDb(saved.error);
    if(!saved.data?.length)continue;
   }
   // A persisted response and stable LINE retry key prevent duplicate notifications after crashes.
   if(messages.length){
    const attempt=await db().from('jod_events').update({result_delivery_attempts:job.attempts}).eq('id',job.id).eq('lease_token',job.lease_token);assertDb(attempt.error);
    await pushMessages(job.user_id,messages,`${job.id}:result`);
   }
   const done=await db().from('jod_events').update({status:'done',payload:{},lease_until:null,last_error:null,result_delivered_at:messages.length?new Date().toISOString():null}).eq('id',job.id).eq('lease_token',job.lease_token);assertDb(done.error);processed++;
  }catch(error){
   const safeError=error instanceof LineDeliveryError?`${error.kind}: ${error.message}`.slice(0,160):error instanceof Error?error.message.slice(0,160):'Processing failed';
   // No images, tokens, raw OCR text or user message contents in logs.
   console.error('Job failed',job.id,safeError);
   const update=await db().from('jod_events').update({status:job.attempts>=5?'dead':'pending',lease_until:null,last_error:safeError,available_at:new Date(Date.now()+Math.min(300,2**job.attempts*10)*1000).toISOString()}).eq('id',job.id).eq('lease_token',job.lease_token);assertDb(update.error);
  }
 }
 return processed;
}
export async function cleanupOldData(){
 const months=Number.parseInt(process.env.RETENTION_MONTHS||'6',10);
 if(!Number.isInteger(months)||months<1||months>120)throw new Error('Invalid RETENTION_MONTHS');
 const {error}=await db().rpc('jod_cleanup_old_data',{p_months:months});assertDb(error);
}
