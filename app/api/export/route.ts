import {createHash} from 'node:crypto';
import {db,assertDb} from '@/lib/db';
export const runtime='nodejs';

function csv(value:unknown):string {
 const raw=String(value??'');
 const safe=/^[=+\-@]/.test(raw)?"'"+raw:raw;
 return `"${safe.replaceAll('"','""')}"`;
}
export async function GET(request:Request){
 try {
  const token=new URL(request.url).searchParams.get('token')||'';
  if(!/^[a-f0-9]{48}$/.test(token))return new Response('ลิงก์ไม่ถูกต้อง',{status:400});
  const hash=createHash('sha256').update(token).digest('hex');
  const found=await db().from('jod_exports').select('user_id,expires_at').eq('token_hash',hash).maybeSingle();assertDb(found.error);
  if(!found.data||new Date(found.data.expires_at).getTime()<=Date.now())return new Response('ลิงก์หมดอายุแล้ว กรุณาขอส่งออกข้อมูลใหม่ใน LINE',{status:410});
  const records=await db().from('jod_drafts').select('occurred_at,amount_satang,category,description,recipient,provider,reference,created_at,confirmed_at').eq('user_id',found.data.user_id).eq('status','confirmed').order('occurred_at',{ascending:false});assertDb(records.error);
  const header=['วันเวลา','จำนวนเงิน (บาท)','หมวดหมู่','รายละเอียด','ผู้รับ','ผู้ให้บริการ','เลขอ้างอิง','สร้างเมื่อ','ยืนยันเมื่อ'];
  const lines=[header.map(csv).join(','),...(records.data||[]).map(row=>[
   row.occurred_at,(Number(row.amount_satang)/100).toFixed(2),row.category,row.description,row.recipient,row.provider,row.reference,row.created_at,row.confirmed_at,
  ].map(csv).join(','))];
  return new Response('\uFEFF'+lines.join('\r\n'),{headers:{
   'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="jod-jai-export.csv"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
  }});
 } catch {return new Response('ไม่สามารถส่งออกข้อมูลได้ในขณะนี้',{status:503});}
}
