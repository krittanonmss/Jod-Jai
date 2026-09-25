import { createWorker, OEM, PSM } from 'tesseract.js';
import sharp from 'sharp';
import { mkdir, copyFile, access, constants } from 'node:fs/promises';
import path from 'node:path';
import { parseSlipText, parseDateLine } from './slip-parser';

// Vercel traces these packages into the function bundle under node_modules.
// Avoid createRequire().resolve(): webpack can fold the createRequire call away
// while leaving the later `.resolve()` access in a production server bundle.
const packagePath=(...parts:string[])=>path.join(process.cwd(),'node_modules',...parts);
type Rect=readonly [number,number,number,number];
const regions:Record<string,{date:Rect,amount:Rect,recipient:Rect}>={
 paotang:{date:[.10,.293,.78,.035],amount:[.73,.673,.20,.035],recipient:[.21,.46,.49,.036]},
 make:{date:[.035,.12,.45,.04],amount:[.035,.61,.38,.065],recipient:[.14,.39,.58,.055]},
 bbl:{date:[.28,.32,.44,.03],amount:[.35,.382,.30,.036],recipient:[.37,.545,.59,.059]},
 scb:{date:[.34,.24,.42,.025],amount:[.60,.596,.35,.034],recipient:[.60,.455,.36,.034]},
};
let langCacheReady=false;
async function ensureLangCache(){
  if(langCacheReady)return;
  const langPath='/tmp/jod-jai-ocr-languages';
  await mkdir(langPath,{recursive:true});
  await Promise.all(['tha','eng'].map(async code=>{
    const dest=path.join(langPath,`${code}.traineddata.gz`);
    try{await access(dest,constants.F_OK);}catch{
      await copyFile(packagePath('@tesseract.js-data',code,'4.0.0_best_int',`${code}.traineddata.gz`),dest);
    }
  }));
  langCacheReady=true;
}
export async function recognizeSlip(image:Buffer) {
  await ensureLangCache();
  const langPath='/tmp/jod-jai-ocr-languages';
  const worker=await createWorker('eng+tha',OEM.LSTM_ONLY,{
   langPath,workerPath:packagePath('tesseract.js','src','worker-script','node','index.js'),
   corePath:packagePath('tesseract.js-core'),
   cacheMethod:'none',logger:()=>{},errorHandler:()=>{},
  });
 try {
  const source=await sharp(image,{limitInputPixels:25_000_000}).rotate().png().toBuffer();
  const meta=await sharp(source).metadata();
  async function crop(rect:Rect,retry=false){
   let [x,y,w,h]=rect;
   if(retry){x=Math.max(0,x-w*.08);y=Math.max(0,y-h*.65);w=Math.min(1-x,w*1.16);h=Math.min(1-y,h*2.3);}
   let pipeline=sharp(source).extract({left:Math.round(meta.width!*x),top:Math.round(meta.height!*y),width:Math.max(1,Math.round(meta.width!*w)),height:Math.max(1,Math.round(meta.height!*h))}).resize({height:retry?180:110}).grayscale().normalize().sharpen();
   if(retry)pipeline=pipeline.threshold(175);
   return pipeline.png().toBuffer();
  }
  await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,preserve_interword_spaces:'1'});
  const prepared=await sharp(source).resize({width:1500}).png().toBuffer();
  const result=await worker.recognize(prepared);const slip=parseSlipText(result.data.text);
  if(slip.provider==='unsupported'){
   await worker.reinitialize('eng');await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
   await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_WORD});
   const header=(await worker.recognize(await crop([.405,.048,.215,.071]))).data.text;
   if(/SCB/.test(header))slip.provider='scb';
  }
  const r=regions[slip.provider];const debug:Record<string,string>={};
  if(r){
   await worker.reinitialize('eng+tha');await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE});
   let dateText=(await worker.recognize(await crop(r.date))).data.text;let parsed=parseDateLine(dateText);
   if(!parsed.date||!parsed.time){const retryText=(await worker.recognize(await crop(r.date,true))).data.text;dateText+=`\n${retryText}`;const retryParsed=parseDateLine(dateText);parsed={date:retryParsed.date||parsed.date,time:retryParsed.time||parsed.time};}
   debug.date=dateText;
   if(parsed.date)slip.date=parsed.date;if(parsed.time)slip.time=parsed.time;
   // Use the fixed amount region only if the labelled full-image amount was unreadable.
   if(!slip.amount){
    await worker.reinitialize('eng');await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE});
    const amountText=(await worker.recognize(await crop(r.amount))).data.text;debug.amount=amountText;
    const match=amountText.match(/^\s*(\d[\d,]*(?:\.\d{2})?)\s*(?:บาท|THB|[a-z]{1,4})?\s*$/i);
    if(match)slip.amount=match[1];
   }
   await worker.reinitialize('eng+tha');await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK});
   const recipientText=(await worker.recognize(await crop(r.recipient))).data.text.trim();debug.recipient=recipientText;
   if(recipientText && recipientText.length<200)slip.recipient=recipientText.split(/Biller ID/i)[0].replace(/\n/g,' ').replace(/^[^a-zA-Zก-๙]+/,'').replace(/([ก-๙])\s+(?=[ก-๙])/g,'$1').trim();
  }
  return {slip,text:result.data.text,confidence:result.data.confidence,debug};
 } finally {await worker.terminate();}
}
