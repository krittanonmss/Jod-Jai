import type { Slip } from './domain';
const months=['มค','กพ','มีค','เมย','พค','มิย','กค','สค','กย','ตค','พย','ธค'];
const compact=(s:string)=>s.replace(/[\s.]/g,'');
export function cleanRecipient(raw:string):string|null {
 const lines=raw.split(/\n/).map(s=>s.trim()).filter(Boolean);
 const nameParts:string[]=[];
 for(const line of lines){
  if(/^(?:BillerID|ชื่อบัญชี|ServiceCode|หมายเลข|เลขที่|รหัส|ค่าธรรมเนียม)/i.test(compact(line)))break;
  const part=line.replace(/^(?:ไปยัง|ไปท[ี่ี])\s*/,'').split(/Biller\s*ID|ชื่อ\s*บัญชี|เลข(?:ที่|บัญชี)|รหัส(?:อ้างอิง|รายการ)/i)[0]
   .replace(/^[^a-zA-Zก-ฮ]+/,'').replace(/([ก-๙])\s+(?=[ก-๙])/g,'$1').trim();
  if(!part)continue;
  const letters=(part.match(/[a-zA-Zก-๙]/g)||[]).length;
  const digits=(part.match(/\d/g)||[]).length;
  if(letters<3 || /^x{2,}/i.test(part) || /(?:\d[\d\s-]{5,}|[xX*]{2,}[\d*xX-]+)/.test(part) && digits>=letters){
   if(nameParts.length)break;
   continue;
  }
  if(nameParts.length && !/^\(/.test(line))break;
  nameParts.push(part);
  if(nameParts.length===2)break;
 }
 return nameParts.join(' ').trim()||null;
}
export function parseSlipText(raw:string):Slip {
 const cleaned=raw.replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-0x0e50))
  .replace(/จ[ํำา]นวน/g,'จำนวน').replace(/ช[ํำา]ระ/g,'ชำระ').replace(/บันทึกช่วยจ[ํำา]/g,'บันทึกช่วยจำ');
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
   const m=line.match(/^\s*([1-9]\d{0,9}(?:,\d{3})*\.\d{2})(?!\d)/)||line.match(/(?:^|\s)(\d[\d,]*)\s*(?:บาท|un|vn|uv)/i);
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
  let idx=lines.findIndex(x=>/^(?:ไปยัง|ไปท[ี่ี])/.test(x));
  if(idx<0)idx=lines.findIndex(x=>/COUNTER|CO\.,/i.test(x));
  if(idx>=0)recipient=cleanRecipient(lines.slice(idx,idx+5).join('\n'));
 } else {
  const idx=lines.findIndex(x=>/^(ไปยัง|ไปที่)\s*/.test(x));
  if(idx>=0)recipient=cleanRecipient(lines.slice(idx,idx+4).join('\n'));
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
 const normalized=raw.replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-0x0e50))
  .replace(/[Oo]/g,'0').replace(/[Il|]/g,'1')
  .replace(/(\d)\s*[*'’]\s*(\d)(?=\s*[ก-๙])/g,'$1$2');
 const lines=normalized.split('\n');
 for(const original of lines){
  const line=original.replace(/[ุู]/g,' ');
  const numeric=line.match(/(?:^|\D)(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*((?:25|20)?\d{2})(?!\d)/);
  const clock=line.match(/(?:^|\D)([01]?\d|2[0-3])\s*[:.% ;]\s*([0-5]\d)(?!\d)/);
  if(numeric && !/\d/.test(line.slice(0,numeric.index))){
   let year=Number(numeric[3]);if(year<100)year+=year>=40?2500:2000;
   const month=Number(numeric[2]),day=Number(numeric[1]);
   const gregorianYear=year>=2400?year-543:year;
   const valid=new Date(Date.UTC(gregorianYear,month-1,day));
   if(month>=1&&month<=12&&valid.getUTCFullYear()===gregorianYear&&valid.getUTCMonth()===month-1&&valid.getUTCDate()===day)
    return {date:`${year}-${numeric[2].padStart(2,'0')}-${numeric[1].padStart(2,'0')}`,time:clock?`${clock[1].padStart(2,'0')}:${clock[2]}`:null};
  }
  let yearMatch=/(25\d{2}|20\d{2})/.exec(line);
  if(!yearMatch)yearMatch=[...line.matchAll(/(?<!\d)(\d{2})(?!\d)/g)].find(match=>Number(match[1])>=40)||null;
  if(!yearMatch)continue;
  let year=Number(yearMatch[1]);if(year<100)year+=year>=40?2500:2000;
  const before=line.slice(0,yearMatch.index);const day=[...before.matchAll(/(?:^|\D)(\d{1,2})(?!\d)/g)].map(match=>match[1]).find(value=>Number(value)>=1&&Number(value)<=31);
  if(!day)continue;
  const monthPart=compact(before.replace(/[0-9]/g,'')).replace(/[^ก-๙]/g,'');
  let month=months.findIndex(m=>monthPart.endsWith(m));
  if(month<0 && /กย[ก-๙]?$/.test(monthPart))month=8;
  // Thai ก.ย. is often transcribed as Latin n.9. or n.u. at chat-image size.
  if(month<0 && /\bn\s*\.\s*[89u]\b/i.test(before))month=8;
  if(month<0)continue;
  return {date:`${year}-${String(month+1).padStart(2,'0')}-${day.padStart(2,'0')}`,time:clock?`${clock[1].padStart(2,'0')}:${clock[2]}`:null};
 }
 return {date:null,time:null};
}
