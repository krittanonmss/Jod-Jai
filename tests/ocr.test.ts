import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {readFile} from 'node:fs/promises';
import {recognizeSlip} from '../lib/ocr';import {normalizeSlip} from '../lib/domain';
const examples=[['S__47751172.jpg','paotang',2200,'2026-09-22T12:43:00.000Z'],['S__47751173.jpg','make',6000,'2026-09-21T14:35:00.000Z'],['S__47751174.jpg','bbl',9600,'2026-09-23T10:22:00.000Z'],['S__47751175.jpg','scb',200000,'2026-09-22T12:40:00.000Z']] as const;
for(const [file,provider,amount,date] of examples)test(`real local OCR: ${provider}`,{skip:!existsSync('example-slip/'+file)},async()=>{
 const result=await recognizeSlip(await readFile('example-slip/'+file));const d=normalizeSlip(result.slip);
 assert.equal(d.provider,provider);assert.equal(d.amount_satang,amount);assert.equal(d.occurred_at,date);assert.ok(d.recipient);assert.equal(d.description,null);
});

import sharp from 'sharp';import {slipQrHash} from '../lib/qr';
test('QR duplicate identity survives image resizing',{skip:!existsSync('example-slip/S__47751175.jpg')},async()=>{
 const original=await readFile('example-slip/S__47751175.jpg');
 const resized=await sharp(original).resize({width:700}).jpeg({quality:85}).toBuffer();
 const hash=await slipQrHash(original);assert.ok(hash);assert.equal(await slipQrHash(resized),hash);
});
