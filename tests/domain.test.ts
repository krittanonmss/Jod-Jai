import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {satang,thaiDate,normalizeSlip,normalizeMerchant,parseAnswer,parseMissingAnswers,missingField,Draft,parsePendingSelection} from '../lib/domain';
import {parseSlipText,parseDateLine,cleanRecipient} from '../lib/slip-parser';
import {validSignature,fallbackMessages,LineDeliveryError} from '../lib/line';
import {review,summaryCard,overviewCard,clearHistoryConfirm,deleteRecordConfirm,exportCard,managementMenu,moreMenu,personalDataMenu} from '../lib/messages';
import {allowedUser} from '../lib/config';
test('money uses integer satang, rejects negatives and ambiguous decimals',()=>{
 assert.equal(satang('2,000.05'),200005);assert.equal(satang('0.29'),29);
 assert.equal(satang('-33'),null);assert.equal(satang('96.001'),null);assert.equal(satang('abc'),null);
});
test('Buddhist year, Thai timezone, invalid calendar dates',()=>{
 assert.equal(thaiDate('2569-09-23','17:22'),'2026-09-23T10:22:00.000Z');
 assert.equal(thaiDate('2026-02-30','12:00'),null);assert.equal(thaiDate('2026-09-23','25:00'),null);
});
test('date parsing never mistakes a decimal fee for time',()=>{
 assert.deepEqual(parseDateLine('ค่าธรรมเนียม 0.00 บาท'),{date:null,time:null});
 assert.deepEqual(parseDateLine('23 ก.ย. 2569,17:22'),{date:'2569-09-23',time:'17:22'});
 assert.deepEqual(parseDateLine('22 กูย. 2569 19:43 น.'),{date:'2569-09-22',time:'19:43'});
});
test('date parsing tolerates labels, numeric dates, short Buddhist years and OCR separators',()=>{
 assert.deepEqual(parseDateLine('วันที่ 23 ก.ย. 69 เวลา 17.22 น.'),{date:'2569-09-23',time:'17:22'});
 assert.deepEqual(parseDateLine('ทำรายการ 23/09/2569 - 17;22'),{date:'2569-09-23',time:'17:22'});
 assert.deepEqual(parseDateLine('23-09-2026 7.05'),{date:'2026-09-23',time:'07:05'});
});
test('compressed slip dates reject impossible months and tolerate observed September OCR',()=>{
 assert.deepEqual(parseDateLine('25.0. 2569 19:59'),{date:null,time:null});
 assert.deepEqual(parseDateLine('25 n.9. 2569 19:59'),{date:'2569-09-25',time:'19:59'});
 assert.deepEqual(parseDateLine('01 ก.ุยข. 2569 - 21:19'),{date:'2569-09-01',time:'21:19'});
});
test('Bangkok Bank amount and recipient parsing ignore OCR suffixes and account IDs',()=>{
 const slip=parseSlipText('Bangkok Bank\nจำนวนเงิน\n533.93าท๒ธ\nไปที่\nTRUEAPP\nService Code: TRUEAPP\nหมายเลขทำรายการ\n20260916093854930575');
 assert.equal(slip.amount,'533.93');assert.equal(slip.recipient,'TRUEAPP');
 assert.equal(cleanRecipient('ไปที่\nBiller ID: 010753600000000'),null);
 assert.equal(cleanRecipient('ไปที่\nร้าน ABC\nxxx-xxx061'),'ร้าน ABC');
 assert.equal(cleanRecipient('ไปยัง\nG-Wallet ID: *** จ9998+* 2675\nศักดิ์ศรีร้านทอง'), 'ศักดิ์ศรีร้านทอง');
});
test('Paotang records net paid and preserves subsidy separately',()=>{
 const s=parseSlipText('เป๋าตัง\n22 ก.ย. 2569 19:43\nค่าสินค้า/บริการ\n55 บาท\nสิทธิไทยช่วยไทยพลัส\n-33 บาท\nจำนวนเงินที่ชำระ\n22 บาท\nหมายเหตุ: ค่าอาหารเย็น');
 const d=normalizeSlip(s);assert.equal(d.amount_satang,2200);assert.equal(d.gross_satang,5500);assert.equal(d.subsidy_satang,3300);
 assert.equal(d.description,'ค่าอาหารเย็น');assert.equal(d.category,'อาหาร');
});
test('common Thai OCR combining-mark errors are normalized',()=>{
 const s=parseSlipText('เป๋าตัง\n22 ก.ย. 2569 19:43\nจานวนเงินที่ชาระ\n22 บาท\nบันทึกช่วยจา: ค่าอาหาร');
 assert.equal(s.amount,'22');assert.equal(s.note,'ค่าอาหาร');
});
test('does not infer purpose from merchant or invent an unreadable amount',()=>{
 const d=normalizeSlip(parseSlipText('Bangkok Bank\nCOUNTER SERVICE\nเลขที่อ้างอิง 2026092317223024002815108'));
 assert.equal(d.description,null);assert.equal(d.amount_satang,null);
});
test('LINE signature checks exact raw body and rejects missing/altered signatures',()=>{
 const raw='{"events":[]}';const signature=createHmac('sha256','secret').update(raw).digest('base64');
 assert.ok(validSignature(raw,signature,'secret'));assert.equal(validSignature(raw+' ',signature,'secret'),false);assert.equal(validSignature(raw,'','secret'),false);
});
test('invalid Flex can fall back to its persisted user-visible summary',()=>{
 assert.deepEqual(fallbackMessages([{type:'flex',altText:'บันทึกแล้ว 96.00 บาท'}]),[{type:'text',text:'บันทึกแล้ว 96.00 บาท'}]);
 assert.deepEqual(fallbackMessages([{type:'image',originalContentUrl:'x'}]),[{type:'text',text:'บันทึกผลการทำรายการแล้ว แต่แสดงรายละเอียดไม่สำเร็จ กรุณาลองเปิดรายการล่าสุดอีกครั้งครับ'}]);
});
test('LINE delivery errors retain actionable retry classifications',()=>{
 assert.equal(new LineDeliveryError('auth_or_config','bad token').kind,'auth_or_config');
 assert.equal(new LineDeliveryError('timeout_or_network','unknown acceptance').kind,'timeout_or_network');
});
test('no configured LINE owner denies access',()=>{
 const original=process.env.LINE_ALLOWED_USER_IDS;process.env.LINE_ALLOWED_USER_IDS='';assert.equal(allowedUser('U1'),false);
 process.env.LINE_ALLOWED_USER_IDS='U1,U2';assert.ok(allowedUser('U1'));assert.equal(allowedUser('U3'),false);
 if(original===undefined)delete process.env.LINE_ALLOWED_USER_IDS;else process.env.LINE_ALLOWED_USER_IDS=original;
});
const draft={id:'07e061ac-f717-4297-a838-ffab91e24e33',short_code:'ABCDE12345',version:4,amount_satang:9600,occurred_at:'2026-09-23T10:22:00Z',description:'ค่าอาหาร',category:'อาหาร',recipient:'ร้านค้า',edit_field:null} as Draft;
test('three-field draft exposes confirmation while description remains optional',()=>{
 const serialized=JSON.stringify(review(draft));assert.match(serialized,/ยืนยันและบันทึก/);assert.match(serialized,/v=4/);
 assert.equal(missingField({...draft,description:null}),null);assert.equal(review({...draft,description:null}).type,'flex');
 assert.equal(missingField({...draft,recipient:null}),'recipient');assert.equal(review({...draft,recipient:null}).type,'text');
 assert.equal(review({...draft,edit_field:'amount'}).type,'text');
});
test('summary and overview use compact flex messages',()=>{
 const summary=summaryCard({title:'สรุปวันนี้',period:'2026-09-25',total:15000,count:2,rows:[{category:'อาหาร',total_satang:12000},{category:'เดินทาง',total_satang:3000}],recent:[draft]});
 assert.equal(summary.type,'flex');assert.match(JSON.stringify(summary),/สรุปวันนี้/);assert.match(JSON.stringify(summary),/เพิ่มรายการ/);
 const overview=overviewCard(9600,[draft],1,[{category:'อาหาร',total_satang:9600}]);
 assert.equal(overview.type,'flex');assert.match(String(overview.altText),/ดูรายจ่าย/);assert.match(JSON.stringify(overview),/รายการรอยืนยัน/);
 for(const message of [summary,overview]){
  const visit=(node:unknown):void=>{
   if(!node||typeof node!=='object')return;
   const item=node as Record<string,unknown>;
   if(item.type==='box')assert.ok(Array.isArray(item.contents)&&item.contents.length>0,'LINE Flex boxes need non-empty contents');
   for(const value of Object.values(item)){
    if(Array.isArray(value))value.forEach(visit);
    else if(value&&typeof value==='object')visit(value);
   }
  };
  visit(message);
 }
});
test('destructive actions require explicit Flex confirmation and exports expire visibly',()=>{
 assert.match(JSON.stringify(clearHistoryConfirm()),/action=clear_history/);
 assert.match(JSON.stringify(deleteRecordConfirm(draft)),/delete_confirmed/);
 const exported=exportCard('https://example.test/api/export?token=abc',3);
 assert.match(JSON.stringify(exported),/10 นาที/);assert.match(JSON.stringify(exported),/ดาวน์โหลด CSV/);
});
test('rich menu groups expose current record and data controls',()=>{
 const more=JSON.stringify(moreMenu());for(const command of ['รายการค้าง','สรุปวันนี้','สรุปเดือนนี้','จัดการรายการ','ข้อมูลของฉัน'])assert.match(more,new RegExp(command));
 const records=JSON.stringify(managementMenu());assert.match(records,/แก้รายการล่าสุด/);assert.match(records,/ลบรายการล่าสุด/);
 const data=JSON.stringify(personalDataMenu());assert.match(data,/ส่งออกข้อมูล/);assert.match(data,/ล้างประวัติ/);
});
test('editing preserves validation and allows categorization',()=>{
 assert.deepEqual(parseAnswer('amount','22.50 บาท'),{amount_satang:2250});
 assert.deepEqual(parseAnswer('description','ค่าข้าว'),{description:'ค่าข้าว',category:'อาหาร'});
 assert.throws(()=>parseAnswer('amount','0'));assert.throws(()=>parseAnswer('date','yesterday'));assert.throws(()=>parseAnswer('category','wrong'));
});
test('missing OCR fields accept one comma-separated correction',()=>{
 assert.deepEqual(parseMissingAnswers(['amount','date','recipient'],'99.00, 2026-09-26 19:30, ร้านทดสอบ'),{amount_satang:9900,occurred_at:'2026-09-26T12:30:00.000Z',recipient:'ร้านทดสอบ'});
 assert.throws(()=>parseMissingAnswers(['amount','date'],'99.00'));
});
test('pending drafts can be selected with simple running numbers',()=>{
 assert.deepEqual(parsePendingSelection('1 ค่าอาหาร',3),{index:0,answer:'ค่าอาหาร',cancel:false});
 assert.deepEqual(parsePendingSelection('รายการ 2',3),{index:1,answer:undefined,cancel:false});
 assert.deepEqual(parsePendingSelection('ยกเลิก 3',3),{index:2,answer:undefined,cancel:true});
 assert.equal(parsePendingSelection('4 ค่าอาหาร',3),null);
});
test('merchant matching ignores common company and spacing noise',()=>{
 assert.equal(normalizeMerchant('บริษัท ร้าน ABC จำกัด'),normalizeMerchant('abc'));
});
import {pairingMatches} from '../lib/access';
test('owner pairing requires an exact high-entropy code and rejects empty configuration',()=>{
 const code='0123456789abcdef01234567';assert.ok(pairingMatches('เชื่อมต่อ '+code,code));
 assert.equal(pairingMatches('เชื่อมต่อ other',code),false);assert.equal(pairingMatches('เชื่อมต่อ ',''),false);assert.equal(pairingMatches('เชื่อมต่อ 123','123'),false);
});
