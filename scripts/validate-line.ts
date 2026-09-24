import {review,editMenu} from '../lib/messages';
import type {Draft} from '../lib/domain';
process.loadEnvFile('.env.local');
const draft={id:'07e061ac-f717-4297-a838-ffab91e24e33',short_code:'ABCDE12345',version:1,amount_satang:9600,occurred_at:'2026-09-23T10:22:00Z',description:'ตัวอย่าง',category:'อื่น ๆ',recipient:'ร้านตัวอย่าง',edit_field:null} as Draft;
const response=await fetch('https://api.line.me/v2/bot/message/validate/push',{method:'POST',headers:{Authorization:`Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({messages:[review(draft),editMenu(draft),review({...draft,description:null})]})});
if(!response.ok){console.log('LINE validation failed:',response.status,(await response.text()).slice(0,1000));process.exitCode=1;}else console.log('LINE validates confirmation cards, edit actions and follow-up questions. No messages sent.');
