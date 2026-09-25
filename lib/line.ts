import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { required } from './config';
export type LineEvent = {
 webhookEventId: string; type: string; timestamp: number;
 source: { type: string; userId?: string }; replyToken?: string;
 message?: { id: string; type: string; text?: string; quotedMessageId?: string };
 postback?: { data: string };
};
export type Message = { type: string; [key: string]: unknown };
export type LineErrorKind='invalid_payload'|'expired_reply_token'|'auth_or_config'|'rate_or_quota'|'timeout_or_network'|'remote_failure';
export class LineDeliveryError extends Error {
 constructor(public readonly kind:LineErrorKind,message:string){super(message);this.name='LineDeliveryError';}
}
function lineError(status:number,detail:string,reply=false):LineDeliveryError{
 const lower=detail.toLowerCase();
 if(status===400&&reply&&lower.includes('invalid reply token'))return new LineDeliveryError('expired_reply_token',`LINE reply HTTP 400: ${detail}`);
 if(status===400&&lower.includes('authentication failed'))return new LineDeliveryError('auth_or_config',`LINE HTTP 400: ${detail}`);
 if(status===400)return new LineDeliveryError('invalid_payload',`LINE ${reply?'reply':'push'} HTTP 400: ${detail}`);
 if(status===401||status===403)return new LineDeliveryError('auth_or_config',`LINE HTTP ${status}: ${detail}`);
 if(status===429)return new LineDeliveryError('rate_or_quota',`LINE HTTP 429: ${detail}`);
 return new LineDeliveryError('remote_failure',`LINE HTTP ${status}: ${detail||lower}`);
}
function transportError(error:unknown):never{
 if(error instanceof LineDeliveryError)throw error;
 if(error instanceof DOMException&&error.name==='TimeoutError')throw new LineDeliveryError('timeout_or_network','LINE request timed out; remote acceptance is unknown');
 throw error;
}
export function validSignature(raw: string, signature: string, secret: string): boolean {
 const expected = createHmac('sha256', secret).update(raw).digest('base64');
 const actual = Buffer.from(signature); const wanted = Buffer.from(expected);
 return actual.length === wanted.length && timingSafeEqual(actual,wanted);
}
function retryUuid(key:string):string {
 const hex=createHash('sha256').update(key).digest('hex').slice(0,32);
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-${(8+Number.parseInt(hex[16],16)%4).toString(16)}${hex.slice(17,20)}-${hex.slice(20)}`;
}
export function fallbackMessages(messages:Message[]):Message[]{
 const result:Message[]=[];
 for(const message of messages){
  if(message.type==='text'&&typeof message.text==='string')result.push(message);
  else if(message.type==='flex'&&typeof message.altText==='string')result.push({type:'text',text:message.altText});
 }
 return result.length?result:[{type:'text',text:'บันทึกผลการทำรายการแล้ว แต่แสดงรายละเอียดไม่สำเร็จ กรุณาลองเปิดรายการล่าสุดอีกครั้งครับ'}];
}
export async function pushMessages(to: string, messages: Message[], retryKey: string) {
 let response:Response;
 try {response=await fetch('https://api.line.me/v2/bot/message/push', {
  method:'POST', headers:{Authorization:`Bearer ${required('LINE_CHANNEL_ACCESS_TOKEN')}`,'Content-Type':'application/json','X-Line-Retry-Key':retryUuid(retryKey)},
  body:JSON.stringify({to,messages}),signal:AbortSignal.timeout(15000),
 });}catch(error){transportError(error);}
 if (!response.ok && !(response.status===409 && response.headers.has('x-line-accepted-request-id'))) throw lineError(response.status,(await response.text()).slice(0,200));
}
export async function replyMessages(replyToken: string, messages: Message[]) {
 let response:Response;
 try {response=await fetch('https://api.line.me/v2/bot/message/reply', {
  method:'POST', headers:{Authorization:`Bearer ${required('LINE_CHANNEL_ACCESS_TOKEN')}`,'Content-Type':'application/json'},
  body:JSON.stringify({replyToken,messages}),signal:AbortSignal.timeout(10000),
 });}catch(error){transportError(error);}
 if (!response.ok) throw lineError(response.status,(await response.text()).slice(0,200),true);
}
export async function getImage(messageId: string): Promise<Buffer> {
 const response = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`,{
  headers:{Authorization:`Bearer ${required('LINE_CHANNEL_ACCESS_TOKEN')}`},signal:AbortSignal.timeout(20000),
 });
 if (!response.ok) throw new Error(`LINE image HTTP ${response.status}`);
 if (!response.headers.get('content-type')?.startsWith('image/')) throw new Error('Unsupported image');
 const limit=12*1024*1024; let size=0; const chunks:Uint8Array[]=[];
 if (!response.body) throw new Error('Empty image');
 const reader=response.body.getReader();
 while (true) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>limit){await reader.cancel();throw new Error('Image too large');} chunks.push(value); }
 return Buffer.concat(chunks);
}
export async function getMessageQuota():Promise<{usage:number;limit:string}>{
 const headers={Authorization:`Bearer ${required('LINE_CHANNEL_ACCESS_TOKEN')}`};
 const [quota,usage]=await Promise.all([
  fetch('https://api.line.me/v2/bot/message/quota',{headers,signal:AbortSignal.timeout(10000)}),
  fetch('https://api.line.me/v2/bot/message/quota/consumption',{headers,signal:AbortSignal.timeout(10000)}),
 ]);
 if(!quota.ok||!usage.ok)throw new Error('LINE quota unavailable');
 const q=await quota.json() as {type:string;value?:number};const u=await usage.json() as {totalUsage:number};
 return {usage:u.totalUsage,limit:q.type==='limited'?String(q.value):q.type};
}
