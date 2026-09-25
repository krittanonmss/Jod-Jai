import {after} from 'next/server';
import {z} from 'zod';
import {LineEvent,pushMessages,replyMessages,validSignature} from '@/lib/line';
import {required} from '@/lib/config';
import {authorizeAndRate,tryJoinInvite,tryPairOwner} from '@/lib/access';
import {db,assertDb} from '@/lib/db';
import {drainJobs} from '@/lib/jobs';
import {text} from '@/lib/messages';
import {processEvent} from '@/lib/bot';
export const runtime='nodejs';
export const maxDuration=300;
const schema=z.object({events:z.array(z.object({
 webhookEventId:z.string().min(1),type:z.string(),timestamp:z.number(),
 replyToken:z.string().optional(),
 source:z.object({type:z.string(),userId:z.string().optional()}),
 message:z.object({id:z.string(),type:z.string(),text:z.string().optional()}).optional(),
 postback:z.object({data:z.string()}).optional(),
 })).max(100)});
async function processInline(event:LineEvent):Promise<boolean>{
  try{
   const messages=await processEvent(event);
   if(messages.length){
    if(event.replyToken)await replyMessages(event.replyToken,messages);
    else await pushMessages(event.source.userId!,messages,`inline-${event.webhookEventId}`);
   }
   return true;
  }catch(err){
   console.error('Inline process failed',event.webhookEventId,err);
   return false;
  }
}
export async function POST(request:Request){
  try {
   const raw=await request.text();
   if(Buffer.byteLength(raw)>1_000_000)return new Response('Too large',{status:413});
   if(!validSignature(raw,request.headers.get('x-line-signature')||'',required('LINE_CHANNEL_SECRET')))return new Response('Unauthorized',{status:401});
   let body;try{body=schema.parse(JSON.parse(raw));}catch{return new Response('Invalid event',{status:400});}
   const events:typeof body.events=[];
   for(const e of body.events){
    const user=e.source.userId;
    if(e.source.type!=='user'||!user||!['message','postback','follow'].includes(e.type))continue;
    const rl=await authorizeAndRate(user);
    if(rl.authorized){
     const msgText=e.message?.text?.trim();
     if(e.type==='message' && e.message?.type==='image'){
      if(rl.allowed){
       if(e.replyToken)await replyMessages(e.replyToken,[text('รับรูปแล้ว กำลังอ่านสลิป...')]).catch(err=>console.error('Slip ack failed',e.webhookEventId,err));
       events.push(e);
      }
     }else if(e.type==='message' && e.message?.type==='text' && msgText){
      if(rl.allowed && !await processInline(e))events.push(e);
     }else if(e.type==='postback'){
      if(rl.allowed && !await processInline(e))events.push(e);
     }else if(rl.allowed){
      events.push(e);
     }
     if(rl.count===25){
      pushMessages(user,[text('⚠️ คุณส่งข้อความมากเกินไป (25/30 ต่อนาที) กรุณารอสักครู่นะครับ')],`ratelimit-warn-${user}-${Date.now()}`).catch(()=>{});
     }
    }
    else if(e.type==='message' && e.message?.type==='text' && await tryPairOwner(user,e.message.text||'')){
     const paired={...e,type:'follow',message:undefined} as LineEvent;
     if(!await processInline(paired))events.push(paired);
    } else if(e.type==='message' && e.message?.type==='text' && await tryJoinInvite(user,e.message.text||'')){
     const joined={...e,type:'follow',message:undefined} as LineEvent;
     if(!await processInline(joined))events.push(joined);
    } else if(e.type==='message' && e.message?.type==='text'){
     const notice=[text('ยังไม่ได้เชื่อมบัญชี Jod-Jai ครับ\n\nถ้าคุณเป็นเจ้าของบัญชี ให้พิมพ์ “เชื่อมต่อ <รหัส>”\nถ้าเป็นผู้ใช้ที่ได้รับเชิญ ให้พิมพ์ “เข้าร่วม <รหัส>”')];
     const send=e.replyToken?replyMessages(e.replyToken,notice):pushMessages(user,notice,`unauthorized-${e.webhookEventId}`);
     await send.catch(err=>console.error('Unauthorized notice failed',e.webhookEventId,err));
     }
   }
   if(events.length){
    const {error}=await db().from('jod_events').upsert(events.map(e=>({event_id:e.webhookEventId,user_id:e.source.userId!,occurred_ms:e.timestamp,payload:e})),{onConflict:'event_id',ignoreDuplicates:true});assertDb(error);
    after(async()=>{try{await drainJobs();}catch{console.error('Worker wake failed; durable retry will recover');}});
   }
   return Response.json({ok:true});
  }catch{return new Response('Temporarily unavailable',{status:503});}
}
