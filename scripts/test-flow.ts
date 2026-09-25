import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {processEvent} from '../lib/bot';
import {db,assertDb} from '../lib/db';
import type {LineEvent,Message} from '../lib/line';
import type {Draft} from '../lib/domain';
process.loadEnvFile('.env.local');
const user='__flow_'+randomUUID();const eventIds:string[]=[];const nativeFetch=globalThis.fetch;
const image=await readFile('example-slip/S__47751175.jpg');
const resized=await sharp(image).resize({width:700}).jpeg({quality:85}).toBuffer();
const oldToken=process.env.LINE_CHANNEL_ACCESS_TOKEN;process.env.LINE_CHANNEL_ACCESS_TOKEN='test-only-not-sent';
globalThis.fetch=async(input,init)=>{
 const url=String(input);
 if(url.startsWith('https://api-data.line.me/'))return new Response(new Uint8Array(url.includes('resized')?resized:image),{headers:{'Content-Type':'image/jpeg'}});
 return nativeFetch(input,init);
};
function event(properties:Partial<LineEvent>):LineEvent{const id=randomUUID();eventIds.push(id);return {webhookEventId:id,type:'message',timestamp:Date.now(),source:{type:'user',userId:user},...properties};}
async function current(){const r=await db().from('jod_drafts').select('*').eq('user_id',user).single();assertDb(r.error);return r.data as Draft;}
function confirmMessage(messages:Message[]):string{
 const flex=messages.find(m=>m.type==='flex') as {contents:{footer:{contents:{action:{data:string}}[]}}}|undefined;
 assert.ok(flex,'Expected final confirmation card');return flex.contents.footer.contents[0].action.data;
}
try{
 const first=await processEvent(event({message:{id:'test-'+randomUUID(),type:'image'}}));
 assert.match(JSON.stringify(first),/รายการนี้เป็นค่าอะไร/);let d=await current();assert.equal(d.status,'draft');assert.equal(d.amount_satang,200000);
 const details=await processEvent(event({message:{id:randomUUID(),type:'text',text:`#${d.short_code} ซื้อของใช้`}}));
 const staleButton=confirmMessage(details);d=await current();assert.equal(d.status,'draft');
 await processEvent(event({type:'postback',postback:{data:new URLSearchParams({action:'field',id:d.id,v:String(d.version),field:'description'}).toString()}}));
 const corrected=await processEvent(event({message:{id:randomUUID(),type:'text',text:`#${d.short_code} ค่าอาหาร`}}));
 const correctButton=confirmMessage(corrected);
 const stale=await processEvent(event({type:'postback',postback:{data:staleButton}}));assert.match(JSON.stringify(stale),/ปุ่มนี้เก่าแล้ว/);assert.equal((await current()).status,'draft');
 const confirmEvent=event({type:'postback',postback:{data:correctButton}});
 const saved=await processEvent(confirmEvent);assert.match(JSON.stringify(saved),/บันทึกแล้ว/);assert.equal((await current()).status,'confirmed');
 await processEvent(confirmEvent);assert.equal((await current()).status,'confirmed');
 const duplicate=await processEvent(event({message:{id:'test-resized-'+randomUUID(),type:'image'}}));assert.match(JSON.stringify(duplicate),/QR สลิปเดิม/);
 const count=await db().from('jod_drafts').select('id',{count:'exact'}).eq('user_id',user);assertDb(count.error);assert.equal(count.count,1);
 const summary=await db().rpc('jod_summary',{p_user:user,p_from:'2026-09-01',p_to:'2026-10-01'});assertDb(summary.error);assert.equal(Number(summary.data[0].total_satang),200000);
 const exported=await processEvent(event({message:{id:randomUUID(),type:'text',text:'ส่งออกข้อมูล'}}));
 const exportUrl=JSON.stringify(exported).match(/https:\/\/[^"\\]+\/api\/export\?token=[a-f0-9]{48}/)?.[0];assert.ok(exportUrl);
 const csv=await nativeFetch(exportUrl);assert.equal(csv.status,200);assert.match(await csv.text(),/ค่าอาหาร/);
 console.log('End-to-end flow passed: real local OCR → draft → details → edit → reject stale confirmation → confirm → replay → resized duplicate → private CSV export. No LINE messages sent.');
}finally{
 globalThis.fetch=nativeFetch;
 if(oldToken===undefined)delete process.env.LINE_CHANNEL_ACCESS_TOKEN;else process.env.LINE_CHANNEL_ACCESS_TOKEN=oldToken;
 const a=await db().from('jod_drafts').delete().eq('user_id',user);assertDb(a.error);
 const exports=await db().from('jod_exports').delete().eq('user_id',user);assertDb(exports.error);
 if(eventIds.length){const b=await db().from('jod_mutations').delete().in('event_id',eventIds);assertDb(b.error);}
 console.log('Temporary flow test records removed.');
}
