import {after} from 'next/server';
import {z} from 'zod';
import {validSignature} from '@/lib/line';
import {required} from '@/lib/config';
import {isAuthorizedUser,tryPairOwner} from '@/lib/access';
import {db,assertDb} from '@/lib/db';
import {drainJobs} from '@/lib/jobs';
export const runtime='nodejs';
export const maxDuration=300;
const schema=z.object({events:z.array(z.object({
 webhookEventId:z.string().min(1),type:z.string(),timestamp:z.number(),
 source:z.object({type:z.string(),userId:z.string().optional()}),
 message:z.object({id:z.string(),type:z.string(),text:z.string().optional()}).optional(),
 postback:z.object({data:z.string()}).optional(),
})).max(100)});
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
   if(await isAuthorizedUser(user))events.push(e);
   else if(e.type==='message' && e.message?.type==='text' && await tryPairOwner(user,e.message.text||'')){
    // Never persist the one-time pairing code in the job payload.
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
