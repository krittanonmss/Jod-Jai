import {after} from 'next/server';
import {z} from 'zod';
import {LineEvent,pushMessages,replyMessages,validSignature} from '@/lib/line';
import {required,allowedUser} from '@/lib/config';
import {tryJoinInvite,tryPairOwner} from '@/lib/access';
import {db,assertDb} from '@/lib/db';
import {drainJobs} from '@/lib/jobs';
import {text} from '@/lib/messages';
export const runtime='nodejs';
export const maxDuration=300;
const schema=z.object({events:z.array(z.object({
 webhookEventId:z.string().min(1),type:z.string(),timestamp:z.number(),
 replyToken:z.string().optional(),
 source:z.object({type:z.string(),userId:z.string().optional()}),
 message:z.object({id:z.string(),type:z.string(),text:z.string().optional()}).optional(),
 postback:z.object({data:z.string()}).optional(),
 })).max(100)});
type Accepted={id:string|null;inserted:boolean;authorized:boolean;allowed:boolean;request_count:number};

async function accept(event:LineEvent,user:string):Promise<Accepted>{
 const {data,error}=await db().rpc('jod_accept_event',{
  p_event:event.webhookEventId,p_user:user,p_occurred_ms:event.timestamp,p_payload:event,
  p_config_authorized:allowedUser(user),p_limit:30,p_seconds:60,
 });assertDb(error);return data?.[0] as Accepted;
}
async function acknowledgeImage(event:LineEvent,eventId:string){
 const claimed=await db().rpc('jod_claim_ack',{p_event_id:eventId});assertDb(claimed.error);
 const ack=claimed.data?.[0];if(!ack)return;
 try{
  const message=[text('รับรูปแล้ว กำลังอ่านสลิป...')];
  if(event.replyToken)await replyMessages(event.replyToken,message);
  else await pushMessages(event.source.userId!,message,`${eventId}:ack`);
  const updated=await db().from('jod_events').update({ack_status:'accepted',ack_accepted_at:new Date().toISOString(),ack_lease_until:null,ack_last_error:null}).eq('id',eventId).eq('ack_lease_token',ack.ack_lease_token);assertDb(updated.error);
 }catch(error){
  const detail=error instanceof Error?error.message.slice(0,160):'Acknowledgement failed';
  const updated=await db().from('jod_events').update({ack_status:'pending',ack_lease_until:null,ack_last_error:detail}).eq('id',eventId).eq('ack_lease_token',ack.ack_lease_token);assertDb(updated.error);
  console.error('Slip acknowledgement failed',event.webhookEventId,detail);
 }
}
async function sendUnauthorized(event:LineEvent,user:string){
 if(event.type!=='message'||event.message?.type!=='text')return;
 const notice=[text('ยังไม่ได้เชื่อมบัญชี Jod-Jai ครับ\n\nถ้าคุณเป็นเจ้าของบัญชี ให้พิมพ์ “เชื่อมต่อ <รหัส>”\nถ้าเป็นผู้ใช้ที่ได้รับเชิญ ให้พิมพ์ “เข้าร่วม <รหัส>”')];
 try{
  if(event.replyToken)await replyMessages(event.replyToken,notice);
  else await pushMessages(user,notice,`unauthorized:${event.webhookEventId}`);
 }catch(error){console.error('Unauthorized notice failed',event.webhookEventId,error instanceof Error?error.message:'unknown');}
}
export async function POST(request:Request){
 try {
  const raw=await request.text();
  if(Buffer.byteLength(raw)>1_000_000)return new Response('Too large',{status:413});
  if(!validSignature(raw,request.headers.get('x-line-signature')||'',required('LINE_CHANNEL_SECRET')))return new Response('Unauthorized',{status:401});
  let body;try{body=schema.parse(JSON.parse(raw));}catch{return new Response('Invalid event',{status:400});}
  let queued=false;
  for(const original of body.events){
   const user=original.source.userId;
   if(original.source.type!=='user'||!user||!['message','postback','follow'].includes(original.type))continue;
   let event=original as LineEvent;
   // Pairing and invitation are the only pre-queue state changes; their replay-safe
   // RPCs establish authorization, then their welcome response joins the same queue.
   if(event.type==='message'&&event.message?.type==='text'){
    const paired=await tryPairOwner(user,event.message.text||'');
    const joined=!paired&&await tryJoinInvite(user,event.message.text||'');
    if(paired||joined)event={...event,type:'follow',message:undefined};
   }
   const receipt=await accept(event,user);
   if(!receipt?.authorized){await sendUnauthorized(original as LineEvent,user);continue;}
   if(!receipt.inserted)continue;
   queued=true;
   if(receipt.allowed&&event.type==='message'&&event.message?.type==='image'&&receipt.id)await acknowledgeImage(event,receipt.id);
  }
  if(queued)after(async()=>{try{await drainJobs();}catch(error){console.error('Worker wake failed; durable retry will recover',error instanceof Error?error.message:'unknown');}});
  return Response.json({ok:true});
 }catch(error){
  console.error('Webhook acceptance failed',error instanceof Error?error.message:'unknown');
  return new Response('Temporarily unavailable',{status:503});
 }
}
