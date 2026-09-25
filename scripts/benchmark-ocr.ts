import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {recognizeSlip} from '../lib/ocr';
import {normalizeSlip} from '../lib/domain';

const manifest=await readFile('private-fixtures/manifest.md','utf8');
const allRows=[...manifest.matchAll(/^\| ([a-z]+-\d+) \| ([^|]+) \| ([^|]+) \| (\d+) \| ([^|]+) \|/gm)].map(match=>({
 id:match[1],file:match[2].trim(),provider:match[3].trim(),amount:Number(match[4]),occurredAt:match[5].trim(),
}));
const selected=process.env.OCR_PROVIDER?.toLowerCase();
const rows=selected?allRows.filter(row=>row.provider.toLowerCase()===selected):allRows;
if(!rows.length)throw new Error('Private fixture manifest is unavailable or empty.');
const totals=new Map<string,{samples:number;amount:number;date:number;recipient:number;unknown:number;ms:number[];failures:string[]}>();
for(const row of rows){
 const start=Date.now();const result=await recognizeSlip(await readFile(path.join('/home/krittanon/Downloads/slip',row.file)));const value=normalizeSlip(result.slip);const ms=Date.now()-start;
 const group=totals.get(row.provider)||{samples:0,amount:0,date:0,recipient:0,unknown:0,ms:[],failures:[]};
 const amountOk=value.amount_satang===row.amount;const dateOk=value.occurred_at!==null&&new Date(value.occurred_at).getTime()===new Date(row.occurredAt).getTime();
 group.samples++;group.amount+=Number(amountOk);group.date+=Number(dateOk);group.recipient+=Number(Boolean(value.recipient));group.unknown+=Number(!value.amount_satang||!value.occurred_at||!value.recipient);group.ms.push(ms);if(!amountOk||!dateOk)group.failures.push(`${row.id}:${[!amountOk?'amount':'',!dateOk?'date/time':''].filter(Boolean).join(',')}${process.env.OCR_DEBUG==='1'?` observed=${value.amount_satang??'unknown'}/${value.occurred_at??'unknown'}`:''}`);totals.set(row.provider,group);
}
const report=[...totals.entries()].map(([provider,value])=>({provider,...value,median_ms:value.ms.sort((a,b)=>a-b)[Math.floor(value.ms.length/2)],p95_ms:value.ms.sort((a,b)=>a-b)[Math.ceil(value.ms.length*.95)-1]}));
console.log(JSON.stringify({fixture_count:rows.length,providers:report,note:'Recipient is presence-only because canonical private names are intentionally not emitted.'},null,2));
