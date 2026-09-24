import {createHash} from 'node:crypto';
import {db,assertDb} from './db';
import {Draft,normalizeSlip,missingField,parseAnswer,money,displayDate} from './domain';
import {getImage,LineEvent,Message} from './line';
import {recognizeSlip} from './ocr';
import {slipQrHash} from './qr';
import {text,review,editMenu,help} from './messages';

type Change={code:string;draft?:Draft};
function changeResponse(result:Change):Message[]{
 if(result.code==='not_found')return [text('ไม่พบรายการของคุณครับ')];
 const d=result.draft!;
 if(['saved','confirmed'].includes(result.code))return [text(`บันทึกแล้ว ✅ #${d.short_code}\n${d.description}\n${money(d.amount_satang!)} บาท • ${d.category}`)];
 if(result.code==='cancelled')return [text(`ยกเลิกรายการ #${d.short_code} แล้ว ไม่นับในยอดรายจ่ายครับ`)];
 return [...(result.code==='stale'?[text('ข้อมูลมีการแก้ไขแล้ว กรุณาตรวจสรุปล่าสุดก่อนยืนยันครับ')]:[]),review(d)];
}
async function change(event:LineEvent,d:Draft,action:string,patch:Record<string,unknown>={},version=d.version):Promise<Message[]>{
 const {data,error}=await db().rpc('jod_change_draft',{p_event:event.webhookEventId,p_user:event.source.userId,p_id:d.id,p_version:version,p_action:action,p_patch:patch});
 assertDb(error);return changeResponse(data as Change);
}
async function pending(user:string):Promise<Draft[]>{
 const {data,error}=await db().from('jod_drafts').select('*').eq('user_id',user).eq('status','draft').order('created_at',{ascending:false}).limit(20);
 assertDb(error);return data as Draft[];
}
function pendingMessage(rows:Draft[]):Message[]{
 if(!rows.length)return [text('ไม่มีรายการรอการยืนยันครับ ส่งสลิปใหม่ได้เลย')];
 // LINE allows at most five messages per push. Each draft has its own ID and buttons.
 return [text(`รายการรอการยืนยัน ${rows.length}${rows.length===20?'+':''} รายการ\nพิมพ์ #รหัส เพื่อดูรายการ หรือ #รหัส รายละเอียด เพื่อเติมข้อมูล\n`+rows.map(d=>`#${d.short_code} ${d.amount_satang?money(d.amount_satang)+' บาท':'รอระบุยอด'} ${d.description||d.recipient||''}`).join('\n')), ...rows.slice(0,4).map(review)];
}
async function totals(user:string,monthly:boolean):Promise<Message[]>{
 const thaiNow=new Date(Date.now()+7*3600000); const date=thaiNow.toISOString().slice(0,10);
 const from=(monthly?date.slice(0,7)+'-01':date)+'T00:00:00+07:00';
 const until=new Date(Date.UTC(thaiNow.getUTCFullYear(),thaiNow.getUTCMonth(),thaiNow.getUTCDate()+1)-7*3600000).toISOString();
 const {data,error}=await db().rpc('jod_summary',{p_user:user,p_from:from,p_to:until});
 assertDb(error);let total=0,count=0;
 for(const row of data||[]){total+=Number(row.total_satang);count+=Number(row.entries);}
 return [text(`รายจ่าย${monthly?'เดือนนี้':'วันนี้'} (เฉพาะรายการที่ยืนยัน)\n${money(total)} บาท • ${count} รายการ\n`+(data||[]).map((row:{category:string,total_satang:number})=>`${row.category}: ${money(Number(row.total_satang))} บาท`).join('\n'))];
}
async function overview(user:string):Promise<Message[]> {
 const confirmed=await db().from('jod_drafts').select('*').eq('user_id',user).eq('status','confirmed').order('confirmed_at',{ascending:false}).limit(8);
 assertDb(confirmed.error);
 const rows=confirmed.data as Draft[];
 const drafts=await pending(user);
 const recent=rows.length?rows.map(d=>`#${d.short_code} ${money(d.amount_satang!)} บาท • ${d.description || d.recipient || 'ไม่ระบุ'} • ${d.occurred_at?displayDate(d.occurred_at):'ไม่ระบุวันที่'}`).join('\n'):'ยังไม่มีรายการที่ยืนยันแล้ว';
 return [text(`รายรับ/รายจ่าย\nรายรับ: ยังไม่ได้เปิดใช้\nรายจ่ายล่าสุด: ${rows.length} รายการ\nรายการรอยืนยัน: ${drafts.length} รายการ\n\n${recent}`)];
}
function thaiNowIso():string {
 const now = new Date();
 const thai = new Date(now.getTime()+7*3600000);
 return `${thai.toISOString().slice(0,10)}T${thai.toISOString().slice(11,19)}+07:00`;
}
async function startManualExpense(event:LineEvent, detail=''):Promise<Message[]> {
 const user=event.source.userId!;
 const base={
  user_id:user,message_id:`manual:${event.webhookEventId}`,
  image_hash:createHash('sha256').update(`manual:${user}:${event.webhookEventId}`).digest('hex'),
  provider:'manual',occurred_at:thaiNowIso(),category:'อื่น ๆ',edit_field:'amount' as string|null,
 };
 let values:Record<string,unknown>={};
 const match=detail.match(/^([0-9][0-9,]*(?:\.\d{1,2})?)(?:\s*(?:บาท)?\s+(.+))?$/);
 if(match){
  values=parseAnswer('amount',match[1]);
  if(match[2])values={...values,...parseAnswer('description',match[2]),edit_field:null};
  else values={...values,edit_field:'description'};
 }
 const saved=await db().from('jod_drafts').insert({...base,...values}).select('*').single();
 if(saved.error?.code==='23505')return [text('รายการนี้ถูกสร้างไว้แล้วครับ พิมพ์ รายการค้าง เพื่อดูรายการเดิม')];
 assertDb(saved.error);return [text('เริ่มเพิ่มรายจ่ายเองแล้วครับ'),review(saved.data as Draft)];
}
export async function processEvent(event:LineEvent):Promise<Message[]>{
 const user=event.source.userId!;
 const replay=await db().from('jod_mutations').select('result').eq('event_id',event.webhookEventId).maybeSingle();
 assertDb(replay.error);if(replay.data)return changeResponse(replay.data.result as Change);
 if(event.type==='follow')return [text('เชื่อมบัญชี Jod-Jai เรียบร้อยแล้ว ✅\n\n'+help)];
 if(event.type==='message' && event.message?.type==='image'){
  const existing=await db().from('jod_drafts').select('*').eq('user_id',user).eq('message_id',event.message.id).maybeSingle();
  assertDb(existing.error);if(existing.data){const d=existing.data as Draft;return d.status==='draft'?[review(d)]:changeResponse({code:d.status,draft:d});}
  const image=await getImage(event.message.id);const hash=createHash('sha256').update(image).digest('hex');
  const duplicate=await db().from('jod_drafts').select('*').eq('user_id',user).eq('image_hash',hash).neq('status','cancelled').maybeSingle();
  assertDb(duplicate.error);if(duplicate.data){const d=duplicate.data as Draft;return [text(`สลิปนี้มีแล้ว #${d.short_code} จึงไม่สร้างซ้ำครับ`),...(d.status==='draft'?[review(d)]:[])];}
  const qrHash=await slipQrHash(image);
  if(qrHash){
   const qrDuplicate=await db().from('jod_drafts').select('*').eq('user_id',user).eq('qr_hash',qrHash).neq('status','cancelled').maybeSingle();assertDb(qrDuplicate.error);
   if(qrDuplicate.data){const d=qrDuplicate.data as Draft;return [text(`พบ QR สลิปเดิม #${d.short_code} จึงไม่สร้างซ้ำครับ`),...(d.status==='draft'?[review(d)]:[])];}
  }
  const result=await recognizeSlip(image);
  if(result.slip.provider==='unsupported')return [text('ยังระบุแบบสลิปไม่ได้ครับ รองรับเป๋าตัง, MAKE, Bangkok Bank และ SCB กรุณาส่งภาพเต็มที่ชัดเจน')];
  const values=normalizeSlip(result.slip);
  if(values.amount_satang===0)values.amount_satang=null;
  const saved=await db().from('jod_drafts').insert({...values,user_id:user,message_id:event.message.id,image_hash:hash,qr_hash:qrHash}).select('*').single();
  if(saved.error?.code==='23505')return [text('พบสลิปหรือเลขอ้างอิงซ้ำ จึงไม่สร้างรายจ่ายซ้ำครับ พิมพ์ รายการค้าง เพื่อดูรายการเดิม')];
  assertDb(saved.error);return [review(saved.data as Draft)];
 }
 if(event.type==='postback' && event.postback){
  const params=new URLSearchParams(event.postback.data);const id=params.get('id');const action=params.get('action');const version=Number(params.get('v'));
  if(!id||!/^[0-9a-f-]{36}$/i.test(id)||!Number.isInteger(version)||version<1)return [text('ปุ่มนี้ไม่ถูกต้องครับ พิมพ์ รายการค้าง เพื่อดูรายการล่าสุด')];
  const {data,error}=await db().from('jod_drafts').select('*').eq('user_id',user).eq('id',id).maybeSingle();
  assertDb(error);if(!data)return [text('ไม่พบรายการของคุณครับ')];const d=data as Draft;
  if(d.status!=='draft')return changeResponse({code:d.status,draft:d});
  if(d.version!==version)return changeResponse({code:'stale',draft:d});
  if(action==='edit')return [editMenu(d)];
  if(action==='field'){
   const field=params.get('field');if(!['amount','date','recipient','description','category'].includes(field||''))return [text('กรุณาเลือกช่องที่ต้องการแก้ไข')];
   return change(event,d,'patch',{edit_field:field},version);
  }
  if(action==='confirm'||action==='cancel')return change(event,d,action,{},version);
  return [text(help)];
 }
 if(event.type==='message' && event.message?.type==='text'){
  const input=event.message.text?.trim()||'';
  if(['ช่วยเหลือ','help','เริ่ม'].includes(input))return [text(help)];
  if(input==='ส่งสลิป')return [text('ส่งรูปสลิปเข้ามาในแชทนี้ได้เลยครับ ผมจะอ่านข้อมูลจากภาพ แล้วให้ตรวจสอบก่อนบันทึก')];
  if(input==='เพิ่มรายการ'||input.startsWith('เพิ่มรายการ '))return startManualExpense(event,input.replace(/^เพิ่มรายการ\s*/,'').trim());
  if(['ดูรายรับรายจ่าย','ดูรายการ','รายรับรายจ่าย'].includes(input))return overview(user);
  if(input==='สรุปวันนี้')return totals(user,false);
  if(input==='สรุปเดือนนี้')return totals(user,true);
  const rows=await pending(user);
  if(input==='รายการค้าง')return pendingMessage(rows);
  const cancel=input.match(/^ยกเลิก\s+#?([a-f0-9]{10})$/i);
  const addressed=input.match(/^#([a-f0-9]{10})(?:\s+([\s\S]+))?$/i);
  let d:Draft|undefined; let answer=input;
  if(cancel||addressed){
   const code=(cancel?.[1]||addressed?.[1]||'').toUpperCase();
   const found=await db().from('jod_drafts').select('*').eq('user_id',user).eq('short_code',code).maybeSingle();assertDb(found.error);
   d=found.data as Draft|undefined;
   if(!d)return [text('ไม่พบรหัสรายการนี้ครับ')];
   if(d.status!=='draft')return changeResponse({code:d.status,draft:d});
   if(cancel)return change(event,d,'cancel');
   if(!addressed?.[2])return [review(d)];answer=addressed[2];
  } else if(rows.length===1)d=rows[0];
  else return rows.length?pendingMessage(rows):[text(help)];
  const field=d.edit_field||missingField(d);
  if(!field)return [text('รายละเอียดครบแล้วครับ กดยืนยันและบันทึก หรือเลือกแก้ไข'),review(d)];
  let patch:Record<string,unknown>;
  try {patch=parseAnswer(field,answer);} catch(error){return [text((error as Error).message),review(d)];}
  return change(event,d,'patch',{...patch,edit_field:null});
 }
 return [text(help)];
}
