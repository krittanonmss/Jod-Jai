import {after} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {cleanupOldData,drainJobs} from '@/lib/jobs';
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(request:Request){
 const secret=process.env.CRON_SECRET;
 const actual=Buffer.from(request.headers.get('authorization')||'');const expected=Buffer.from(`Bearer ${secret}`);
 if(!secret||actual.length!==expected.length||!timingSafeEqual(actual,expected))return new Response('Unauthorized',{status:401});
 after(async()=>{try{await drainJobs();}catch{console.error('Scheduled worker failed');}});
 return Response.json({accepted:true},{status:202});
}
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 const actual=Buffer.from(request.headers.get('authorization')||'');const expected=Buffer.from(`Bearer ${secret}`);
 if(!secret||actual.length!==expected.length||!timingSafeEqual(actual,expected))return new Response('Unauthorized',{status:401});
 try {
  const dryRun=new URL(request.url).searchParams.get('dry_run')==='1';
  const cleanup=await cleanupOldData(dryRun);if(!dryRun)await drainJobs(30_000);
  return Response.json({ok:true,dry_run:dryRun,cleanup});
 }
 catch {return new Response('Maintenance failed',{status:503});}
}
