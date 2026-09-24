import { Draft, displayDate, missingField, money, categories } from './domain';
import type { Message } from './line';
export const text = (value:string):Message => ({type:'text',text:value});
export function data(action:string,d:Draft,field?:string) {
 return new URLSearchParams({action,id:d.id,v:String(d.version),...(field?{field}:{})}).toString();
}
const actionButton=(label:string,value:string,style='secondary')=>({type:'button',style,action:{type:'postback',label,data:value,displayText:label}});
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
 return text(`${summary(d)}\n\n${prompts[field]||prompts.description}\nตอบโดยขึ้นต้นด้วย #${d.short_code} เช่น #${d.short_code} ${field==='amount'?'96.00':field==='date'?'2026-09-23 17:22':field==='category'?'อาหาร':field==='recipient'?'ชื่อร้าน':'ค่าอาหารเย็น'}\nหรือพิมพ์ ยกเลิก #${d.short_code}`);
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
export const help = 'ส่งรูปสลิปเป๋าตัง, MAKE, Bangkok Bank หรือ SCB ได้เลยครับ\nผมจะอ่านข้อมูล ถามรายละเอียดที่ขาด แล้วให้ยืนยันก่อนบันทึก\n\nคำสั่ง: รายการค้าง / สรุปวันนี้ / สรุปเดือนนี้\nตอบรายละเอียด: #รหัสรายการ ค่าอาหาร\nยกเลิกร่าง: ยกเลิก #รหัสรายการ';
