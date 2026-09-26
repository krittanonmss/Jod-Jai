import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {processEvent} from '../lib/bot';
import type {LineEvent} from '../lib/line';

process.loadEnvFile('.env.local');
const samples:number[]=[];
for(let index=0;index<30;index++){
 const event:LineEvent={webhookEventId:`benchmark-text-${randomUUID()}`,type:'message',timestamp:Date.now(),source:{type:'user',userId:'__benchmark_text__'},message:{id:randomUUID(),type:'text',text:'ช่วยเหลือ'}};
 const started=performance.now();const response=await processEvent(event);samples.push(performance.now()-started);
 if(!response.length)throw new Error('Empty benchmark response');
}
samples.sort((a,b)=>a-b);
const percentile=(p:number)=>samples[Math.min(samples.length-1,Math.ceil(samples.length*p)-1)];
console.log(JSON.stringify({samples:samples.length,median_ms:Number(percentile(.5).toFixed(1)),p95_ms:Number(percentile(.95).toFixed(1)),max_ms:Number(samples.at(-1)!.toFixed(1)),scope:'warm application processing plus one Supabase replay lookup; excludes LINE network delivery'},null,2));
