import {after} from 'next/server';
import {z} from 'zod';
import {validSignature} from '@/lib/line';
import {required} from '@/lib/config';
import {isAuthorizedUser,takeRateLimit,tryJoinInvite,tryPairOwner} from '@/lib/access';
import {db,assertDb} from '@/lib/db';
import {drainJobs} from '@/lib/jobs';
import {pushMessages} from '@/lib/line';
import {text} from '@/lib/messages';
import {processEvent} from '@/lib/bot';
import {LineEvent} from '@/lib/line';
export const runtime='nodejs';
export const maxDuration=300;
const schema=z.object({events:z.array(z.object({
 webhookEventId:z.string().min(1),type:z.string(),timestamp:z.number(),
 source:z.object({type:z.string(),userId:z.string().optional()}),
 message:z.object({id:z.string(),type:z.string(),text:z.string().optional()}).optional(),
 postback:z.object({data:z.string()}).optional(),
 })).max(100)});
const INLINE_COMMANDS=new Set(['ช่วยเหลือ','help','เริ่ม','สรุปวันนี้','สรุปเดือนนี้','ดูรายรับรายจ่าย','ดูรายการ','รายรับรายจ่าย','จัดการรายการ','ข้อมูลของฉัน','สถานะระบบ','เชิญเพื่อน','ผู้ใช้งาน','ขอรหัสเชื่อมต่อ','ยืนยันทั้งหมด','ยกเลิกทั้งหมด','ยืนยันหมวด','ยกเลิกหมวด','กู้คืนประวัติ']);
async function processInline(event:LineEvent){
  try{
   const messages=await processEvent(event);
   if(messages.length)await pushMessages(event.source.userId!,messages,`inline-${event.webhookEventId}`);
  }catch(err){
   console.error('Inline process failed',event.webhookEventId,err);
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
    if(await isAuthorizedUser(user)){
     const rl=await takeRateLimit(user);
     const msgText=e.message?.text?.trim();
      if(e.type==='message' && e.message?.type==='text' && msgText && INLINE_COMMANDS.has(msgText)){
      if(rl.allowed)await processInline(e);
     }else if(rl.allowed){
      events.push(e);
     }
     if(rl.count===25){
      pushMessages(user,[text('⚠️ คุณส่งข้อความมากเกินไป (25/30 ต่อนาที) กรุณารอสักครู่นะครับ')],`ratelimit-warn-${user}-${Date.now()}`).catch(()=>{});
     }
    }
    else if(e.type==='message' && e.message?.type==='text' && await tryPairOwner(user,e.message.text||'')){
     events.push({...e,type:'follow',message:undefined});
    } else if(e.type==='message' && e.message?.type==='text' && await tryJoinInvite(user,e.message.text||'')){
     events.push({...e,type:'follow',message:undefined});
    }
   }
   if(events.length){
    const {error}=await db().from('jod_events').upsert(events.map(e=>({event_id:e.webhookEventId,user_id:e.source.userId!,occurred_ms:e.timestamp,payload:e})),{onConflict:'event_id',ignoreDuplicates:true});assertDb(error);
    after(async()=>{try{await drainJobs();}catch{console.error('Worker wake failed; durable retry will recover');}});
   }
   return Response.json({ok:true});
  }catch{return new Response('Temporarily unavailable',{status:503});}
}