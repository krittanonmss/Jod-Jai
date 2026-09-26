export const EXPORT_PAGE_SIZE=1000;

export type ExportRow={
 id:string;occurred_at:string;amount_satang:number;category:string;description:string|null;
 recipient:string|null;provider:string|null;reference:string|null;created_at:string;confirmed_at:string;
};

export function csvCell(value:unknown):string {
 const raw=String(value??'');
 // Excel/Sheets also treat leading whitespace followed by a formula marker as active.
 const safe=/^[\t\r\n ]*[=+\-@]/.test(raw)?"'"+raw:raw;
 return `"${safe.replaceAll('"','""')}"`;
}

export function exportCsv(rows:ExportRow[]):string {
 const header=['วันเวลา','จำนวนเงิน (บาท)','หมวดหมู่','รายละเอียด','ผู้รับ','ผู้ให้บริการ','เลขอ้างอิง','สร้างเมื่อ','ยืนยันเมื่อ'];
 return '\uFEFF'+[
  header.map(csvCell).join(','),
  ...rows.map(row=>[row.occurred_at,(Number(row.amount_satang)/100).toFixed(2),row.category,row.description,row.recipient,row.provider,row.reference,row.created_at,row.confirmed_at].map(csvCell).join(',')),
 ].join('\r\n');
}
