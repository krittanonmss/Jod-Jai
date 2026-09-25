import { Draft, displayDate, missingField, money, categories } from './domain';
import type { Message } from './line';
export const text = (value:string):Message => ({type:'text',text:value});
type SummaryRow={category:string;total_satang:number;entries?:number};
type SummaryCardOptions={title:string;period:string;total:number;count:number;rows:SummaryRow[];recent?:Draft[];pending?:number;average?:number};
export function data(action:string,d:Draft,field?:string) {
 return new URLSearchParams({action,id:d.id,v:String(d.version),...(field?{field}:{})}).toString();
}
const quickMessage=(label:string,value=label)=>({type:'action',action:{type:'message',label,text:value}});
const actionButton=(label:string,value:string,style='secondary')=>({type:'button',style,action:{type:'postback',label,data:value,displayText:label}});
const messageButton=(label:string,text:string,style='secondary')=>({type:'button',style,action:{type:'message',label,text}});
const sectionTitle=(value:string)=>({type:'text',text:value,weight:'bold',size:'sm',color:'#126858'});
function row(label:string,value:string,color='#222222'):Record<string,unknown>{return {type:'box',layout:'horizontal',contents:[
 {type:'text',text:label,size:'sm',color:'#55736D',flex:5,wrap:true},
 {type:'text',text:value,size:'sm',color,align:'end',flex:4,wrap:true},
]};}
function empty(value:string):Record<string,unknown>{return {type:'text',text:value,size:'sm',color:'#7C8A86',wrap:true};}
function recentRows(rows:Draft[],limit:number):Record<string,unknown>[] {
 if(!rows.length)return [empty('ยังไม่มีรายการที่ยืนยันแล้ว')];
 return rows.slice(0,limit).map(d=>row(`${d.description||d.recipient||'ไม่ระบุ'} · ${d.category}`,money(d.amount_satang||0)+' บาท','#163D37'));
}
function categoryRows(rows:SummaryRow[],total:number):Record<string,unknown>[] {
 if(!rows.length)return [empty('ยังไม่มีรายการในช่วงนี้')];
 return rows.slice(0,6).map(r=>{
  const pct=total>0?` · ${Math.round(Number(r.total_satang)*100/total)}%`:'';
  return row(`${r.category}${pct}`,money(Number(r.total_satang))+' บาท','#163D37');
 });
}
export function summaryCard(options:SummaryCardOptions):Message {
 const contents:Record<string,unknown>[]=[
  {type:'text',text:options.title,weight:'bold',size:'lg',color:'#126858'},
  {type:'text',text:options.period,size:'xs',color:'#7C8A86'},
  {type:'box',layout:'vertical',backgroundColor:'#F6FBF8',cornerRadius:'md',paddingAll:'14px',spacing:'xs',contents:[
   {type:'text',text:money(options.total)+' บาท',weight:'bold',size:'xxl',color:'#D83E8C'},
   {type:'text',text:`${options.count} รายการที่ยืนยันแล้ว`,size:'xs',color:'#55736D'},
  ]},
 ];
 if(typeof options.pending==='number'||typeof options.average==='number')contents.push({type:'box',layout:'vertical',spacing:'xs',contents:[
  ...(typeof options.pending==='number'?[row('รายการรอยืนยัน',String(options.pending)+' รายการ')]:[]),
  ...(typeof options.average==='number'?[row('เฉลี่ยต่อวัน',money(options.average)+' บาท')]:[]),
 ]});
 contents.push({type:'separator',margin:'md'},sectionTitle('แยกตามหมวด'),...categoryRows(options.rows,options.total));
 if(options.recent){contents.push({type:'separator',margin:'md'},sectionTitle('รายการล่าสุด'),...recentRows(options.recent,options.title.includes('วันนี้')?3:5));}
 return {type:'flex',altText:`${options.title}: ${money(options.total)} บาท`,contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents},footer:{type:'box',layout:'vertical',spacing:'sm',contents:[
  messageButton('เพิ่มรายการ','เพิ่มรายการ','primary'),
  messageButton('รายการค้าง','รายการค้าง'),
 ]}}};
}
export function overviewCard(monthTotal:number,confirmed:Draft[],pendingCount:number,rows:SummaryRow[]):Message {
 const contents:Record<string,unknown>[]=[
  {type:'text',text:'ดูรายรับรายจ่าย',weight:'bold',size:'lg',color:'#126858'},
  {type:'text',text:'ภาพรวมเดือนนี้',size:'xs',color:'#7C8A86'},
  {type:'box',layout:'vertical',backgroundColor:'#FFF6FA',cornerRadius:'md',paddingAll:'14px',spacing:'xs',contents:[
   {type:'text',text:money(monthTotal)+' บาท',weight:'bold',size:'xxl',color:'#D83E8C'},
   {type:'text',text:'รายจ่ายที่ยืนยันแล้วเดือนนี้',size:'xs',color:'#55736D'},
  ]},
  row('รายรับ','ยังไม่ได้เปิดใช้'),row('รายการรอยืนยัน',String(pendingCount)+' รายการ'),
  {type:'separator',margin:'md'},sectionTitle('หมวดเดือนนี้'),...categoryRows(rows,monthTotal),
  {type:'separator',margin:'md'},sectionTitle('รายการล่าสุด'),...recentRows(confirmed,5),
 ];
 return {type:'flex',altText:`ดูรายรับรายจ่าย: เดือนนี้ ${money(monthTotal)} บาท`,contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents},footer:{type:'box',layout:'vertical',spacing:'sm',contents:[
  messageButton('สรุปเดือนนี้','สรุปเดือนนี้','primary'),messageButton('เพิ่มรายการ','เพิ่มรายการ'),messageButton('รายการค้าง','รายการค้าง'),
 ]}}};
}
export function summary(d:Draft):string {
 return `รายการ #${d.short_code}\nยอดจ่าย: ${d.amount_satang ? money(d.amount_satang)+' บาท' : 'อ่านไม่ชัด'}\nวันที่: ${d.occurred_at?displayDate(d.occurred_at):'อ่านไม่ชัด'}\nผู้รับ: ${d.recipient||'อ่านไม่ชัด'}\nรายละเอียด: ${d.description||'ยังไม่ได้ระบุ'}\nหมวด: ${d.category}`+
 (d.subsidy_satang?`\nสิทธิช่วยจ่าย: ${money(d.subsidy_satang)} บาท (ไม่รวมในรายจ่าย)`: '')+
 (d.fee_satang?`\nค่าธรรมเนียมในสลิป: ${money(d.fee_satang)} บาท (แสดงแยกจากยอดจ่าย)`: '');
}
export function question(d:Draft, field:string):Message {
 const prompts:Record<string,string>={
  amount:'อ่านยอดไม่ชัด กรุณาระบุยอดจ่ายจริง เช่น 96.00',
  date:'กรุณาระบุวันที่และเวลา เช่น 2026-09-23 17:22 (เวลาไทย)',
  description:'รายการนี้เป็นค่าอะไรครับ?', recipient:'ระบุชื่อผู้รับเงินครับ',
  category:'เลือกหมวด: '+categories.join(', '),
 };
 const message=text(`${summary(d)}\n\n${prompts[field]||prompts.description}\nตอบได้เลยเมื่อมีรายการค้างรายการเดียว${field==='category'?' หรือเลือกจากปุ่มด้านล่าง':''}\nหากมีหลายรายการ ให้พิมพ์ #${d.short_code} ตามด้วยคำตอบ`);
 if(field==='category')message.quickReply={items:categories.map(category=>quickMessage(category))};
 return message;
}
export function review(d:Draft):Message {
 const field=d.edit_field||missingField(d);
 if(field)return question(d,field);
 return {type:'flex',altText:`ตรวจสอบรายจ่าย ${money(d.amount_satang!)} บาท #${d.short_code}`,contents:{
  type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents:[
   {type:'text',text:'ตรวจสอบก่อนบันทึก',weight:'bold',size:'lg',color:'#126858'},
   {type:'text',text:summary(d),wrap:true,size:'sm'},
   {type:'text',text:'รายการร่าง • ยังไม่นับรวมยอดรายจ่าย',wrap:true,size:'xs',color:'#777777'},
  ]},footer:{type:'box',layout:'vertical',spacing:'sm',contents:[
   actionButton('ยืนยันและบันทึก',data('confirm',d),'primary'),
   actionButton('แก้ไข',data('edit',d)),actionButton('ยกเลิก',data('cancel',d)),
  ]},
 }};
}
export function editMenu(d:Draft):Message {
 return {type:'text',text:`แก้ไขรายการ #${d.short_code}: เลือกข้อมูลที่ต้องการแก้ไข`,quickReply:{items:[
  ['description','รายละเอียด'],['amount','ยอดเงิน'],['date','วันเวลา'],['recipient','ผู้รับ'],['category','หมวดหมู่'],
 ].map(([field,label])=>({type:'action',action:{type:'postback',label,data:data('field',d,field),displayText:label}}))}};
}
export function latestMenu(d:Draft):Message {
 return {type:'flex',altText:`รายการล่าสุด ${money(d.amount_satang||0)} บาท`,contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents:[
  {type:'text',text:'รายการล่าสุด',weight:'bold',size:'lg',color:'#126858'},
  {type:'text',text:summary(d),wrap:true,size:'sm'},
 ]},footer:{type:'box',layout:'vertical',spacing:'sm',contents:[
  actionButton('แก้ไขรายการนี้',data('reopen',d),'primary'),
  actionButton('ลบรายการนี้',data('delete_prompt',d)),
 ]}}};
}
export function deleteRecordConfirm(d:Draft):Message {
 return {type:'flex',altText:'ยืนยันลบรายการล่าสุด',contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents:[
  {type:'text',text:'ลบรายการนี้?',weight:'bold',size:'lg',color:'#D83E8C'},
  {type:'text',text:`${d.description||d.recipient||'ไม่ระบุ'}\n${money(d.amount_satang||0)} บาท`,wrap:true,size:'sm'},
  {type:'text',text:'เมื่อลบแล้ว รายการจะไม่นับในสรุป',wrap:true,size:'xs',color:'#777777'},
 ]},footer:{type:'box',layout:'vertical',spacing:'sm',contents:[
  actionButton('ยืนยันลบ',data('delete_confirmed',d),'primary'),messageButton('ยกเลิก','ดูรายรับรายจ่าย'),
 ]}}};
}
export function clearHistoryConfirm():Message {
 return {type:'flex',altText:'ยืนยันล้างประวัติ Jod-Jai',contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents:[
  {type:'text',text:'ล้างประวัติทั้งหมด?',weight:'bold',size:'lg',color:'#D83E8C'},
  {type:'text',text:'รายการร่าง รายการที่บันทึก และประวัติการทำงานของคุณจะถูกลบ',wrap:true,size:'sm'},
  {type:'text',text:'ดาวน์โหลด CSV ก่อนล้างได้ด้วยคำสั่ง “ส่งออกข้อมูล”',wrap:true,size:'xs',color:'#777777'},
 ]},footer:{type:'box',layout:'vertical',spacing:'sm',contents:[
  {type:'button',style:'primary',color:'#D83E8C',action:{type:'postback',label:'ยืนยันล้างประวัติ',data:'action=clear_history',displayText:'ยืนยันล้างประวัติ'}},
  messageButton('ยกเลิก','ช่วยเหลือ'),
 ]}}};
}
export function exportCard(url:string,count:number):Message {
 return {type:'flex',altText:`ส่งออกข้อมูล ${count} รายการ`,contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents:[
  {type:'text',text:'ไฟล์รายรับรายจ่าย',weight:'bold',size:'lg',color:'#126858'},
  {type:'text',text:`พร้อมดาวน์โหลด ${count} รายการ`,size:'sm'},
  {type:'text',text:'ลิงก์หมดอายุภายใน 10 นาที และเปิดได้เฉพาะผู้ที่มีลิงก์',wrap:true,size:'xs',color:'#777777'},
 ]},footer:{type:'box',layout:'vertical',contents:[{type:'button',style:'primary',action:{type:'uri',label:'ดาวน์โหลด CSV',uri:url}}]}}};
}
export const help = 'ส่งสลิปหรือกด “เพิ่มรายการ” เพื่อเริ่มจดรายจ่าย\nระบบจะให้ตรวจและยืนยันก่อนบันทึกเสมอ\n\nดูข้อมูล: ดูรายรับรายจ่าย / สรุปวันนี้ / สรุปเดือนนี้\nจัดการ: รายการค้าง / แก้รายการล่าสุด / ลบรายการล่าสุด\nข้อมูลส่วนตัว: ส่งออกข้อมูล / ล้างประวัติ';
