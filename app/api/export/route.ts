import {createHash} from 'node:crypto';
import {db,assertDb} from '@/lib/db';
import {EXPORT_PAGE_SIZE,ExportRow,exportCsv} from '@/lib/export';
export const runtime='nodejs';

export async function GET(request:Request){
 try {
  const token=new URL(request.url).searchParams.get('token')||'';
  if(!/^[a-f0-9]{48}$/.test(token))return new Response('ลิงก์ไม่ถูกต้อง',{status:400});
  const hash=createHash('sha256').update(token).digest('hex');
  const rows:ExportRow[]=[];let cursorOccurred:string|null=null;let cursorId:string|null=null;
  while(true){
   const page=await db().rpc('jod_export_page',{p_hash:hash,p_cursor_occurred:cursorOccurred,p_cursor_id:cursorId,p_limit:EXPORT_PAGE_SIZE});assertDb(page.error);
   const batch=(page.data||[]) as ExportRow[];rows.push(...batch);
   if(batch.length<EXPORT_PAGE_SIZE)break;
   const last=batch[batch.length-1];cursorOccurred=last.occurred_at;cursorId=last.id;
  }
  // The RPC deliberately returns no rows for missing, expired, revoked, or cleared tokens.
  // A separate metadata lookup distinguishes a valid empty export without exposing its owner.
  const valid=await db().rpc('jod_export_token_valid',{p_hash:hash});assertDb(valid.error);
  if(valid.data!==true)return new Response('ลิงก์หมดอายุหรือถูกยกเลิกแล้ว กรุณาขอส่งออกข้อมูลใหม่ใน LINE',{status:410});
  return new Response(exportCsv(rows),{headers:{
   'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="jod-jai-export.csv"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
  }});
 } catch {return new Response('ไม่สามารถส่งออกข้อมูลได้ในขณะนี้',{status:503});}
}
