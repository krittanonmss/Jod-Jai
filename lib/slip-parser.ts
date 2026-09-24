import type { Slip } from './domain';
const months=['มค','กพ','มีค','เมย','พค','มิย','กค','สค','กย','ตค','พย','ธค'];
const compact=(s:string)=>s.replace(/[\s.]/g,'');
export function parseSlipText(raw:string):Slip {
 const cleaned=raw.replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-0x0e50));
 const lines=cleaned.split('\n').map(s=>s.trim()).filter(Boolean);
 const all=lines.join('\n');
 const provider:Slip['provider']=/SCB/i.test(all)?'scb':/Bangkok\s*Bank/i.test(all)?'bbl':/make|KBank/i.test(all)?'make':/เป๋าตัง|G-Wallet|ถุงเงิน|สิทธิ.*ไทย|ไทยช่วยไทย/.test(all)?'paotang':'unsupported';
 let {date,time}=parseDateLine(all);
 function amountNear(pattern:RegExp):string|null {
  const i=lines.findIndex(x=>pattern.test(compact(x)));
  if(i<0)return null;
  const candidates=[lines[i].replace(pattern,''),...lines.slice(i+1,i+4)];
  for(const line of candidates){
   if(/อ้างอิง|เลขที่|รหัส|ID|xxx|ค่าธรรมเนียม/.test(line))break;
   const m=line.match(/(?:^|\s)(\d[\d,]*\.\d{2})(?=\s|บาท|THB|$)/i)||line.match(/(?:^|\s)(\d[\d,]*)\s*(?:บาท|un|vn|uv)/i);
   if(m)return m[1];
  }
  return null;
 }
 let amount=provider==='paotang'?amountNear(/จำนวนเงินที่ชำระ|จํานวนเงินที่ชําระ/):amountNear(/จำนวนเงิน|จํานวนเงิน|^จำนวน$|^จํานวน$/);
 // MAKE often places the amount on its own line; never use arbitrary numbers or reference codes.
 if(!amount && provider==='make')amount=amountNear(/^จำนวน$|^จํานวน$/);
 const grossAmount=provider==='paotang'?amountNear(/ค่าสินค้า\/บริการ/):null;
 const subsidyMatch=all.match(/[-−]\s*(\d[\d,]*(?:\.\d{2})?)\s*บาท/);
 const fee=amountNear(/ค่าธรรมเนียม/);
 let recipient:string|null=null;
 if(provider==='bbl'){
  const idx=lines.findIndex(x=>/COUNTER|CO\.,|ไปที่/.test(x));
  if(idx>=0){recipient=lines[idx].replace(/^ไปที่\s*/,'').trim()||lines[idx+1]||null;}
 } else {
  const idx=lines.findIndex(x=>/^(ไปยัง|ไปที่)\s*/.test(x));
  if(idx>=0)recipient=lines[idx].replace(/^(ไปยัง|ไปที่)\s*/,'').trim()||lines[idx+1]||null;
 }
 let reference:string|null=null;
 const refPattern=provider==='make'?/เลขที่รายการ\s*[:：]?\s*([a-zA-Z0-9]+)/:/รหัสอ้างอิง\s*[:：]?\s*([a-zA-Z0-9]+)/;
 const refMatch=all.match(refPattern);
 reference=refMatch?.[1]&&refMatch[1].length>=12?refMatch[1]:null;
 if(provider==='bbl')reference=all.match(/เลขที่อ้างอิง\s*\n(?:[^\d\n]*\n)?\s*(\d{15,})/)?.[1]||null;
 const noteMatch=all.match(/(?:บันทึกช่วยจำ|บันทึกช่วยจํา|หมายเหตุ|ข้อความถึงผู้รับ|Note|Memo)\s*[:：]?\s*([^\n]+)/i);
 return {provider,amount,grossAmount,subsidy:provider==='paotang'?subsidyMatch?.[1]||null:null,fee,date,time,recipient,reference,note:noteMatch?.[1]?.trim()||null};
}

export function parseDateLine(raw:string):{date:string|null,time:string|null} {
 const lines=raw.split('\n');
 for(const original of lines){
  const line=original.replace(/[ุู]/g,'');
  const yearMatch=/(25\d{2}|20\d{2})/.exec(line);if(!yearMatch)continue;
  const before=line.slice(0,yearMatch.index);const day=before.match(/^\s*(\d{1,2})(?!\d)/)?.[1];
  if(!day)continue;
  const monthPart=compact(before.replace(/[0-9]/g,'')).replace(/[^ก-๙]/g,'');
  const month=months.findIndex(m=>monthPart.endsWith(m));
  if(month<0)continue;
  const after=line.slice(yearMatch.index+4);const clock=after.match(/(\d{1,2})\s*[:%]\s*(\d{2})/);
  return {date:`${yearMatch[1]}-${String(month+1).padStart(2,'0')}-${day.padStart(2,'0')}`,time:clock?`${clock[1].padStart(2,'0')}:${clock[2]}`:null};
 }
 return {date:null,time:null};
}
