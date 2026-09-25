import { Draft, displayDate, missingField, getMissingFields, money, categories } from './domain';
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
function empty(value:string, cta?:{label:string,text:string}):Record<string,unknown>{
  if(cta){
    return {type:'box',layout:'vertical' as const,spacing:'sm' as const,contents:[
      {type:'text',text:value,size:'sm',color:'#7C8A86',wrap:true},
      {type:'button',style:'primary' as const,action:{type:'message',label:cta.label,text:cta.text}}
    ]};
  }
  return {type:'text',text:value,size:'sm',color:'#7C8A86',wrap:true};
}
function recentRows(rows:Draft[],limit:number):Record<string,unknown>[] {
  if(!rows.length)return [empty('ยังไม่มีรายการที่ยืนยันแล้ว',{label:'เพิ่มรายการแรก',text:'เพิ่มรายการ'})];
  return rows.slice(0,limit).map(d=>row(`${d.description||d.recipient||'ไม่ระบุ'} · ${d.category}`,money(d.amount_satang||0)+' บาท','#163D37'));
}
function categoryRows(rows:SummaryRow[],total:number):Record<string,unknown>[] {
  if(!rows.length)return [empty('ยังไม่มีรายการในช่วงนี้',{label:'เริ่มจดรายจ่าย',text:'เพิ่มรายการ'})];
  return rows.slice(0,6).map(r=>{
    const pct=total>0?Math.round(Number(r.total_satang)*100/total):0;
    const barWidth=Math.max(4,Math.round(pct/100*100));
    return {
      type:'box',layout:'vertical' as const,spacing:'xs' as const,contents:[
        row(`${r.category} · ${pct}%`,money(Number(r.total_satang))+' บาท','#163D37'),
        {type:'box',layout:'horizontal' as const,contents:[
          {type:'box',layout:'horizontal' as const,width:`${barWidth}%`,backgroundColor:'#126858',cornerRadius:'sm' as const,height:'6px'},
          {type:'box',layout:'horizontal' as const,flex:1}
        ]}
      ]
    };
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
 return `ยอดจ่าย: ${d.amount_satang ? money(d.amount_satang)+' บาท' : 'อ่านไม่ชัด'}\nวันที่: ${d.occurred_at?displayDate(d.occurred_at):'อ่านไม่ชัด'}\nผู้รับ: ${d.recipient||'อ่านไม่ชัด'}\nรายละเอียด: ${d.description||'ยังไม่ได้ระบุ'}\nหมวด: ${d.category}`+
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
  const missing = getMissingFields(d);
  const currentStep = missing.indexOf(field) + 1;
  const totalSteps = missing.length;
  const progress = totalSteps > 1 ? `\n📍 ขั้นตอน ${currentStep}/${totalSteps}` : '';
  const message=text(`${summary(d)}\n\n${prompts[field]||prompts.description}${progress}\nตอบได้เลยเมื่อมีรายการค้างรายการเดียว${field==='category'?' หรือเลือกจากปุ่มด้านล่าง':''}\nหากมีหลายรายการ ให้เปิด “รายการค้าง” แล้วตอบโดยขึ้นต้นด้วยหมายเลขรายการ`);
  if(field==='category')message.quickReply={items:categories.map(category=>quickMessage(category))};
  return message;
}
export function review(d:Draft):Message {
  const field=d.edit_field||missingField(d);
  if(field)return question(d,field);
  return {type:'flex',altText:`ตรวจสอบรายจ่าย ${money(d.amount_satang!)} บาท`,contents:{
   type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents:[
    {type:'text',text:'ตรวจสอบก่อนบันทึก',weight:'bold',size:'lg',color:'#126858'},
    {type:'text',text:summary(d),wrap:true,size:'sm'},
    {type:'text',text:'รายการร่าง • ยังไม่นับรวมยอดรายจ่าย',wrap:true,size:'xs',color:'#777777'},
    {type:'text',text:`เวอร์ชัน ${d.version} • ปุ่มเก่าจะไม่ทำงานหลังแก้ไข`,wrap:true,size:'xs',color:'#D83E8C'},
   ]},footer:{type:'box',layout:'vertical',spacing:'sm',contents:[
    actionButton('ยืนยันและบันทึก',data('confirm',d),'primary'),
    actionButton('แก้ไข',data('edit',d)),actionButton('ยกเลิก',data('cancel',d)),
   ]},
  }};
}
export function editMenu(d:Draft):Message {
 return {type:'text',text:'เลือกข้อมูลที่ต้องการแก้ไข',quickReply:{items:[
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
    {type:'text',text:'รายการร่าง รายการที่บันทึก และประวัติการทำงานของคุณจะถูกลบ (กู้คืนได้ภายใน 7 วัน)',wrap:true,size:'sm'},
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
export function pendingCarousel(rows:Draft[]):Message {
  const bubbles = rows.slice(0,10).map((d) => ({
    type:'bubble' as const,
    body:{
      type:'box' as const, layout:'vertical' as const, spacing:'md' as const, contents:[
        {type:'text' as const, text:`#${d.short_code}`, weight:'bold' as const, size:'sm' as const, color:'#126858'},
        {type:'text' as const, text:`${d.amount_satang ? money(d.amount_satang)+' บาท' : 'รอระบุยอด'} • ${d.category}`, size:'sm' as const, color:'#163D37'},
        {type:'text' as const, text:d.description || d.recipient || 'รอรายละเอียด', wrap:true, size:'sm' as const, color:'#222222'},
        {type:'text' as const, text:d.occurred_at ? `📅 ${displayDate(d.occurred_at)}` : '⏰ รอระบุวันเวลา', size:'xs' as const, color:'#7C8A86'},
        {type:'text' as const, text:`เวอร์ชัน ${d.version}`, size:'xs' as const, color:'#D83E8C'},
      ]
    },
    footer:{
      type:'box' as const, layout:'vertical' as const, spacing:'sm' as const, contents:[
        actionButton('ยืนยัน', data('confirm', d), 'primary'),
        actionButton('แก้ไข', data('edit', d)),
        actionButton('ยกเลิก', data('cancel', d)),
      ]
    }
  }));
  return {
    type:'flex',
    altText:`รายการรอการยืนยัน ${rows.length} รายการ`,
    contents:{type:'carousel', contents:bubbles}
  };
}
export function managementMenu():Message {
  return {type:'text',text:'ต้องการจัดการรายการแบบไหนครับ?',quickReply:{items:[
    quickMessage('รายการค้าง'),quickMessage('รายการล่าสุด'),quickMessage('แก้รายการล่าสุด'),quickMessage('ลบรายการล่าสุด'),
    quickMessage('ยืนยันทั้งหมด'),quickMessage('ยกเลิกทั้งหมด'),
  ]}};
}
export function personalDataMenu():Message {
  return {type:'text',text:'เลือกจัดการข้อมูลหรือดูวิธีใช้ได้เลยครับ',quickReply:{items:[
    quickMessage('ส่งออกข้อมูล'),quickMessage('ล้างประวัติ'),quickMessage('กู้คืนประวัติ'),quickMessage('สถานะระบบ'),quickMessage('เชิญเพื่อน'),quickMessage('ผู้ใช้งาน'),quickMessage('ขอรหัสเชื่อมต่อ'),quickMessage('ช่วยเหลือ'),
  ]}};
}
export const help = 'ส่งสลิปหรือกด “เพิ่มรายการ” เพื่อเริ่มจดรายจ่าย\nระบบจะให้ตรวจและยืนยันก่อนบันทึกเสมอ\n\nดูข้อมูล: ดูรายรับรายจ่าย / สรุปวันนี้ / สรุปเดือนนี้\nจัดการ: รายการค้าง / แก้รายการล่าสุด / ลบรายการล่าสุด / ยืนยันทั้งหมด / ยกเลิกทั้งหมด / ยืนยันหมวด <หมวด> / ยกเลิกหมวด <หมวด>\nข้อมูลส่วนตัว: ส่งออกข้อมูล / ล้างประวัติ / กู้คืนประวัติ\nเจ้าของระบบ: สถานะระบบ / เชิญเพื่อน / ผู้ใช้งาน / ขอรหัสเชื่อมต่อ\n\nข้อจำกัด: รูปสลิปต้องไม่เกิน 12 MB ส่งครบ 30 ข้อความ/นาทีจะถูกจำกัดชั่วคราว';
