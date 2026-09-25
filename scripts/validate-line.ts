import {review,editMenu,summaryCard,overviewCard,latestMenu,deleteRecordConfirm,clearHistoryConfirm,exportCard,pendingCarousel,managementMenu,moreMenu,personalDataMenu,text} from '../lib/messages';
import type {Draft} from '../lib/domain';
process.loadEnvFile('.env.local');
const draft={id:'07e061ac-f717-4297-a838-ffab91e24e33',short_code:'ABCDE12345',version:1,amount_satang:9600,occurred_at:'2026-09-23T10:22:00Z',description:'ตัวอย่าง English / ภาษาไทย '.repeat(8),category:'อื่น ๆ',recipient:'ร้านตัวอย่าง Mixed Name จำกัด',edit_field:null} as Draft;
const messages=[
 review(draft),editMenu(draft),review({...draft,description:null}),
 summaryCard({title:'สรุปวันนี้',period:'26 ก.ย. 2569',total:9600,count:1,rows:[{category:'อื่น ๆ',total_satang:9600}],recent:[draft],pending:10,average:9600}),
 overviewCard(9600,[draft],10,[{category:'อื่น ๆ',total_satang:9600}]),latestMenu(draft),deleteRecordConfirm(draft),clearHistoryConfirm(),
 exportCard('https://jod-jai.vercel.app/api/export?token=example',999),pendingCarousel(Array.from({length:10},(_,index)=>({...draft,id:`07e061ac-f717-4297-a838-ffab91e24e3${index}`,short_code:`ABCDE123${index}`}))),
 managementMenu(),moreMenu(),personalDataMenu(),text('ไม่มีรายการในช่วงนี้ครับ'),
];
for(let index=0;index<messages.length;index+=5){
 const response=await fetch('https://api.line.me/v2/bot/message/validate/push',{method:'POST',headers:{Authorization:`Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({messages:messages.slice(index,index+5)})});
 if(!response.ok){console.log('LINE validation failed for batch',index/5+1,response.status,(await response.text()).slice(0,1000));process.exitCode=1;break;}
}
if(!process.exitCode)console.log(`LINE validates ${messages.length} message variants across overview, review, edit, pending, delete, export, menus, long text, and empty states. No messages sent.`);
