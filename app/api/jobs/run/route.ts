import {after} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {drainJobs} from '@/lib/jobs';
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(request:Request){
 const secret=process.env.CRON_SECRET;
 const actual=Buffer.from(request.headers.get('authorization')||'');const expected=Buffer.from(`Bearer ${secret}`);
 if(!secret||actual.length!==expected.length||!timingSafeEqual(actual,expected))return new Response('Unauthorized',{status:401});
 after(async()=>{try{await drainJobs();}catch{console.error('Scheduled worker failed');}});
 return Response.json({accepted:true},{status:202});
}
