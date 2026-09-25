import { z } from 'zod';

export const categories = ['อาหาร', 'เดินทาง', 'ซื้อของ', 'บิลและบริการ', 'สุขภาพ', 'อื่น ๆ'] as const;
export const slipSchema = z.object({
  provider: z.enum(['paotang', 'make', 'bbl', 'scb', 'unsupported']),
  amount: z.string().nullable(), grossAmount: z.string().nullable(), subsidy: z.string().nullable(),
  fee: z.string().nullable(), date: z.string().nullable(), time: z.string().nullable(),
  recipient: z.string().max(200).nullable(), reference: z.string().max(200).nullable(),
  note: z.string().max(500).nullable(),
});
export type Slip = z.infer<typeof slipSchema>;
export type Draft = {
  id: string; short_code: string; user_id: string; message_id: string;
  status: 'draft' | 'confirmed' | 'cancelled'; version: number;
  provider: string; amount_satang: number | null; gross_satang: number | null;
  subsidy_satang: number | null; fee_satang: number | null;
  occurred_at: string | null; recipient: string | null; reference: string | null;
  note: string | null; description: string | null; category: string;
  edit_field: string | null; image_hash: string; created_at: string;
};
export function satang(value: string | null): number | null {
  if (value === null) return null;
  const normalized = value.replace(/,/g, '').trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalized)) return null;
  const [baht, fraction = ''] = normalized.split('.');
  const amount = Number(baht) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) ? amount : null;
}
export function thaiDate(date: string | null, time: string | null): string | null {
  if (!date || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return null;
  let [year, month, day] = date.split('-').map(Number);
  if (year >= 2400) year -= 543;
  const [hour, minute, second = 0] = time.split(':').map(Number);
  if (year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return new Date(utc.getTime() - 7 * 3600000).toISOString();
}
export function inferCategory(description: string): string {
  if (/อาหาร|ข้าว|กาแฟ|ขนม|ของกิน|เครื่องดื่ม|ก๋วยเตี๋ยว/.test(description)) return 'อาหาร';
  if (/แท็กซี่|รถไฟ|รถเมล์|น้ำมัน|เดินทาง|ทางด่วน/.test(description)) return 'เดินทาง';
  if (/ค่าน้ำ|ค่าไฟ|อินเทอร์เน็ต|ค่าโทร|ค่าเช่า/.test(description)) return 'บิลและบริการ';
  if (/ยา|โรงพยาบาล|หมอ|รักษา/.test(description)) return 'สุขภาพ';
  if (/เสื้อ|รองเท้า|ซื้อของ/.test(description)) return 'ซื้อของ';
  return 'อื่น ๆ';
}
export function normalizeMerchant(value:string):string {
 return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9ก-๙]/g,'').replace(/(บริษัท|บจก|จ[ำํ]ากัด|ร้าน)/g,'');
}
export function normalizeSlip(slip: Slip) {
  const description = slip.note?.trim() || null;
  return {
    provider: slip.provider, amount_satang: satang(slip.amount), gross_satang: satang(slip.grossAmount),
    subsidy_satang: satang(slip.subsidy), fee_satang: satang(slip.fee),
    occurred_at: thaiDate(slip.date, slip.time), recipient: slip.recipient?.trim() || null,
    reference: slip.reference?.trim() || null, note: description, description,
    category: inferCategory(description || ''),
  };
}
export function missingField(draft: Draft): string | null {
  if (draft.amount_satang === null || draft.amount_satang <= 0) return 'amount';
  if (!draft.occurred_at) return 'date';
  if (!draft.recipient?.trim()) return 'recipient';
  return null;
}
export function getMissingFields(draft: Draft): string[] {
  const fields: string[] = [];
  if (draft.amount_satang === null || draft.amount_satang <= 0) fields.push('amount');
  if (!draft.occurred_at) fields.push('date');
  if (!draft.recipient?.trim()) fields.push('recipient');
  return fields;
}
export function money(amount: number): string {
  return (amount / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function displayDate(date: string): string {
  return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
}
export function parseAnswer(field: string, answer: string): Record<string, unknown> {
  answer = answer.trim();
  if (field === 'amount') {
    const n = satang(answer.replace(/\s*บาท$/, ''));
    if (!n || n <= 0) throw new Error('กรุณาพิมพ์ยอด เช่น 96.00');
    return { amount_satang: n };
  }
  if (field === 'date') {
    const [date, time] = answer.split(/\s+/); const value = thaiDate(date, time);
    if (!value) throw new Error('กรุณาพิมพ์วันที่และเวลา เช่น 2026-09-23 17:22 (เวลาไทย)');
    return { occurred_at: value };
  }
  if (field === 'category') {
    if (!(categories as readonly string[]).includes(answer)) throw new Error('เลือกหมวด: ' + categories.join(', '));
    return { category: answer };
  }
  if (field === 'recipient') {
    if (!answer || answer.length > 200) throw new Error('ชื่อผู้รับต้องมี 1–200 ตัวอักษร');
    return { recipient: answer };
  }
  if (!answer || answer.length > 500) throw new Error('รายละเอียดต้องมี 1–500 ตัวอักษร');
  return { description: answer, category: inferCategory(answer) };
}
export type PendingSelection={index:number;answer?:string;cancel:boolean};
export function parsePendingSelection(input:string,count:number):PendingSelection|null {
  const cancel=input.match(/^ยกเลิก\s+(?:รายการ\s*)?(\d{1,2})$/);
  const selected=input.match(/^(?:รายการ\s*)?(\d{1,2})(?:\s+([\s\S]+))?$/);
  const match=cancel||selected;if(!match)return null;
  const index=Number(match[1])-1;
  if(!Number.isInteger(index)||index<0||index>=count)return null;
  return {index,answer:cancel?undefined:selected?.[2]?.trim(),cancel:Boolean(cancel)};
}
